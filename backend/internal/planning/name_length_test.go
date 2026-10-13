package planning_test

import (
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
)

// Equipment names are counted in characters, not bytes: 60 Hebrew letters are
// 120 bytes and fine; 101 are refused.
func TestEquipmentNameLengthCountsCharacters(t *testing.T) {
	long, tooLong := strings.Repeat("א", 60), strings.Repeat("א", 101)
	for _, c := range []struct {
		kind    string
		build   func(name string) planning.Command
		message string
	}{
		{"add_equipment", func(n string) planning.Command { return switchWith(n, 8, nil) }, "equipment name must contain 1–100 characters"},
		{"add_hdf", func(n string) planning.Command { return hdfWith(n, 8) }, "HDF name must contain 1–100 characters"},
	} {
		t.Run(c.kind, func(t *testing.T) {
			p := must(t, v2Plan(), c.build(long), "equipment-x")
			if equipmentNamed(proposed(t, p), long).ID != "equipment-x" {
				t.Fatal("the long name was not kept")
			}
			_, err := planning.Execute(acceptance.Installed(), v2Plan(), c.build(tooLong), "equipment-y")
			if err == nil || err.Error() != "invalid plan command: "+c.message {
				t.Fatalf("got %v", err)
			}
		})
	}
}
