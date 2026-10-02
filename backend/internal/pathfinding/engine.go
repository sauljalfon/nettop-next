package pathfinding

import (
	"fmt"
	"nettop.local/backend/internal/topology"
	"sort"
)

type Request struct {
	Mode   string `json:"mode"`
	Start  string `json:"start,omitempty"`
	End    string `json:"end,omitempty"`
	Device string `json:"device,omitempty"`
}
type Hop struct {
	LinkID string `json:"linkId"`
	From   string `json:"from"`
	To     string `json:"to"`
	Kind   string `json:"kind"`
}
type Route struct {
	Start string `json:"start"`
	End   string `json:"end"`
	Hops  []Hop  `json:"hops"`
}
type Result struct {
	Context  string  `json:"context"`
	Revision string  `json:"revision"`
	Mode     string  `json:"mode"`
	Status   string  `json:"status"`
	Reason   string  `json:"reason"`
	Routes   []Route `json:"routes"`
}

// Trace searches physical continuity only; device sibling ports never create edges.
// Each BFS returns a shortest route per target, with deterministic start/target ordering.
func Trace(s topology.Snapshot, req Request) (Result, error) {
	result := Result{Context: s.Context, Revision: s.Revision, Mode: req.Mode, Status: "unreachable", Routes: []Route{}}
	if err := topology.Validate(s); err != nil {
		return result, err
	}
	ports := map[string]topology.Endpoint{}
	devices := map[string]topology.Equipment{}
	adj := map[string][]Hop{}
	for _, e := range s.Equipment {
		devices[e.ID] = e
	}
	for _, p := range s.Endpoints {
		ports[p.ID] = p
	}
	for _, l := range s.Links {
		adj[l.A] = append(adj[l.A], Hop{LinkID: l.ID, From: l.A, To: l.B, Kind: l.Kind})
		adj[l.B] = append(adj[l.B], Hop{LinkID: l.ID, From: l.B, To: l.A, Kind: l.Kind})
	}
	for id := range adj {
		sort.Slice(adj[id], func(i, j int) bool { return adj[id][i].To < adj[id][j].To })
	}
	starts := []string{}
	targets := []string{}
	switch req.Mode {
	case "point_to_point":
		if req.Device != "" {
			return result, fmt.Errorf("point-to-point requires endpoints only")
		}
		if _, ok := ports[req.Start]; !ok {
			return result, fmt.Errorf("unknown start endpoint")
		}
		if _, ok := ports[req.End]; !ok {
			return result, fmt.Errorf("unknown destination endpoint")
		}
		starts = append(starts, req.Start)
		targets = append(targets, req.End)
	case "aggregation":
		if req.End != "" || (req.Start == "") == (req.Device == "") {
			return result, fmt.Errorf("aggregation requires exactly one starting endpoint or device")
		}
		startDevice := req.Device
		if req.Start != "" {
			p, ok := ports[req.Start]
			if !ok {
				return result, fmt.Errorf("unknown start endpoint")
			}
			startDevice = p.EquipmentID
			starts = append(starts, req.Start)
		} else {
			if _, ok := devices[req.Device]; !ok {
				return result, fmt.Errorf("unknown starting device")
			}
			for _, p := range s.Endpoints {
				if p.EquipmentID == req.Device {
					starts = append(starts, p.ID)
				}
			}
		}
		for _, p := range s.Endpoints {
			if devices[p.EquipmentID].Role == "aggregation" && p.EquipmentID != startDevice {
				targets = append(targets, p.ID)
			}
		}
	default:
		return result, fmt.Errorf("mode must be point_to_point or aggregation")
	}
	sort.Strings(starts)
	sort.Strings(targets)
	for _, start := range starts {
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
		for _, end := range targets {
			if !visited[end] {
				continue
			}
			hops := []Hop{}
			for current := end; current != start; {
				hop := parents[current]
				hops = append(hops, hop)
				current = hop.From
			}
			for i, j := 0, len(hops)-1; i < j; i, j = i+1, j-1 {
				hops[i], hops[j] = hops[j], hops[i]
			}
			result.Routes = append(result.Routes, Route{Start: start, End: end, Hops: hops})
		}
	}
	if len(result.Routes) > 0 {
		result.Status = "reached"
		result.Reason = "Physical continuity found; no transit through sibling device ports."
	} else {
		result.Reason = "No physical continuity to the requested destination. Check disconnected endpoints and panel bridges; switch ports are terminal."
	}
	return result, nil
}
