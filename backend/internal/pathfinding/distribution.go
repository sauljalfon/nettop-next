package pathfinding

import (
	"fmt"
	"slices"
	"sort"
	"strings"

	"nettop.local/backend/internal/topology"
)

// traceDistribution implements "Find AGG / BB" for active starts. Each starting
// endpoint is searched independently over physical continuity (cables and
// same-position bridges). Switch endpoints have no internal links, so a search
// always stops at the first active endpoint it reaches: there is no transit
// through sibling ports, including AGG to BB.
//
// A destination is an endpoint of an aggregation or backbone device other than
// the starting device. In the source network it is a route; on another network
// it is a mismatch, reported separately and never as a route. Results are
// ordered by destination role (aggregation first), start endpoint, then
// destination endpoint, and capped at MaxRoutes.
func traceDistribution(result Result, s topology.Snapshot, ports map[string]topology.Endpoint, devices map[string]topology.Equipment, adj map[string][]Hop, req Request) (Result, error) {
	if req.End != "" {
		return result, fmt.Errorf("distribution search takes a starting device or endpoint only")
	}
	if (req.Start == "") == (req.Device == "") {
		return result, fmt.Errorf("distribution requires exactly one starting endpoint or device")
	}
	var starts []string
	var source topology.Equipment
	if req.Device != "" {
		device, ok := devices[req.Device]
		if !ok {
			return result, fmt.Errorf("unknown starting device")
		}
		if device.Kind != "switch" {
			return result, fmt.Errorf("distribution search starts from an active device")
		}
		source = device
		for _, p := range s.Endpoints {
			if p.EquipmentID == device.ID {
				starts = append(starts, p.ID)
			}
		}
	} else {
		p, ok := ports[req.Start]
		if !ok {
			return result, fmt.Errorf("unknown start endpoint")
		}
		owner := devices[p.EquipmentID]
		if owner.Kind != "switch" {
			return result, fmt.Errorf("passive starting ports are not supported yet")
		}
		source = owner
		starts = append(starts, p.ID)
	}
	sort.Strings(starts)

	var routes, mismatches []Route
	counts := map[string]int{}
	for _, start := range starts {
		found, mismatched := 0, 0
		for _, end := range reachable(start, adj) {
			destination := devices[ports[end.id].EquipmentID]
			if destination.ID == source.ID || (destination.Role != "aggregation" && destination.Role != "backbone") {
				continue
			}
			route := Route{
				Start: start, End: end.id, Hops: end.hops,
				DestinationEquipmentID: destination.ID, DestinationRole: destination.Role,
				DestinationNetworkID: destination.NetworkID, SourceNetworkID: source.NetworkID,
			}
			if destination.NetworkID == source.NetworkID {
				routes = append(routes, route)
				found++
			} else {
				mismatches = append(mismatches, route)
				mismatched++
			}
		}
		outcome := OutcomeNoDestination
		switch {
		case found > 0:
			outcome = OutcomeReached
		case mismatched > 0:
			outcome = OutcomeMismatch
		case !hasCable(start, adj):
			outcome = OutcomeDisconnected
		}
		counts[outcome]++
		result.Starts = append(result.Starts, StartOutcome{Endpoint: start, Outcome: outcome})
	}

	role := func(r Route) int {
		if r.DestinationRole == "aggregation" {
			return 0
		}
		return 1
	}
	sort.SliceStable(routes, func(i, j int) bool {
		if role(routes[i]) != role(routes[j]) {
			return role(routes[i]) < role(routes[j])
		}
		if routes[i].Start != routes[j].Start {
			return routes[i].Start < routes[j].Start
		}
		return routes[i].End < routes[j].End
	})
	sort.SliceStable(mismatches, func(i, j int) bool {
		if mismatches[i].Start != mismatches[j].Start {
			return mismatches[i].Start < mismatches[j].Start
		}
		return mismatches[i].End < mismatches[j].End
	})
	// Routes are kept before mismatches. Truncation only means results were
	// dropped: a limit is never reported as "unreachable".
	if len(routes) > MaxRoutes {
		result.Truncated = true
		routes = routes[:MaxRoutes]
	}
	if room := MaxRoutes - len(routes); len(mismatches) > room {
		result.Truncated = true
		mismatches = mismatches[:room]
	}
	result.Routes = append(result.Routes, routes...)
	result.Mismatches = append(result.Mismatches, mismatches...)
	if len(result.Routes) > 0 {
		result.Status = "reached"
	}
	result.Reason = distributionReason(result, counts, len(starts))
	return result, nil
}

type reached struct {
	id   string
	hops []Hop
}

// reachable runs one BFS from start. Each endpoint is visited at most once, so
// loops terminate. It returns every endpoint reached with its shortest hops,
// ordered by endpoint ID.
func reachable(start string, adj map[string][]Hop) []reached {
	visited := map[string]bool{start: true}
	parents := map[string]Hop{}
	queue := []string{start}
	for i := 0; i < len(queue); i++ {
		for _, hop := range adj[queue[i]] {
			if !visited[hop.To] {
				visited[hop.To] = true
				parents[hop.To] = hop
				queue = append(queue, hop.To)
			}
		}
	}
	out := make([]reached, 0, len(queue)-1)
	for _, id := range queue[1:] {
		var hops []Hop
		for current := id; current != start; current = parents[current].From {
			hops = append(hops, parents[current])
		}
		slices.Reverse(hops)
		out = append(out, reached{id, hops})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].id < out[j].id })
	return out
}

func hasCable(endpoint string, adj map[string][]Hop) bool {
	for _, hop := range adj[endpoint] {
		if hop.Kind == "cable" {
			return true
		}
	}
	return false
}

func distributionReason(r Result, counts map[string]int, searched int) string {
	var parts []string
	add := func(n int, text string) {
		if n > 0 {
			parts = append(parts, fmt.Sprintf("%d %s", n, text))
		}
	}
	if len(r.Routes) > 0 {
		reason := fmt.Sprintf("Found %d AGG/BB route(s) from %d of %d searched port(s); active equipment terminates each search.", len(r.Routes), counts[OutcomeReached], searched)
		if len(r.Mismatches) > 0 {
			reason += fmt.Sprintf(" %d destination(s) on another network are reported separately.", len(r.Mismatches))
		}
		if r.Truncated {
			reason += fmt.Sprintf(" Results were truncated at %d; more routes or mismatches exist.", MaxRoutes)
		}
		return reason
	}
	if searched == 0 {
		return "The starting device has no ports to search."
	}
	add(counts[OutcomeMismatch], "port(s) reached only a destination on another network")
	add(counts[OutcomeNoDestination], "port(s) end at a non-destination endpoint")
	add(counts[OutcomeDisconnected], "port(s) disconnected (no external cable)")
	reason := "No AGG or BB destination in the source network was reached: " + strings.Join(parts, ", ") + "."
	if r.Truncated {
		reason += fmt.Sprintf(" Mismatches were truncated at %d.", MaxRoutes)
	}
	return reason
}
