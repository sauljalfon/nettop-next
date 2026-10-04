package pathfinding

import (
	"fmt"
	"slices"
	"sort"
	"strings"

	"nettop.local/backend/internal/topology"
)

// traceDistribution implements "Find AGG / BB". Each starting endpoint (every
// port of an active device, or one exact device or panel/HDF port) is searched
// independently over physical continuity (cables and same-position bridges).
// Switch endpoints have no internal links, so a search always stops at the first
// active endpoint it reaches: there is no transit through sibling ports,
// including AGG to BB.
//
// A destination is an endpoint of an aggregation or backbone device other than
// the starting device. In the source network it is a route; on another network
// it is a mismatch, reported separately and never as a route.
//
// The source network of an active start is its device's network. A passive
// start (panel or HDF port) takes it from the access device found on the same
// circuit, in either direction. It is never taken from the panel, a name, or a
// guess: with no access device (or access devices that disagree) it is
// unresolved, every reached destination is a route carrying its own network and
// an empty sourceNetworkId, and the start outcome is unresolved_network.
//
// Results are ordered by destination role (aggregation first), start endpoint,
// then destination endpoint, and capped at MaxRoutes.
func traceDistribution(result Result, s topology.Snapshot, ports map[string]topology.Endpoint, devices map[string]topology.Equipment, adj map[string][]Hop, req Request) (Result, error) {
	if req.End != "" {
		return result, fmt.Errorf("distribution search takes a starting device or endpoint only")
	}
	if (req.Start == "") == (req.Device == "") {
		return result, fmt.Errorf("distribution requires exactly one starting endpoint or device")
	}
	var starts []string
	var source topology.Equipment // the active starting device; zero for a passive start
	passive := false
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
		if owner := devices[p.EquipmentID]; owner.Kind == "switch" {
			source = owner
		} else {
			passive = true
		}
		starts = append(starts, p.ID)
	}
	sort.Strings(starts)

	var routes, mismatches []Route
	counts := map[string]int{}
	withRoutes := 0 // ports that produced at least one route, whatever their outcome
	for _, start := range starts {
		circuit := reachable(start, adj)
		sourceNetwork, resolved := source.NetworkID, true
		if passive {
			sourceNetwork, resolved = circuitNetwork(circuit, ports, devices)
		}
		found, mismatched, cabled := 0, 0, false
		for _, end := range circuit {
			cabled = cabled || slices.ContainsFunc(end.hops, func(h Hop) bool { return h.Kind == "cable" })
			destination := devices[ports[end.id].EquipmentID]
			if destination.ID == source.ID || (destination.Role != "aggregation" && destination.Role != "backbone") {
				continue
			}
			route := Route{
				Start: start, End: end.id, Hops: end.hops,
				DestinationEquipmentID: destination.ID, DestinationRole: destination.Role,
				DestinationNetworkID: destination.NetworkID, SourceNetworkID: sourceNetwork,
			}
			if !resolved || destination.NetworkID == sourceNetwork {
				routes = append(routes, route)
				found++
			} else {
				mismatches = append(mismatches, route)
				mismatched++
			}
		}
		outcome := OutcomeNoDestination
		switch {
		case !cabled:
			outcome = OutcomeDisconnected // nothing external to resolve or reach
		case !resolved:
			outcome = OutcomeUnresolvedNetwork
		case found > 0:
			outcome = OutcomeReached
		case mismatched > 0:
			outcome = OutcomeMismatch
		}
		counts[outcome]++
		if found > 0 {
			withRoutes++
		}
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
	result.Reason = distributionReason(result, counts, withRoutes, len(starts))
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

// circuitNetwork resolves a passive start's source network from the access
// devices found on its circuit (a circuit has at most two ends). It is resolved
// only when at least one access device is present and all of them share one
// network; otherwise nothing is guessed.
func circuitNetwork(circuit []reached, ports map[string]topology.Endpoint, devices map[string]topology.Equipment) (string, bool) {
	network := ""
	for _, end := range circuit {
		device := devices[ports[end.id].EquipmentID]
		if device.Role != "access" {
			continue
		}
		if network != "" && network != device.NetworkID {
			return "", false
		}
		network = device.NetworkID
	}
	return network, network != ""
}

func distributionReason(r Result, counts map[string]int, withRoutes, searched int) string {
	var parts []string
	add := func(n int, text string) {
		if n > 0 {
			parts = append(parts, fmt.Sprintf("%d %s", n, text))
		}
	}
	if len(r.Routes) > 0 {
		reason := fmt.Sprintf("Found %d AGG/BB route(s) from %d of %d searched port(s); active equipment terminates each search.", len(r.Routes), withRoutes, searched)
		if len(r.Mismatches) > 0 {
			reason += fmt.Sprintf(" %d destination(s) on another network are reported separately.", len(r.Mismatches))
		}
		if counts[OutcomeUnresolvedNetwork] > 0 {
			reason += fmt.Sprintf(" %d port(s) have no single access device on their circuit, so their source network is unresolved and each destination shows its own network.", counts[OutcomeUnresolvedNetwork])
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
	add(counts[OutcomeUnresolvedNetwork], "port(s) have an unresolved source network (no single access device on their circuit) and reached no destination")
	add(counts[OutcomeNoDestination], "port(s) end at a non-destination endpoint")
	add(counts[OutcomeDisconnected], "port(s) disconnected (no external cable)")
	reason := "No AGG or BB destination in the source network was reached: " + strings.Join(parts, ", ") + "."
	if r.Truncated {
		reason += fmt.Sprintf(" Mismatches were truncated at %d.", MaxRoutes)
	}
	return reason
}
