package planning_test

import (
	"errors"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func renameOf(rev, id, name string) planning.Command {
	c := cmd("rename_equipment", rev)
	c.Target = &planning.TargetInput{ID: id}
	c.Name = &name
	return c
}

func panelWith(name string, unit int) planning.Command {
	c := cmd("add_equipment", "1")
	c.Equipment = &planning.EquipmentInput{Name: name, Kind: "panel", Role: "passive", RackID: "rack-sm01", Unit: unit, Height: 1, PortCount: 4}
	return c
}

func hdfWith(name string, unit int) planning.Command {
	c := cmd("add_hdf", "1")
	c.HDF = &planning.HDFInput{Name: name, RackID: "rack-sm01", Unit: unit, Height: 1, Rows: 1}
	return c
}

// withNew is a draft with a switch (equipment-sw), a panel (equipment-pn) and an HDF (equipment-hdf).
func withNew(t *testing.T) planning.Plan {
	t.Helper()
	p := must(t, v2Plan(), switchWith("SW-NEW", 8, nil), "equipment-sw")
	p = must(t, p, withRev(panelWith("PN-NEW", 9), "2"), "equipment-pn")
	return must(t, p, withRev(hdfWith("HDF-NEW", 10), "3"), "equipment-hdf")
}

func TestRenameChangesTheProposedNameOfAddedEquipment(t *testing.T) {
	p := withNew(t)
	for i, c := range []struct{ id, from, to string }{
		{"equipment-sw", "SW-NEW", "  SW-RENAMED "},
		{"equipment-pn", "PN-NEW", "PN-RENAMED"},
		{"equipment-hdf", "HDF-NEW", "HDF-RENAMED"},
	} {
		p = must(t, p, renameOf(p.Revision, c.id, c.to), "")
		s := proposed(t, p)
		want := strings.TrimSpace(c.to)
		if equipmentNamed(s, want).ID != c.id || equipmentNamed(s, c.from).ID != "" {
			t.Fatalf("%d: proposed names after rename: %+v", i, s.Equipment)
		}
	}
	if len(p.Renames) != 3 || p.Revision != "7" {
		t.Fatalf("renames %+v revision %s", p.Renames, p.Revision)
	}
	// What the plan added keeps the name it was added with.
	if p.Equipment[0].Name != "SW-NEW" {
		t.Fatalf("the addition changed: %+v", p.Equipment[0])
	}
}

func TestRenameRefusals(t *testing.T) {
	p := withNew(t)
	cases := []struct {
		name string
		c    planning.Command
		want string
	}{
		{"installed", renameOf("4", "edge-17", "EDGE-X"), "Installed equipment is renamed with a direct fix, not in a plan"},
		{"unknown", renameOf("4", "nothing", "X"), "cannot rename unknown equipment nothing"},
		{"a port", renameOf("4", "equipment-sw:p1", "X"), "cannot rename unknown equipment equipment-sw:p1"},
		{"a rack", renameOf("4", "rack-sm01", "X"), "cannot rename unknown equipment rack-sm01"},
		{"empty", renameOf("4", "equipment-sw", "   "), "equipment name must contain 1–100 characters"},
		{"long", renameOf("4", "equipment-sw", strings.Repeat("x", 101)), "equipment name must contain 1–100 characters"},
		{"taken by installed", renameOf("4", "equipment-sw", "edge-17"), "equipment name already exists in this topology"},
		{"taken by added", renameOf("4", "equipment-sw", "pn-new"), "equipment name already exists in this topology"},
		{"same name", renameOf("4", "equipment-sw", "sw-new"), "sw-new is already called SW-NEW"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := planning.Execute(acceptance.Installed(), p, tc.c, "")
			if !errors.Is(err, planning.ErrInvalid) || err.Error() != "invalid plan command: "+tc.want {
				t.Fatalf("got %v, want %q", err, tc.want)
			}
		})
	}
	// A name is for rename_equipment only; rename_equipment needs a target and a name.
	other := site("X")
	other.Name = str("Y")
	if _, err := planning.Execute(acceptance.Installed(), v2Plan(), other, "s"); !errors.Is(err, planning.ErrInvalid) || !strings.Contains(err.Error(), "add_site takes its name inside its payload") {
		t.Fatalf("name on another command: %v", err)
	}
	for _, c := range []planning.Command{target("rename_equipment", "equipment-sw"), func() planning.Command { c := renameOf("1", "x", "y"); c.Target = nil; return c }()} {
		c.ExpectedRevision = "4"
		if _, err := planning.Execute(acceptance.Installed(), p, c, ""); !errors.Is(err, planning.ErrInvalid) {
			t.Fatalf("incomplete rename: %v", err)
		}
	}
}

