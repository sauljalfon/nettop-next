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
	// Distribution-mode metadata (omitted for point-to-point).
	DestinationEquipmentID string `json:"destinationEquipmentId,omitempty"`
	DestinationRole        string `json:"destinationRole,omitempty"`
	DestinationNetworkID   string `json:"destinationNetworkId,omitempty"`
	SourceNetworkID        string `json:"sourceNetworkId,omitempty"`
}

// MaxRoutes caps routes plus mismatches in one distribution result.
const MaxRoutes = 1000

// Start outcomes of a distribution search, one per searched endpoint.
const (
	OutcomeReached           = "reached"
	OutcomeMismatch          = "mismatch"
	OutcomeNoDestination     = "no_destination"
	OutcomeDisconnected      = "disconnected"
	OutcomeUnresolvedNetwork = "unresolved_network"
)

type StartOutcome struct {
	Endpoint string `json:"endpoint"`
	Outcome  string `json:"outcome"`
}
type Result struct {
	Context  string  `json:"context"`
	Revision string  `json:"revision"`
	Mode     string  `json:"mode"`
	Status   string  `json:"status"`
	Reason   string  `json:"reason"`
	Routes   []Route `json:"routes"`
	// Mismatches are reached AGG/BB endpoints on another network; never routes.
	Mismatches []Route        `json:"mismatches"`
	Starts     []StartOutcome `json:"starts"`
	Truncated  bool           `json:"truncated"`
}

// Trace searches physical continuity only; device sibling ports never create
// edges. Modes: "point_to_point" (two exact endpoints) and "distribution" (Find
// AGG / BB from an active device or one exact port). Results are deterministic.
func Trace(s topology.Snapshot, req Request) (Result, error) {
	result := Result{Context: s.Context, Revision: s.Revision, Mode: req.Mode, Status: "unreachable", Routes: []Route{}, Mismatches: []Route{}, Starts: []StartOutcome{}}
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
	switch req.Mode {
	case "distribution":
		return traceDistribution(result, s, ports, devices, adj, req)
	case "point_to_point":
		return tracePointToPoint(result, ports, adj, req)
	default:
		return result, fmt.Errorf("mode must be point_to_point or distribution")
	}
}

// tracePointToPoint returns the shortest physical route between two exact
// endpoints. Identical endpoints give a zero-hop route. Cable order carries no
// direction, so a reversed request yields the mirrored route.
func tracePointToPoint(result Result, ports map[string]topology.Endpoint, adj map[string][]Hop, req Request) (Result, error) {
	if req.Device != "" {
		return result, fmt.Errorf("point-to-point requires endpoints only")
	}
	if _, ok := ports[req.Start]; !ok {
		return result, fmt.Errorf("unknown start endpoint")
	}
	if _, ok := ports[req.End]; !ok {
		return result, fmt.Errorf("unknown destination endpoint")
	}
	if req.Start == req.End {
		result.Routes = append(result.Routes, Route{Start: req.Start, End: req.End, Hops: []Hop{}})
	}
	for _, end := range reachable(req.Start, adj) {
		if end.id == req.End {
			result.Routes = append(result.Routes, Route{Start: req.Start, End: end.id, Hops: end.hops})
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
