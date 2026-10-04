package pathfinding_test

import (
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/topology"
)

// at finds a panel or HDF endpoint by its structured identity (owner, optional
// "3C"-style subpanel, position, side), never by parsing IDs.
func at(t *testing.T, s topology.Snapshot, equipment, subpanel string, position int, side string) string {
	t.Helper()
	sp := ""
	if subpanel != "" {
		var row int
		fmt.Sscanf(subpanel[:len(subpanel)-1], "%d", &row)
		column := subpanel[len(subpanel)-1:]
		for _, candidate := range s.Subpanels {
			if candidate.EquipmentID == equipment && candidate.Row == row && candidate.Column == column {
				sp = candidate.ID
			}
		}
		if sp == "" {
			t.Fatalf("%s has no subpanel %s", equipment, subpanel)
		}
	}
	for _, p := range s.Endpoints {
		if p.EquipmentID == equipment && p.SubpanelID == sp && p.Position == position && p.Side == side {
			return p.ID
		}
	}
	t.Fatalf("no endpoint %s %s/%d %s", equipment, subpanel, position, side)
	return ""
}

// extended is the acceptance fixture plus one extra route that alternates
// front→rear and rear→front through four passive positions (PANEL-A 10,
// HDF-01 4A/1, HDF-02 1A/1, PANEL-DR 10): five cables and four bridges.
// Network A's EDGE-30 reaches AGG-30; nothing else in the fixture changes.
func extended(t *testing.T) (topology.Snapshot, []string) {
	t.Helper()
	s := clone(acceptance.Installed())
	s.Equipment = append(s.Equipment,
		topology.Equipment{ID: "edge-30", Name: "EDGE-30", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 9, Height: 1},
		topology.Equipment{ID: "agg-30", Name: "AGG-30", Kind: "switch", Role: "aggregation", NetworkID: "net-a", RackID: "rack-core-03", Unit: 6, Height: 1})
	for _, id := range []string{"edge-30", "agg-30"} {
		s.Endpoints = append(s.Endpoints, topology.Endpoint{ID: id + ":p1", EquipmentID: id}, topology.Endpoint{ID: id + ":p2", EquipmentID: id})
	}
	p1f, p1r := at(t, s, "panel-a", "", 10, "front"), at(t, s, "panel-a", "", 10, "rear")
	p2f, p2r := at(t, s, "hdf-01", "4A", 1, "front"), at(t, s, "hdf-01", "4A", 1, "rear")
	p3f, p3r := at(t, s, "hdf-02", "1A", 1, "front"), at(t, s, "hdf-02", "1A", 1, "rear")
	p4f, p4r := at(t, s, "panel-dr", "", 10, "front"), at(t, s, "panel-dr", "", 10, "rear")
	for i, c := range [][2]string{{"edge-30:p1", p1f}, {p1r, p2r}, {p2f, p3f}, {p3r, p4r}, {p4f, "agg-30:p1"}} {
		s.Links = append(s.Links, topology.Link{ID: fmt.Sprintf("cable-x%d", i+1), A: c[0], B: c[1], Kind: "cable"})
	}
	if err := topology.Validate(s); err != nil {
		t.Fatal(err)
	}
	// The chain in physical order, end to end.
	return s, []string{"edge-30:p1", p1f, p1r, p2r, p2f, p3f, p3r, p4r, p4f, "agg-30:p1"}
}

// hopsAlong asserts a route follows chain[from:to+1] hop by hop, in either direction.
func hopsAlong(t *testing.T, s topology.Snapshot, hops []pathfinding.Hop, chain []string) {
	t.Helper()
	if len(hops) != len(chain)-1 {
		t.Fatalf("%d hops, want %d", len(hops), len(chain)-1)
	}
	owner := map[string]string{}
	for _, p := range s.Endpoints {
		owner[p.ID] = p.EquipmentID
	}
	for i, h := range hops {
		if h.From != chain[i] || h.To != chain[i+1] {
			t.Fatalf("hop %d goes %s → %s, want %s → %s", i, h.From, h.To, chain[i], chain[i+1])
		}
		wantKind := "cable"
		if owner[h.From] == owner[h.To] {
			wantKind = "internal"
		}
		if h.Kind != wantKind {
			t.Fatalf("hop %d is %s, want %s", i, h.Kind, wantKind)
		}
	}
}