func TestRenameTwiceKeepsOneEntryAndRenamingBackRemovesIt(t *testing.T) {
	p := withNew(t)
	p = must(t, p, renameOf("4", "equipment-sw", "SW-B"), "")
	p = must(t, p, renameOf("5", "equipment-sw", "SW-C"), "")
	if len(p.Renames) != 1 || p.Renames[0] != (planning.Rename{ID: "equipment-sw", Name: "SW-C"}) {
		t.Fatalf("renames %+v", p.Renames)
	}
	p = must(t, p, renameOf("6", "equipment-sw", "sw-new"), "")
	if len(p.Renames) != 0 || equipmentNamed(proposed(t, p), "SW-NEW").ID != "equipment-sw" {
		t.Fatalf("renaming back: %+v", p.Renames)
	}
}

func TestRemoveChangeUndoesARenameAndDeletionsDropIt(t *testing.T) {
	p := must(t, withNew(t), renameOf("4", "equipment-sw", "SW-B"), "")
	rc := cmd("remove_change", "5")
	rc.Change = &planning.ChangeInput{Key: "rename_equipment:equipment-sw"}
	undone, removed, err := planning.ExecuteRemoveChange(acceptance.Installed(), p, rc)
	if err != nil || len(removed) != 1 || removed[0] != "rename_equipment:equipment-sw" || len(undone.Renames) != 0 {
		t.Fatalf("undo: %v %v %+v", err, removed, undone.Renames)
	}
	if equipmentNamed(proposed(t, undone), "SW-NEW").ID != "equipment-sw" {
		t.Fatal("the name did not come back")
	}
	rc.Change = &planning.ChangeInput{Key: "rename_equipment:nothing"}
	if _, _, err = planning.ExecuteRemoveChange(acceptance.Installed(), p, rc); !errors.Is(err, planning.ErrNotFound) {
		t.Fatalf("unknown key: %v", err)
	}

	rc.Change = &planning.ChangeInput{Key: "add_equipment:equipment-sw"}
	gone, removed, err := planning.ExecuteRemoveChange(acceptance.Installed(), p, rc)
	if err != nil || len(gone.Renames) != 0 || !hasString(removed, "rename_equipment:equipment-sw") {
		t.Fatalf("removing the addition: %v %v %+v", err, removed, gone.Renames)
	}
	del, err := planning.Execute(acceptance.Installed(), p, withRev(target("delete_equipment", "equipment-sw"), "5"), "")
	if err != nil || len(del.Renames) != 0 {
		t.Fatalf("delete_equipment: %v %+v", err, del.Renames)
	}
	// A rack that holds it takes the rename along.
	n := nested()
	n.Revision = "1"
	n = must(t, n, renameOf("1", "eq-n", "SW-N2"), "")
	rc = cmd("remove_change", "2")
	rc.Change = &planning.ChangeInput{Key: "add_rack:rack-n"}
	if got, _, err := planning.ExecuteRemoveChange(acceptance.Installed(), n, rc); err != nil || len(got.Renames) != 0 {
		t.Fatalf("remove_change add_rack: %v %+v", err, got.Renames)
	}
}

