package pathfinding_test

import (
	"encoding/json"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/topology"
)

// FD-03 (domain): a port's state is data. Faulty, disabled or reserved ports,
// and every other detail field, change no trace.
func TestFD03PortStateAndDetailsNeverChangeATrace(t *testing.T) {
	trace := func(s topology.Snapshot) string {
		var out []byte
		for _, req := range []pathfinding.Request{
			{Mode: "distribution", Device: "edge-17"},
			{Mode: "point_to_point", Start: "edge-17:p1", End: "agg-03:p1"},
			{Mode: "distribution", Device: "edge-22"},
		} {
			r, err := pathfinding.Trace(s, req)
			if err != nil {
				t.Fatal(err)
			}
			b, _ := json.Marshal(r)
			out = append(out, b...)
		}
		return string(out)
	}
	want := trace(acceptance.Installed())
	for _, state := range []string{"faulty", "disabled", "reserved", "available"} {
		s := acceptance.Installed()
		for i := range s.Endpoints { // every port and position, including those on the route
			s.Endpoints[i].State = state
			s.Endpoints[i].PortType = "fiber"
			s.Endpoints[i].Speed = "10G"
		}
		for i := range s.Equipment {
			s.Equipment[i].Status = "inactive"
		}
		for i := range s.Links {
			if s.Links[i].Kind == "cable" {
				s.Links[i].Status = "inactive"
			}
		}
		if got := trace(s); got != want {
			t.Fatalf("state %q changed a trace:\n%s\nvs\n%s", state, got, want)
		}
	}
}