func kinds(hops []pathfinding.Hop) []string {
	out := []string{}
	for _, h := range hops {
		out = append(out, h.Kind)
	}
	return out
}

// P11: alternating front→rear and rear→front passive positions are traversed in
// order with five cables and four bridges, from active and passive starts alike.
func TestFourAlternatingPassivePositionsAreTraversedInOrder(t *testing.T) {
	s, chain := extended(t)
	r := distribution(t, s, pathfinding.Request{Device: "edge-30"})
	if !reflect.DeepEqual(summary(r.Routes), []string{"aggregation agg-30:p1<-edge-30:p1"}) {
		t.Fatalf("routes = %v", summary(r.Routes))
	}
	hopsAlong(t, s, r.Routes[0].Hops, chain)
	want := []string{"cable", "internal", "cable", "internal", "cable", "internal", "cable", "internal", "cable"}
	if !reflect.DeepEqual(kinds(r.Routes[0].Hops), want) {
		t.Fatalf("hop kinds = %v", kinds(r.Routes[0].Hops))
	}
	var cableIDs []string
	for _, h := range r.Routes[0].Hops {
		if h.Kind == "cable" {
			cableIDs = append(cableIDs, h.LinkID)
		}
	}
	if !reflect.DeepEqual(cableIDs, []string{"cable-x1", "cable-x2", "cable-x3", "cable-x4", "cable-x5"}) {
		t.Fatalf("cables = %v", cableIDs)
	}
	// Every passive position/side along the chain finds the same AGG, resolves
	// Network A from the access device at the other end, and keeps exact hops.
	for i := 1; i <= 8; i++ {
		r := distribution(t, s, pathfinding.Request{Start: chain[i]})
		if !reflect.DeepEqual(summary(r.Routes), []string{"aggregation agg-30:p1<-" + chain[i]}) {
			t.Fatalf("start %s: routes %v", chain[i], summary(r.Routes))
		}
		route := r.Routes[0]
		if route.SourceNetworkID != "net-a" || route.DestinationNetworkID != "net-a" || outcomes(r)[chain[i]] != pathfinding.OutcomeReached {
			t.Fatalf("start %s: %+v outcomes %v", chain[i], route, r.Starts)
		}
		hopsAlong(t, s, route.Hops, chain[i:])
	}
	// The original acceptance routes are untouched by the extra circuit.
	base := distribution(t, s, pathfinding.Request{Device: "edge-17"})
	if len(base.Routes) != 3 || len(base.Mismatches) != 0 {
		t.Fatalf("the extension disturbed EDGE-17: %v", summary(base.Routes))
	}
}

// P09: a panel's front/rear continuity is a valid passive bridge, counted as a hop.
func TestPanelStartCountsTheInternalBridge(t *testing.T) {
	s := acceptance.Installed()
	front := distribution(t, s, pathfinding.Request{Start: at(t, s, "panel-a", "", 1, "front")})
	if !reflect.DeepEqual(summary(front.Routes), []string{"aggregation agg-03:p1<-panel-a:1:f"}) {
		t.Fatalf("routes = %v", summary(front.Routes))
	}
	r := front.Routes[0]
	if !reflect.DeepEqual(kinds(r.Hops), []string{"internal", "cable", "internal", "cable", "internal", "cable"}) || r.Hops[0].From != "panel-a:1:f" || r.Hops[0].To != "panel-a:1:r" {
		t.Fatalf("PANEL-A 1 front: the first hop must be its own bridge: %v", kinds(r.Hops))
	}
	if r.SourceNetworkID != "net-a" {
		t.Fatalf("the network comes from EDGE-17 one cable away: %q", r.SourceNetworkID)
	}
	rear := distribution(t, s, pathfinding.Request{Start: at(t, s, "panel-a", "", 1, "rear")})
	if len(rear.Routes) != 1 || len(rear.Routes[0].Hops) != 5 || rear.Routes[0].Hops[0].LinkID != "cable-a02" {
		t.Fatalf("PANEL-A 1 rear: %+v", rear.Routes)
	}
}

