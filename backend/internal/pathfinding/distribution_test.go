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

// builder makes small purpose-built snapshots: every switch or panel gets its
// own 12U rack, so placement never matters to a case.
type builder struct {
	s topology.Snapshot
	n int
}

func newBuilder() *builder {
	return &builder{s: topology.Snapshot{
		Context: "installed", Revision: "1",
		Sites:     []topology.Site{{ID: "s", Name: "S"}},
		Nodes:     []topology.LocationNode{{ID: "n", Name: "N", SiteID: "s"}},
		Networks:  []topology.Network{{ID: "a", Name: "A"}, {ID: "b", Name: "B"}},
		Subpanels: []topology.Subpanel{},
	}}
}

func (b *builder) place(id string) (rack string) {
	rack = "rack-" + id
	b.s.Racks = append(b.s.Racks, topology.Rack{ID: rack, NodeID: "n", Name: rack, Units: 12})
	return rack
}

func (b *builder) sw(id, role, network string, ports int) *builder {
	b.s.Equipment = append(b.s.Equipment, topology.Equipment{ID: id, Name: strings.ToUpper(id), Kind: "switch", Role: role, NetworkID: network, RackID: b.place(id), Unit: 1, Height: 1})
	for i := 1; i <= ports; i++ {
		b.s.Endpoints = append(b.s.Endpoints, topology.Endpoint{ID: fmt.Sprintf("%s:p%d", id, i), EquipmentID: id})
	}
	return b
}

func (b *builder) panel(id string, positions int) *builder {
	b.s.Equipment = append(b.s.Equipment, topology.Equipment{ID: id, Name: strings.ToUpper(id), Kind: "panel", Role: "passive", RackID: b.place(id), Unit: 1, Height: 1})
	for i := 1; i <= positions; i++ {
		f, r := fmt.Sprintf("%s:%d:f", id, i), fmt.Sprintf("%s:%d:r", id, i)
		b.s.Endpoints = append(b.s.Endpoints,
			topology.Endpoint{ID: f, EquipmentID: id, Position: i, Side: "front"},
			topology.Endpoint{ID: r, EquipmentID: id, Position: i, Side: "rear"})
		b.s.Links = append(b.s.Links, topology.Link{ID: fmt.Sprintf("%s:%d:bridge", id, i), A: f, B: r, Kind: "internal"})
	}
	return b
}

func (b *builder) cable(x, y string) *builder {
	b.s.Links = append(b.s.Links, topology.Link{ID: fmt.Sprintf("c%d", len(b.s.Links)+1), A: x, B: y, Kind: "cable"})
	return b
}

