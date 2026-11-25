package persistence

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

func modelInput(name string) planning.SwitchModel {
	one := 1
	return planning.SwitchModel{Name: name, Manufacturer: "Cisco", Height: 1, PortGroups: []planning.PortGroupInput{
		{Count: 48, Names: "Gi1/0/{n}", Start: &one, Details: &planning.PortGroupDetails{PortType: "copper", Connector: "RJ45", Speed: "1G"}},
		{Count: 4, Names: "Te1/1/{n}", Start: &one, Details: &planning.PortGroupDetails{PortType: "fiber", Connector: "SFP+", Speed: "10G"}},
	}}
}

func TestSwitchModelsCRUDNeverChangesRevisionsOrDrafts(t *testing.T) {
	s, _ := seededAcceptance(t)
	ctx := context.Background()
	plan, err := s.CreatePlan(ctx, "Draft", "acceptance-1")
	if err != nil {
		t.Fatal(err)
	}
	before, _ := s.Installed(ctx)
	plansBefore, _ := s.Plans(ctx)
	plannedBefore, _ := s.Snapshot(ctx, plan.ID)
	unchanged := func(step string) {
		t.Helper()
		after, _ := s.Installed(ctx)
		if after.Revision != before.Revision || !reflect.DeepEqual(after, before) {
			t.Fatalf("%s changed the installed topology", step)
		}
		if plansAfter, _ := s.Plans(ctx); !reflect.DeepEqual(plansAfter, plansBefore) {
			t.Fatalf("%s changed a draft", step)
		}
		if planned, _ := s.Snapshot(ctx, plan.ID); planned.Revision != plannedBefore.Revision {
			t.Fatalf("%s changed the planned revision", step)
		}
	}

	if list, err := s.SwitchModels(ctx); err != nil || list == nil || len(list) != 0 {
		t.Fatalf("empty list must be non-nil and empty: %v %v", list, err)
	}
	b, err := s.CreateSwitchModel(ctx, modelInput("  b-model "))
	if err != nil {
		t.Fatal(err)
	}
	a, err := s.CreateSwitchModel(ctx, modelInput("A-model"))
	if err != nil {
		t.Fatal(err)
	}
	unchanged("create")
	if b.ID == "" || b.Name != "b-model" || len(b.PortGroups) != 2 {
		t.Fatalf("created: %+v", b)
	}
	list, err := s.SwitchModels(ctx)
	if err != nil || len(list) != 2 || list[0].ID != a.ID || list[1].ID != b.ID {
		t.Fatalf("sorted by name ignoring case: %+v %v", list, err)
	}
	if !reflect.DeepEqual(list[1], b) {
		t.Fatalf("round trip: %+v vs %+v", list[1], b)
	}

	_, err = s.CreateSwitchModel(ctx, modelInput("a-MODEL  "))
	if !errors.Is(err, topology.ErrDuplicateName) {
		t.Fatalf("duplicate ignoring case and spaces: %v", err)
	}
	renamed := modelInput("A-model")
	renamed.Height = 2
	got, err := s.UpdateSwitchModel(ctx, a.ID, renamed)
	if err != nil || got.Height != 2 || got.ID != a.ID {
		t.Fatalf("update keeping its own name: %+v %v", got, err)
	}
	if _, err = s.UpdateSwitchModel(ctx, a.ID, modelInput(" B-MODEL")); !errors.Is(err, topology.ErrDuplicateName) {
		t.Fatalf("rename onto another's name: %v", err)
	}
	if _, err = s.UpdateSwitchModel(ctx, "model-none", modelInput("X")); !errors.Is(err, topology.ErrModelNotFound) {
		t.Fatalf("unknown id: %v", err)
	}
	bad := modelInput("X")
	bad.PortGroups[0].Names = "nope"
	if _, err = s.CreateSwitchModel(ctx, bad); !errors.Is(err, topology.ErrInvalidInput) {
		t.Fatalf("invalid: %v", err)
	}
	unchanged("update")
	if err = s.DeleteSwitchModel(ctx, a.ID); err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteSwitchModel(ctx, a.ID); !errors.Is(err, topology.ErrModelNotFound) {
		t.Fatalf("delete twice: %v", err)
	}
	unchanged("delete")
	if list, _ = s.SwitchModels(ctx); len(list) != 1 || list[0].ID != b.ID {
		t.Fatalf("after delete: %+v", list)
	}
	if _, err = s.Command(ctx, plan.ID, planning.Command{Type: "add_equipment", ExpectedRevision: plan.Revision, Equipment: &planning.EquipmentInput{Name: "NEW-1", Kind: "switch", Role: "access", NetworkID: "net-a", RackID: "rack-a03", Unit: 7, Height: 1, PortCount: 4}}); err != nil {
		t.Fatalf("a draft must stay usable: %v", err)
	}
}