// The HDF starts from the design: 3C/5 resolves Network A and reaches AGG-03;
// 3C/2 resolves Network B and reaches AGG-12.
func TestHDFStartsResolveTheirOwnCircuitsNetwork(t *testing.T) {
	s := acceptance.Installed()
	rear := distribution(t, s, pathfinding.Request{Start: at(t, s, "hdf-01", "3C", 5, "rear")})
	if rear.Status != "reached" || len(rear.Routes) != 1 || len(rear.Mismatches) != 0 || len(rear.Starts) != 1 {
		t.Fatalf("3C/5 rear: %+v", rear)
	}
	r := rear.Routes[0]
	if r.End != "agg-03:p1" || r.DestinationEquipmentID != "agg-03" || r.DestinationRole != "aggregation" || r.SourceNetworkID != "net-a" || r.DestinationNetworkID != "net-a" {
		t.Fatalf("3C/5 rear route: %+v", r)
	}
	// 3C/5 rear → 3C/5 front (bridge) → A03 → HDF-02 2B/3 front → bridge → rear → A04 → AGG-03.
	wantEnds := []string{at(t, s, "hdf-01", "3C", 5, "front"), at(t, s, "hdf-02", "2B", 3, "front"), at(t, s, "hdf-02", "2B", 3, "rear"), "agg-03:p1"}
	var got []string
	for _, h := range r.Hops {
		got = append(got, h.To)
	}
	if !reflect.DeepEqual(got, wantEnds) || !reflect.DeepEqual(kinds(r.Hops), []string{"internal", "cable", "internal", "cable"}) || r.Hops[1].LinkID != "cable-a03" || r.Hops[3].LinkID != "cable-a04" {
		t.Fatalf("3C/5 rear hops: %v %v", got, kinds(r.Hops))
	}
	if outcomes(rear)[at(t, s, "hdf-01", "3C", 5, "rear")] != pathfinding.OutcomeReached {
		t.Fatalf("outcome = %v", rear.Starts)
	}
	front := distribution(t, s, pathfinding.Request{Start: at(t, s, "hdf-01", "3C", 5, "front")})
	if len(front.Routes) != 1 || front.Routes[0].End != "agg-03:p1" || len(front.Routes[0].Hops) != 3 || front.Routes[0].SourceNetworkID != "net-a" {
		t.Fatalf("3C/5 front: %+v", front.Routes)
	}

	b := distribution(t, s, pathfinding.Request{Start: at(t, s, "hdf-01", "3C", 2, "front")})
	if len(b.Routes) != 1 || len(b.Mismatches) != 0 {
		t.Fatalf("3C/2: %+v", b)
	}
	rb := b.Routes[0]
	if rb.End != "agg-12:p1" || rb.DestinationEquipmentID != "agg-12" || rb.SourceNetworkID != "net-b" || rb.DestinationNetworkID != "net-b" || len(rb.Hops) != 3 || rb.Hops[0].LinkID != "cable-b03" || rb.Hops[2].LinkID != "cable-b04" {
		t.Fatalf("3C/2 route: %+v", rb)
	}
}