func hasString(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func TestRenameInABatch(t *testing.T) {
	base := acceptance.Installed()
	start := withNew(t)
	ok := cmd("batch", "4")
	ok.Batch = &planning.BatchInput{Commands: []planning.Command{
		renameOf("", "equipment-sw", "SW-B"),
		inner(switchAt("SW-NEW", "rack-sm01", 12)), // the old name is free after the rename
	}}
	got, err := planning.ExecuteBatch(base, start, ok, []string{"", "equipment-two"})
	if err != nil || len(got.Renames) != 1 || got.Revision != "5" {
		t.Fatalf("batch: %v %+v", err, got.Renames)
	}
	clash := cmd("batch", "4")
	clash.Batch = &planning.BatchInput{Commands: []planning.Command{
		renameOf("", "equipment-sw", "SW-B"),
		inner(switchAt("sw-b", "rack-sm01", 12)),
	}}
	_, err = planning.ExecuteBatch(base, start, clash, []string{"", "equipment-two"})
	want := "invalid plan command: command 2 (add_equipment): equipment name already exists in this topology"
	if err == nil || err.Error() != want {
		t.Fatalf("got %v\nwant %s", err, want)
	}
	bad := cmd("batch", "4")
	bad.Batch = &planning.BatchInput{Commands: []planning.Command{renameOf("", "edge-17", "X")}}
	_, err = planning.ExecuteBatch(base, start, bad, []string{""})
	want = "invalid plan command: command 1 (rename_equipment): Installed equipment is renamed with a direct fix, not in a plan"
	if err == nil || err.Error() != want {
		t.Fatalf("got %v\nwant %s", err, want)
	}
}

// Update draft against a newer Installed that took the name: Check names the change.
func TestCheckNamesARenameWhoseNameIsTaken(t *testing.T) {
	p := must(t, withNew(t), renameOf("4", "equipment-sw", "EDGE-NEW"), "")
	base := acceptance.Installed()
	if c := planning.Check(base, p); len(c) != 0 {
		t.Fatalf("unexpected conflicts %+v", c)
	}
	newer := base
	newer.Equipment = append([]topology.Equipment{}, base.Equipment...)
	newer.Equipment = append(newer.Equipment, topology.Equipment{ID: "edge-new", Name: "edge-new", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-sm01", Unit: 12, Height: 1})
	conflicts := planning.Check(newer, p)
	if len(conflicts) != 1 || conflicts[0].Change != "rename_equipment:equipment-sw" || conflicts[0].Reason != "equipment name already exists in this topology" {
		t.Fatalf("conflicts %+v", conflicts)
	}
}

func TestLabelsReadTheNewName(t *testing.T) {
	p := must(t, withNew(t), renameOf("4", "equipment-sw", "SW-B"), "")
	if p.Labels["equipment-sw"] != "SW-B" {
		t.Fatalf("label %q", p.Labels["equipment-sw"])
	}
	p = must(t, p, withRev(target("delete_equipment", "equipment-pn"), "5"), "")
	if p.Labels["equipment-sw"] != "SW-B" {
		t.Fatalf("label after another command %q", p.Labels["equipment-sw"])
	}
}

// Recording writes the renamed equipment: Diff sees an addition with the new name.
func TestDiffOfARenamedAdditionIsTheAdditionWithTheNewName(t *testing.T) {
	p := must(t, withNew(t), renameOf("4", "equipment-sw", "SW-B"), "")
	d, err := planning.Diff(acceptance.Installed(), proposed(t, p))
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, e := range d.AddedEquipment {
		if e.ID == "equipment-sw" {
			found = e.Name == "SW-B"
		}
	}
	if !found {
		t.Fatalf("added equipment %+v", d.AddedEquipment)
	}
	labels := planning.RecordLabels(acceptance.Installed(), proposed(t, p), p, d)
	if labels["equipment-sw"] != "SW-B" {
		t.Fatalf("record label %q", labels["equipment-sw"])
	}
}

// pairWith is a draft with a switch "A" (equipment-a) and a panel "B" (equipment-b).
func pairWith(t *testing.T) planning.Plan {
	t.Helper()
	p := must(t, v2Plan(), switchWith("A", 8, nil), "equipment-a")
	return must(t, p, withRev(panelWith("B", 9), "2"), "equipment-b")
}

func renameAll(t *testing.T, p planning.Plan, steps ...[2]string) planning.Plan {
	t.Helper()
	for _, s := range steps {
		p = must(t, p, renameOf(p.Revision, s[0], s[1]), "")
	}
	return p
}

func namesOf(s topology.Snapshot, ids ...string) []string {
	var out []string
	for _, id := range ids {
		for _, e := range s.Equipment {
			if e.ID == id {
				out = append(out, e.Name)
			}
		}
	}
	return out
}

// Renames are judged as a set: a name that another rename frees is free, in
// whatever order the entries are kept.
func TestRenamesApplyAsASetNotInListOrder(t *testing.T) {
	cases := map[string]struct {
		steps [][2]string
		want  []string
	}{
		"a to X, b to A, a to Y": {[][2]string{{"equipment-a", "X"}, {"equipment-b", "A"}, {"equipment-a", "Y"}}, []string{"Y", "A"}},
		"b to W, a to B, b to Z": {[][2]string{{"equipment-b", "W"}, {"equipment-a", "B"}, {"equipment-b", "Z"}}, []string{"B", "Z"}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			p := renameAll(t, pairWith(t), tc.steps...)
			got := namesOf(proposed(t, p), "equipment-a", "equipment-b")
			if len(got) != 2 || got[0] != tc.want[0] || got[1] != tc.want[1] {
				t.Fatalf("names %v, want %v", got, tc.want)
			}
			if c := planning.Check(acceptance.Installed(), p); len(c) != 0 {
				t.Fatalf("conflicts %+v", c)
			}
		})
	}
}

func TestARealRenameClashIsStillRefused(t *testing.T) {
	p := renameAll(t, pairWith(t), [2]string{"equipment-a", "X"})
	_, err := planning.Execute(acceptance.Installed(), p, renameOf(p.Revision, "equipment-b", "x"), "")
	if err == nil || err.Error() != "invalid plan command: equipment name already exists in this topology" {
		t.Fatalf("got %v", err)
	}
	// Two entries that really collide are caught by Check and Apply.
	p.Renames = []planning.Rename{{ID: "equipment-a", Name: "Same"}, {ID: "equipment-b", Name: "same"}}
	if c := planning.Check(acceptance.Installed(), p); len(c) == 0 {
		t.Fatal("a duplicate final name went unnoticed")
	}
	if _, err := planning.Apply(acceptance.Installed(), p); err == nil {
		t.Fatal("Apply accepted a duplicate final name")
	}
}

func TestAFreedNameCanBeUsedByANewPanel(t *testing.T) {
	p := renameAll(t, pairWith(t), [2]string{"equipment-a", "X"})
	p = must(t, p, withRev(panelWith("A", 10), p.Revision), "equipment-c")
	got := namesOf(proposed(t, p), "equipment-a", "equipment-c")
	if len(got) != 2 || got[0] != "X" || got[1] != "A" {
		t.Fatalf("names %v", got)
	}
}