func distribution(t *testing.T, s topology.Snapshot, req pathfinding.Request) pathfinding.Result {
	t.Helper()
	req.Mode = "distribution"
	r, err := pathfinding.Trace(s, req)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

// summary renders "role dest-endpoint<-start-endpoint" for compact assertions.
func summary(routes []pathfinding.Route) []string {
	out := []string{}
	for _, r := range routes {
		out = append(out, fmt.Sprintf("%s %s<-%s", r.DestinationRole, r.End, r.Start))
	}
	return out
}

func outcomes(r pathfinding.Result) map[string]string {
	m := map[string]string{}
	for _, s := range r.Starts {
		m[s.Endpoint] = s.Outcome
	}
	return m
}

func fixture() topology.Snapshot { return acceptance.Installed() }

// clone returns a snapshot whose slices can be mutated freely.
func clone(s topology.Snapshot) topology.Snapshot {
	s.Equipment = slices.Clone(s.Equipment)
	s.Endpoints = slices.Clone(s.Endpoints)
	s.Links = slices.Clone(s.Links)
	s.Subpanels = slices.Clone(s.Subpanels)
	return s
}

func without(s topology.Snapshot, linkID string) topology.Snapshot {
	s = clone(s)
	s.Links = slices.DeleteFunc(s.Links, func(l topology.Link) bool { return l.ID == linkID })
	return s
}

// P01: device-level Find AGG/BB on the acceptance fixture returns the three
// Network A routes with correct source ports and actual roles.
func TestDistributionFromEDGE17ReturnsAGG03AGG08AndBB01(t *testing.T) {
	r := distribution(t, fixture(), pathfinding.Request{Device: "edge-17"})
	want := []string{"aggregation agg-03:p1<-edge-17:p1", "aggregation agg-08:p1<-edge-17:p2", "backbone bb-01:p1<-edge-17:p3"}
	if !reflect.DeepEqual(summary(r.Routes), want) {
		t.Fatalf("routes = %v, want %v", summary(r.Routes), want)
	}
	if r.Status != "reached" || r.Truncated || len(r.Mismatches) != 0 || r.Mode != "distribution" {
		t.Fatalf("unexpected result envelope: %+v", r)
	}
	for i, route := range r.Routes {
		if route.SourceNetworkID != "net-a" || route.DestinationNetworkID != "net-a" || len(route.Hops) != 7 {
			t.Errorf("route %d metadata/hops wrong: %+v", i, route)
		}
	}
	for i, id := range []string{"agg-03", "agg-08", "bb-01"} {
		if r.Routes[i].DestinationEquipmentID != id {
			t.Errorf("route %d destination equipment = %s, want %s", i, r.Routes[i].DestinationEquipmentID, id)
		}
	}
	want7 := []string{"cable", "internal", "cable", "internal", "cable", "internal", "cable"}
	for i, route := range r.Routes {
		var kinds []string
		for _, h := range route.Hops {
			kinds = append(kinds, h.Kind)
		}
		if !reflect.DeepEqual(kinds, want7) {
			t.Errorf("route %d hop kinds = %v, want %v", i, kinds, want7)
		}
	}
	for _, p := range []string{"edge-17:p1", "edge-17:p2", "edge-17:p3"} {
		if outcomes(r)[p] != pathfinding.OutcomeReached {
			t.Errorf("%s outcome = %s", p, outcomes(r)[p])
		}
	}
}

// P02: a reachable BB is neither suppressed by reachable AGGs nor relabeled AGG.
func TestBBRouteIsRetainedAlongsideAGGsAndKeepsItsRole(t *testing.T) {
	r := distribution(t, fixture(), pathfinding.Request{Device: "edge-17"})
	roles := map[string]string{}
	for _, route := range r.Routes {
		roles[route.DestinationEquipmentID] = route.DestinationRole
	}
	if roles["bb-01"] != "backbone" || roles["agg-03"] != "aggregation" || roles["agg-08"] != "aggregation" {
		t.Fatalf("roles = %v", roles)
	}
}

// P03: AGG-15 belongs to Network A but is unconnected, so it is never a result.
func TestUnconnectedAGG15IsNotAResult(t *testing.T) {
	for _, device := range []string{"edge-17", "edge-22", "agg-03", "bb-01"} {
		r := distribution(t, fixture(), pathfinding.Request{Device: device})
		for _, route := range append(slices.Clone(r.Routes), r.Mismatches...) {
			if route.DestinationEquipmentID == "agg-15" {
				t.Fatalf("%s reached AGG-15: %+v", device, route)
			}
		}
	}
	// Searching the unconnected device itself finds nothing and says why.
	r := distribution(t, fixture(), pathfinding.Request{Device: "agg-15"})
	if r.Status != "unreachable" || len(r.Routes) != 0 || len(r.Starts) != 24 {
		t.Fatalf("agg-15 search: %s %d routes %d starts", r.Status, len(r.Routes), len(r.Starts))
	}
	for _, s := range r.Starts {
		if s.Outcome != pathfinding.OutcomeDisconnected {
			t.Fatalf("%s outcome = %s, want disconnected", s.Endpoint, s.Outcome)
		}
	}
}

// P04: an exact starting port searches only its own circuit.
func TestExactStartingPortDoesNotJumpToSiblingPorts(t *testing.T) {
	for port, want := range map[string]string{
		"edge-17:p1": "aggregation agg-03:p1<-edge-17:p1",
		"edge-17:p2": "aggregation agg-08:p1<-edge-17:p2",
		"edge-17:p3": "backbone bb-01:p1<-edge-17:p3",
	} {
		r := distribution(t, fixture(), pathfinding.Request{Start: port})
		if !reflect.DeepEqual(summary(r.Routes), []string{want}) || len(r.Starts) != 1 || r.Starts[0].Endpoint != port {
			t.Errorf("%s: routes %v starts %v", port, summary(r.Routes), r.Starts)
		}
	}
}

// P05: there is no fixed pair cap on reachable AGGs, and BB routes keep coming.
func TestMoreThanTwoAGGsAndBBsAreAllReturned(t *testing.T) {
	b := newBuilder().sw("edge", "access", "a", 8)
	for i := 1; i <= 5; i++ {
		b.sw(fmt.Sprintf("agg%d", i), "aggregation", "a", 1).cable(fmt.Sprintf("edge:p%d", i), fmt.Sprintf("agg%d:p1", i))
	}
	for i := 1; i <= 2; i++ {
		b.sw(fmt.Sprintf("bb%d", i), "backbone", "a", 1).cable(fmt.Sprintf("edge:p%d", 5+i), fmt.Sprintf("bb%d:p1", i))
	}
	r := distribution(t, b.s, pathfinding.Request{Device: "edge"})
	want := []string{
		"aggregation agg1:p1<-edge:p1", "aggregation agg2:p1<-edge:p2", "aggregation agg3:p1<-edge:p3", "aggregation agg4:p1<-edge:p4", "aggregation agg5:p1<-edge:p5",
		"backbone bb1:p1<-edge:p6", "backbone bb2:p1<-edge:p7",
	}
	if !reflect.DeepEqual(summary(r.Routes), want) {
		t.Fatalf("routes = %v", summary(r.Routes))
	}
	if outcomes(r)["edge:p8"] != pathfinding.OutcomeDisconnected {
		t.Fatalf("unused port outcome = %s", outcomes(r)["edge:p8"])
	}
}

// P06: a BB-only destination is a valid terminal result.
func TestBBOnlyReachableDestination(t *testing.T) {
	b := newBuilder().sw("edge", "access", "a", 2).sw("bb", "backbone", "a", 1).cable("edge:p1", "bb:p1")
	r := distribution(t, b.s, pathfinding.Request{Device: "edge"})
	if r.Status != "reached" || !reflect.DeepEqual(summary(r.Routes), []string{"backbone bb:p1<-edge:p1"}) {
		t.Fatalf("BB-only result wrong: %s %v", r.Status, summary(r.Routes))
	}
}

// P07: reaching an active endpoint stops that branch. There is no transit
// through sibling ports, including AGG→BB and access→AGG continuation.
func TestReachingAnActiveEndpointStopsTheSearch(t *testing.T) {
	b := newBuilder().
		sw("edge", "access", "a", 2).sw("agg", "aggregation", "a", 2).sw("bb", "backbone", "a", 1).
		sw("other", "access", "a", 2).sw("agg2", "aggregation", "a", 1).
		cable("edge:p1", "agg:p1").cable("agg:p2", "bb:p1").      // AGG→BB behind AGG sibling ports
		cable("edge:p2", "other:p1").cable("other:p2", "agg2:p1") // access→AGG behind an access device
	r := distribution(t, b.s, pathfinding.Request{Device: "edge"})
	if !reflect.DeepEqual(summary(r.Routes), []string{"aggregation agg:p1<-edge:p1"}) {
		t.Fatalf("routes = %v; the search must not continue through active equipment", summary(r.Routes))
	}
	if outcomes(r)["edge:p2"] != pathfinding.OutcomeNoDestination {
		t.Fatalf("a circuit ending at a non-destination device must be no_destination, got %s", outcomes(r)["edge:p2"])
	}
	// Searching the AGG itself is a new search from its own ports: it reaches BB.
	r = distribution(t, b.s, pathfinding.Request{Device: "agg"})
	if !reflect.DeepEqual(summary(r.Routes), []string{"backbone bb:p1<-agg:p2"}) {
		t.Fatalf("agg device search = %v", summary(r.Routes))
	}
	if outcomes(r)["agg:p1"] != pathfinding.OutcomeNoDestination {
		t.Fatalf("agg:p1 reaches only an access device: %s", outcomes(r)["agg:p1"])
	}
}

// P08: several source ports reaching one destination device stay distinct.
func TestSeveralSourcePortsToOneDestinationDeviceAreNotMerged(t *testing.T) {
	b := newBuilder().sw("edge", "access", "a", 3).panel("pnl", 2).sw("agg", "aggregation", "a", 3).
		cable("edge:p1", "agg:p1").
		cable("edge:p2", "pnl:1:f").cable("pnl:1:r", "agg:p2").
		cable("edge:p3", "pnl:2:f").cable("pnl:2:r", "agg:p3")
	r := distribution(t, b.s, pathfinding.Request{Device: "edge"})
	want := []string{"aggregation agg:p1<-edge:p1", "aggregation agg:p2<-edge:p2", "aggregation agg:p3<-edge:p3"}
	if !reflect.DeepEqual(summary(r.Routes), want) {
		t.Fatalf("routes = %v", summary(r.Routes))
	}
	if len(r.Routes[0].Hops) != 1 || len(r.Routes[1].Hops) != 3 {
		t.Fatalf("each route keeps its own hops: %d/%d", len(r.Routes[0].Hops), len(r.Routes[1].Hops))
	}
}

// P13: removing a route cable makes that route unreachable with a useful
// outcome, while unrelated routes keep working.
func TestDisconnectingACableAffectsOnlyItsRoute(t *testing.T) {
	// Mid-route cable removed: the circuit now ends at a passive dead end.
	r := distribution(t, without(fixture(), "cable-a02"), pathfinding.Request{Device: "edge-17"})
	if !reflect.DeepEqual(summary(r.Routes), []string{"aggregation agg-08:p1<-edge-17:p2", "backbone bb-01:p1<-edge-17:p3"}) {
		t.Fatalf("routes = %v", summary(r.Routes))
	}
	if got := outcomes(r)["edge-17:p1"]; got != pathfinding.OutcomeNoDestination {
		t.Fatalf("port 1 outcome = %s, want no_destination", got)
	}
	// First cable removed: the port itself is disconnected.
	r = distribution(t, without(fixture(), "cable-a01"), pathfinding.Request{Device: "edge-17"})
	if got := outcomes(r)["edge-17:p1"]; got != pathfinding.OutcomeDisconnected || len(r.Routes) != 2 {
		t.Fatalf("port 1 outcome = %s with %d routes", got, len(r.Routes))
	}
	// Every route cable removed: unreachable, and the reason says why.
	s := fixture()
	for _, id := range []string{"cable-a01", "cable-a05", "cable-a09"} {
		s = without(s, id)
	}
	r = distribution(t, s, pathfinding.Request{Device: "edge-17"})
	if r.Status != "unreachable" || len(r.Routes) != 0 || r.Truncated || !strings.Contains(r.Reason, "disconnected") {
		t.Fatalf("expected an explained unreachable result, got %s %q", r.Status, r.Reason)
	}
}

// P15: loops terminate and a limit is never reported as "unreachable".
func TestPassiveLoopsAndRepeatedVisitsTerminate(t *testing.T) {
	// A ring of four positions across two panels (same-chassis cables are
	// invalid) plus an ordinary circuit.
	b := newBuilder().panel("px", 2).panel("py", 2).sw("edge", "access", "a", 1).sw("agg", "aggregation", "a", 1).
		cable("px:1:r", "py:1:f").cable("py:1:r", "px:2:f").cable("px:2:r", "py:2:f").cable("py:2:r", "px:1:f").
		cable("edge:p1", "agg:p1")
	r := distribution(t, b.s, pathfinding.Request{Device: "edge"})
	if !reflect.DeepEqual(summary(r.Routes), []string{"aggregation agg:p1<-edge:p1"}) || r.Truncated {
		t.Fatalf("a passive loop disturbed an unrelated search: %v", summary(r.Routes))
	}
	// Two access switches joined by two cables are not a transit cycle.
	b = newBuilder().sw("a1", "access", "a", 2).sw("a2", "access", "a", 2).
		cable("a1:p1", "a2:p1").cable("a1:p2", "a2:p2")
	r = distribution(t, b.s, pathfinding.Request{Device: "a1"})
	if r.Status != "unreachable" || outcomes(r)["a1:p1"] != pathfinding.OutcomeNoDestination || outcomes(r)["a1:p2"] != pathfinding.OutcomeNoDestination {
		t.Fatalf("unexpected result for doubly connected access switches: %+v", r)
	}
}

func bigFanout(routes int) topology.Snapshot {
	b := newBuilder().sw("edge", "access", "a", routes)
	for i := 0; i*24 < routes; i++ {
		agg := fmt.Sprintf("agg%d", i)
		b.sw(agg, "aggregation", "a", 24)
		for p := 1; p <= 24 && i*24+p <= routes; p++ {
			b.cable(fmt.Sprintf("edge:p%d", i*24+p), fmt.Sprintf("%s:p%d", agg, p))
		}
	}
	return b.s
}

func TestRouteLimitTruncatesExplicitlyAndIsNeverUnreachable(t *testing.T) {
	exact := distribution(t, bigFanout(pathfinding.MaxRoutes), pathfinding.Request{Device: "edge"})
	if len(exact.Routes) != pathfinding.MaxRoutes || exact.Truncated {
		t.Fatalf("exactly %d routes fit the limit: got %d truncated=%v", pathfinding.MaxRoutes, len(exact.Routes), exact.Truncated)
	}
	over := distribution(t, bigFanout(pathfinding.MaxRoutes+30), pathfinding.Request{Device: "edge"})
	if !over.Truncated || len(over.Routes)+len(over.Mismatches) != pathfinding.MaxRoutes {
		t.Fatalf("over the limit: truncated=%v routes=%d", over.Truncated, len(over.Routes))
	}
	if over.Status != "reached" || !strings.Contains(over.Reason, "1000") || strings.Contains(strings.ToLower(over.Reason), "unreachable") {
		t.Fatalf("a limit must be reported as truncation, not unreachability: %s %q", over.Status, over.Reason)
	}
	if len(over.Starts) != pathfinding.MaxRoutes+30 {
		t.Fatalf("every searched port keeps its outcome: %d", len(over.Starts))
	}
	again := distribution(t, bigFanout(pathfinding.MaxRoutes+30), pathfinding.Request{Device: "edge"})
	if !reflect.DeepEqual(over, again) {
		t.Fatal("truncation must be deterministic")
	}
}

// P16: destinations on another network are mismatches, never routes.
func TestCrossNetworkDestinationsAreReportedSeparately(t *testing.T) {
	s := clone(fixture())
	// EDGE-17 (A) is also cabled to AGG-12 (B) and, through a spare AGG, to nothing else.
	s.Links = append(s.Links, topology.Link{ID: "cable-cross", A: "edge-17:p4", B: "agg-12:p2", Kind: "cable"})
	r := distribution(t, s, pathfinding.Request{Device: "edge-17"})
	if !reflect.DeepEqual(summary(r.Routes), []string{"aggregation agg-03:p1<-edge-17:p1", "aggregation agg-08:p1<-edge-17:p2", "backbone bb-01:p1<-edge-17:p3"}) {
		t.Fatalf("a mismatch must not change the routes: %v", summary(r.Routes))
	}
	if len(r.Mismatches) != 1 {
		t.Fatalf("mismatches = %+v", r.Mismatches)
	}
	m := r.Mismatches[0]
	if m.Start != "edge-17:p4" || m.End != "agg-12:p2" || m.DestinationEquipmentID != "agg-12" || m.DestinationRole != "aggregation" || m.DestinationNetworkID != "net-b" || m.SourceNetworkID != "net-a" || len(m.Hops) != 1 {
		t.Fatalf("mismatch fields wrong: %+v", m)
	}
	if outcomes(r)["edge-17:p4"] != pathfinding.OutcomeMismatch {
		t.Fatalf("outcome = %s", outcomes(r)["edge-17:p4"])
	}
	// Only mismatches: unreachable overall, and the reason names the cause.
	only := distribution(t, s, pathfinding.Request{Start: "edge-17:p4"})
	if only.Status != "unreachable" || len(only.Routes) != 0 || len(only.Mismatches) != 1 || !strings.Contains(only.Reason, "another network") {
		t.Fatalf("mismatch-only result wrong: %s %q", only.Status, only.Reason)
	}
	// From AGG-12 the same cable leads to an access switch: not a destination, so
	// it is neither a route nor a mismatch.
	back := distribution(t, s, pathfinding.Request{Device: "agg-12"})
	if len(back.Routes) != 0 || len(back.Mismatches) != 0 || outcomes(back)["agg-12:p2"] != pathfinding.OutcomeNoDestination {
		t.Fatalf("reverse search: %+v", back)
	}
}

func TestCrossNetworkBBIsAMismatchAndPassiveHopsDoNotDecideNetworks(t *testing.T) {
	b := newBuilder().sw("edge", "access", "a", 2).panel("pnl", 1).sw("bbb", "backbone", "b", 1).sw("agga", "aggregation", "a", 1).
		cable("edge:p1", "pnl:1:f").cable("pnl:1:r", "bbb:p1").cable("edge:p2", "agga:p1")
	r := distribution(t, b.s, pathfinding.Request{Device: "edge"})
	if !reflect.DeepEqual(summary(r.Routes), []string{"aggregation agga:p1<-edge:p2"}) || len(r.Mismatches) != 1 || r.Mismatches[0].DestinationRole != "backbone" || r.Mismatches[0].DestinationNetworkID != "b" {
		t.Fatalf("routes %v mismatches %+v", summary(r.Routes), r.Mismatches)
	}
}

// P20: output depends only on the topology, never on call count or input order.
func TestDistributionResultsAreDeterministicAndRoleOrdered(t *testing.T) {
	// BB sits on the lower-numbered port, yet AGG results come first.
	b := newBuilder().sw("edge", "access", "a", 3).sw("bb", "backbone", "a", 1).sw("aggx", "aggregation", "a", 1).sw("aggy", "aggregation", "a", 1).
		cable("edge:p1", "bb:p1").cable("edge:p2", "aggy:p1").cable("edge:p3", "aggx:p1")
	first := distribution(t, b.s, pathfinding.Request{Device: "edge"})
	want := []string{"aggregation aggy:p1<-edge:p2", "aggregation aggx:p1<-edge:p3", "backbone bb:p1<-edge:p1"}
	if !reflect.DeepEqual(summary(first.Routes), want) {
		t.Fatalf("routes = %v, want AGG first then BB, by start endpoint: %v", summary(first.Routes), want)
	}
	if !reflect.DeepEqual(first, distribution(t, b.s, pathfinding.Request{Device: "edge"})) {
		t.Fatal("repeated calls differ")
	}
	reversed := clone(b.s)
	slices.Reverse(reversed.Equipment)
	slices.Reverse(reversed.Endpoints)
	slices.Reverse(reversed.Links)
	if !reflect.DeepEqual(first, distribution(t, reversed, pathfinding.Request{Device: "edge"})) {
		t.Fatal("results depend on input order")
	}
	fx := distribution(t, fixture(), pathfinding.Request{Device: "edge-17"})
	rev := clone(fixture())
	slices.Reverse(rev.Equipment)
	slices.Reverse(rev.Endpoints)
	slices.Reverse(rev.Links)
	slices.Reverse(rev.Subpanels)
	if !reflect.DeepEqual(fx, distribution(t, rev, pathfinding.Request{Device: "edge-17"})) {
		t.Fatal("fixture results depend on input order")
	}
	// Starts are sorted by endpoint ID.
	ids := []string{}
	for _, s := range first.Starts {
		ids = append(ids, s.Endpoint)
	}
	if !slices.IsSorted(ids) {
		t.Fatalf("starts are not sorted: %v", ids)
	}
}

// Request validation for the new mode.
func TestDistributionRequestValidation(t *testing.T) {
	s := fixture()
	bad := map[string]pathfinding.Request{
		"neither device nor start": {},
		"both device and start":    {Device: "edge-17", Start: "edge-17:p1"},
		"end is rejected":          {Device: "edge-17", End: "agg-03:p1"},
		"end with start":           {Start: "edge-17:p1", End: "agg-03:p1"},
		"unknown device":           {Device: "missing"},
		"unknown start":            {Start: "missing"},
		"device must be a switch":  {Device: "panel-a"},
		"hdf is not a device":      {Device: "hdf-01"},
	}
	for name, req := range bad {
		t.Run(name, func(t *testing.T) {
			req.Mode = "distribution"
			if _, err := pathfinding.Trace(s, req); err == nil {
				t.Fatal("expected a request error")
			}
		})
	}
	// Passive starting ports arrive in M2 step 2; until then they are refused
	// explicitly instead of being searched with an invented network.
	if _, err := pathfinding.Trace(s, pathfinding.Request{Mode: "distribution", Start: "panel-a:1:f"}); err == nil {
		t.Fatal("a passive start must be refused until it is supported")
	}
}

// Aggregation keeps working unchanged until the API switch-over (step 3).
func TestAggregationModeStillWorksAndIsUnchanged(t *testing.T) {
	r, err := pathfinding.Trace(fixture(), pathfinding.Request{Mode: "aggregation", Device: "edge-17"})
	if err != nil || len(r.Routes) != 2 || r.Routes[0].End != "agg-03:p1" || r.Routes[1].End != "agg-08:p1" {
		t.Fatalf("aggregation changed: %+v %v", r, err)
	}
	for _, route := range r.Routes {
		if route.DestinationRole != "" || route.DestinationEquipmentID != "" || route.SourceNetworkID != "" {
			t.Fatalf("aggregation routes must not carry distribution metadata: %+v", route)
		}
	}
	if len(r.Mismatches) != 0 || len(r.Starts) != 0 || r.Truncated {
		t.Fatalf("aggregation must not report distribution fields: %+v", r)
	}
}

// The starting device is never its own destination, even when it is patched
// back to itself through a passive panel.
func TestLoopbackToTheStartingDeviceIsNotADestination(t *testing.T) {
	b := newBuilder().sw("agg", "aggregation", "a", 3).sw("bb", "backbone", "a", 1).panel("pnl", 1).
		cable("agg:p1", "pnl:1:f").cable("pnl:1:r", "agg:p2").cable("agg:p3", "bb:p1")
	r := distribution(t, b.s, pathfinding.Request{Device: "agg"})
	if !reflect.DeepEqual(summary(r.Routes), []string{"backbone bb:p1<-agg:p3"}) {
		t.Fatalf("routes = %v; the patched loopback must not count", summary(r.Routes))
	}
	o := outcomes(r)
	if o["agg:p1"] != pathfinding.OutcomeNoDestination || o["agg:p2"] != pathfinding.OutcomeNoDestination || o["agg:p3"] != pathfinding.OutcomeReached {
		t.Fatalf("outcomes = %v", o)
	}
	// A device patched to itself alone is unreachable, with an explanation.
	only := distribution(t, b.s, pathfinding.Request{Start: "agg:p1"})
	if only.Status != "unreachable" || len(only.Routes) != 0 || !strings.Contains(only.Reason, "non-destination") {
		t.Fatalf("loopback-only search: %s %q", only.Status, only.Reason)
	}
}