// P10: network labels and neighboring positions are never bridges.
func TestNeighboringPositionsAndNetworkLabelsAreNotBridges(t *testing.T) {
	s := acceptance.Installed()
	a := distribution(t, s, pathfinding.Request{Start: at(t, s, "hdf-01", "3C", 5, "front")})
	b := distribution(t, s, pathfinding.Request{Start: at(t, s, "hdf-01", "3C", 2, "front")})
	seen := map[string]bool{}
	for _, h := range a.Routes[0].Hops {
		seen[h.From], seen[h.To] = true, true
	}
	for _, h := range b.Routes[0].Hops {
		if seen[h.From] || seen[h.To] {
			t.Fatalf("the Network A and B circuits share %s/%s", h.From, h.To)
		}
	}
	// 3D/5 (same row, other column), 4C/5 (other row), and 3C/6 are configured but unused.
	for _, spec := range []struct {
		subpanel string
		position int
	}{{"3D", 5}, {"4C", 5}, {"3C", 6}} {
		for _, side := range []string{"front", "rear"} {
			id := at(t, s, "hdf-01", spec.subpanel, spec.position, side)
			r := distribution(t, s, pathfinding.Request{Start: id})
			if r.Status != "unreachable" || len(r.Routes) != 0 || outcomes(r)[id] != pathfinding.OutcomeDisconnected {
				t.Fatalf("%s/%d %s must be an unused, disconnected position: %+v", spec.subpanel, spec.position, side, r)
			}
		}
	}
}

// The BB route is checked cable by cable (A09–A12), from the access device and
// from a passive position on the route.
func TestBB01RouteUsesExactlyCablesA09ToA12(t *testing.T) {
	s := acceptance.Installed()
	r := distribution(t, s, pathfinding.Request{Device: "edge-17"})
	var bb pathfinding.Route
	for _, route := range r.Routes {
		if route.DestinationEquipmentID == "bb-01" {
			bb = route
		}
	}
	if bb.DestinationRole != "backbone" || bb.Start != "edge-17:p3" || bb.End != "bb-01:p1" {
		t.Fatalf("BB route = %+v", bb)
	}
	wantEnds := []string{
		"panel-a:3:f", "panel-a:3:r", at(t, s, "hdf-01", "2D", 4, "rear"), at(t, s, "hdf-01", "2D", 4, "front"),
		at(t, s, "hdf-02", "3A", 1, "front"), at(t, s, "hdf-02", "3A", 1, "rear"), "bb-01:p1",
	}
	var ends, cables []string
	for _, h := range bb.Hops {
		ends = append(ends, h.To)
		if h.Kind == "cable" {
			cables = append(cables, h.LinkID)
		}
	}
	if !reflect.DeepEqual(cables, []string{"cable-a09", "cable-a10", "cable-a11", "cable-a12"}) || !reflect.DeepEqual(ends, wantEnds) {
		t.Fatalf("BB route cables %v ends %v", cables, ends)
	}
	mid := distribution(t, s, pathfinding.Request{Start: at(t, s, "hdf-01", "2D", 4, "front")})
	if len(mid.Routes) != 1 || mid.Routes[0].DestinationRole != "backbone" || mid.Routes[0].SourceNetworkID != "net-a" {
		t.Fatalf("passive start on the BB route: %+v", mid)
	}
	cables = nil
	for _, h := range mid.Routes[0].Hops {
		if h.Kind == "cable" {
			cables = append(cables, h.LinkID)
		}
	}
	if !reflect.DeepEqual(cables, []string{"cable-a11", "cable-a12"}) {
		t.Fatalf("cables from the middle of the BB route = %v", cables)
	}
}

// P17: a passive start never takes a network from a panel or a name. With no
// access device on the circuit the source network is unresolved, results carry
// the destination's own network, and the outcome says so.
func TestCircuitsWithoutAnAccessDeviceHaveAnUnresolvedSourceNetwork(t *testing.T) {
	// EDGE-17's cable removed: the AGG-03 side still reaches HDF-01 3C/5.
	s := without(acceptance.Installed(), "cable-a01")
	start := at(t, s, "hdf-01", "3C", 5, "rear")
	r := distribution(t, s, pathfinding.Request{Start: start})
	if r.Status != "reached" || len(r.Routes) != 1 || len(r.Mismatches) != 0 {
		t.Fatalf("results must still be returned: %+v", r)
	}
	if got := r.Routes[0]; got.End != "agg-03:p1" || got.SourceNetworkID != "" || got.DestinationNetworkID != "net-a" || got.DestinationRole != "aggregation" {
		t.Fatalf("unresolved route fields wrong: %+v", got)
	}
	if outcomes(r)[start] != pathfinding.OutcomeUnresolvedNetwork || !strings.Contains(r.Reason, "unresolved") {
		t.Fatalf("outcome = %v reason = %q", r.Starts, r.Reason)
	}

	// A dead end on both sides: no destination and no source: unreachable, explained.
	s = without(without(acceptance.Installed(), "cable-a01"), "cable-a04")
	r = distribution(t, s, pathfinding.Request{Start: start})
	if r.Status != "unreachable" || len(r.Routes) != 0 || outcomes(r)[start] != pathfinding.OutcomeUnresolvedNetwork || !strings.Contains(r.Reason, "unresolved") {
		t.Fatalf("dead-end circuit: %s %v %q", r.Status, r.Starts, r.Reason)
	}

	// A completely uncabled position is disconnected, not an unresolved network.
	free := at(t, s, "hdf-01", "4D", 6, "front")
	if r := distribution(t, s, pathfinding.Request{Start: free}); outcomes(r)[free] != pathfinding.OutcomeDisconnected {
		t.Fatalf("uncabled position outcome = %v", r.Starts)
	}
}

func TestPanelNamesNeverSupplyANetwork(t *testing.T) {
	// AGG on A and BB on B joined through a panel named for Network B.
	b := newBuilder().sw("aggx", "aggregation", "a", 1).sw("bbx", "backbone", "b", 1).panel("network-b-panel", 1).
		cable("aggx:p1", "network-b-panel:1:f").cable("network-b-panel:1:r", "bbx:p1")
	b.s.Equipment[2].Name = "NETWORK B"
	r := distribution(t, b.s, pathfinding.Request{Start: "network-b-panel:1:f"})
	if !reflect.DeepEqual(summary(r.Routes), []string{"aggregation aggx:p1<-network-b-panel:1:f", "backbone bbx:p1<-network-b-panel:1:f"}) {
		t.Fatalf("with no source device every reached destination is a route: %v", summary(r.Routes))
	}
	for _, route := range r.Routes {
		if route.SourceNetworkID != "" {
			t.Fatalf("a network was invented: %+v", route)
		}
	}
	if r.Routes[0].DestinationNetworkID != "a" || r.Routes[1].DestinationNetworkID != "b" || len(r.Mismatches) != 0 || outcomes(r)["network-b-panel:1:f"] != pathfinding.OutcomeUnresolvedNetwork {
		t.Fatalf("destinations must keep their own networks: %+v %v", r.Routes, r.Starts)
	}
	// Two access devices on different networks never pick a winner.
	b = newBuilder().sw("ea", "access", "a", 1).sw("eb", "access", "b", 1).panel("pnl", 1).
		cable("ea:p1", "pnl:1:f").cable("pnl:1:r", "eb:p1")
	r = distribution(t, b.s, pathfinding.Request{Start: "pnl:1:f"})
	if outcomes(r)["pnl:1:f"] != pathfinding.OutcomeUnresolvedNetwork || len(r.Routes) != 0 {
		t.Fatalf("disagreeing access devices: %+v", r)
	}
}

func TestPassiveStartMismatchAndMatch(t *testing.T) {
	b := newBuilder().sw("ea", "access", "a", 1).panel("pnl", 1).sw("aggb", "aggregation", "b", 1).
		cable("ea:p1", "pnl:1:f").cable("pnl:1:r", "aggb:p1")
	r := distribution(t, b.s, pathfinding.Request{Start: "pnl:1:r"})
	if r.Status != "unreachable" || len(r.Routes) != 0 || len(r.Mismatches) != 1 || outcomes(r)["pnl:1:r"] != pathfinding.OutcomeMismatch {
		t.Fatalf("a destination on another network is a mismatch: %+v", r)
	}
	if m := r.Mismatches[0]; m.SourceNetworkID != "a" || m.DestinationNetworkID != "b" || m.Start != "pnl:1:r" {
		t.Fatalf("mismatch fields: %+v", m)
	}
}

// P12: cable order never creates direction; reverse input gives the same continuity.
func TestCableEndpointOrderAndReverseTracesAgree(t *testing.T) {
	s, chain := extended(t)
	flipped := clone(s)
	for i := range flipped.Links {
		flipped.Links[i].A, flipped.Links[i].B = flipped.Links[i].B, flipped.Links[i].A
	}
	slices.Reverse(flipped.Links)
	for _, req := range []pathfinding.Request{{Device: "edge-30"}, {Device: "edge-17"}, {Start: chain[4]}, {Start: chain[8]}} {
		if !reflect.DeepEqual(distribution(t, s, req), distribution(t, flipped, req)) {
			t.Fatalf("cable endpoint order changed the result for %+v", req)
		}
	}
	forward, err := pathfinding.Trace(s, pathfinding.Request{Mode: "point_to_point", Start: "edge-30:p1", End: "agg-30:p1"})
	if err != nil {
		t.Fatal(err)
	}
	reverse, err := pathfinding.Trace(s, pathfinding.Request{Mode: "point_to_point", Start: "agg-30:p1", End: "edge-30:p1"})
	if err != nil || len(forward.Routes) != 1 || len(reverse.Routes) != 1 || len(reverse.Routes[0].Hops) != 9 {
		t.Fatalf("p2p: %+v %+v %v", forward, reverse, err)
	}
	hopsAlong(t, s, forward.Routes[0].Hops, chain)
	rev := slices.Clone(chain)
	slices.Reverse(rev)
	hopsAlong(t, s, reverse.Routes[0].Hops, rev)
}

// P14: invalid endpoints are stable validation errors, never a fabricated
// "disconnected" result.
func TestInvalidEndpointsAreStableValidationErrors(t *testing.T) {
	s := acceptance.Installed()
	for name, tc := range map[string]struct {
		req  pathfinding.Request
		want string
	}{
		"distribution unknown start":  {pathfinding.Request{Mode: "distribution", Start: "nope"}, "unknown start endpoint"},
		"distribution unknown device": {pathfinding.Request{Mode: "distribution", Device: "nope"}, "unknown starting device"},
		"distribution end given":      {pathfinding.Request{Mode: "distribution", Start: "edge-17:p1", End: "agg-03:p1"}, "distribution search takes a starting device or endpoint only"},
		"distribution neither":        {pathfinding.Request{Mode: "distribution"}, "distribution requires exactly one starting endpoint or device"},
		"distribution passive device": {pathfinding.Request{Mode: "distribution", Device: "hdf-01"}, "distribution search starts from an active device"},
		"p2p unknown start":           {pathfinding.Request{Mode: "point_to_point", Start: "nope", End: "agg-03:p1"}, "unknown start endpoint"},
		"p2p unknown end":             {pathfinding.Request{Mode: "point_to_point", Start: "edge-17:p1", End: "nope"}, "unknown destination endpoint"},
	} {
		t.Run(name, func(t *testing.T) {
			r, err := pathfinding.Trace(s, tc.req)
			if err == nil || err.Error() != tc.want {
				t.Fatalf("error = %v, want %q", err, tc.want)
			}
			if len(r.Routes) != 0 || len(r.Starts) != 0 || len(r.Mismatches) != 0 {
				t.Fatalf("an invalid request must not fabricate results: %+v", r)
			}
		})
	}
}
