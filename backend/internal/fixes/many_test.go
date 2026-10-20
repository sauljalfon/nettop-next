package fixes

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"nettop.local/backend/internal/acceptance"
	"nettop.local/backend/internal/topology"
)

func TestApplyManyAppliesInOrderAndAnswersChangesPerFix(t *testing.T) {
	s := acceptance.Installed()
	next, changes, err := ApplyMany(s, []Fix{
		{Kind: Equipment, ID: "agg-03", Details: topology.Details{Manufacturer: ptr("Cisco")}},
		{Kind: Equipment, ID: "agg-08", Details: topology.Details{Model: ptr("C9500"), Status: ptr("maintenance")}},
		{Kind: Equipment, ID: "agg-03", Details: topology.Details{Manufacturer: ptr("Cisco")}}, // already so
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(changes) != 3 || len(changes[0]) != 1 || len(changes[1]) != 2 || len(changes[2]) != 0 {
		t.Fatalf("changes = %+v", changes)
	}
	if e := equipmentNamed(next, "agg-03"); e.Manufacturer != "Cisco" {
		t.Fatalf("agg-03 = %+v", e)
	}
	if e := equipmentNamed(next, "agg-08"); e.Model != "C9500" || e.Status != "maintenance" {
		t.Fatalf("agg-08 = %+v", e)
	}
	if equipmentNamed(s, "agg-03").Manufacturer == "Cisco" {
		t.Fatal("the input snapshot changed")
	}
}

func TestApplyManyTwoFixesOfOneObjectApplyInOrder(t *testing.T) {
	next, changes, err := ApplyMany(acceptance.Installed(), []Fix{
		{Kind: Equipment, ID: "agg-03", Details: topology.Details{Model: ptr("A")}},
		{Kind: Equipment, ID: "agg-03", Details: topology.Details{Model: ptr("B")}},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := [][]Change{
		{{Field: "model", OldValue: equipmentNamed(acceptance.Installed(), "agg-03").Model, NewValue: "A"}},
		{{Field: "model", OldValue: "A", NewValue: "B"}},
	}
	if !reflect.DeepEqual(changes, want) {
		t.Fatalf("changes = %+v, want %+v", changes, want)
	}
	if got := equipmentNamed(next, "agg-03").Model; got != "B" {
		t.Fatalf("model = %q", got)
	}
}

func TestApplyManyRefusalNamesTheFixAndAppliesNothing(t *testing.T) {
	s := acceptance.Installed()
	_, _, err := ApplyMany(s, []Fix{
		{Kind: Equipment, ID: "agg-03", Details: topology.Details{Model: ptr("A")}},
		{Kind: Equipment, ID: "agg-08", Details: topology.Details{Model: ptr("B")}},
		{Kind: Equipment, ID: "agg-03", Details: topology.Details{Status: ptr("broken")}},
	})
	if !errors.Is(err, topology.ErrInvalidInput) {
		t.Fatalf("err = %v", err)
	}
	if !strings.HasPrefix(err.Error(), "fix 3 (AGG-03): ") {
		t.Fatalf("err = %q", err)
	}
	if equipmentNamed(s, "agg-03").Model == "A" {
		t.Fatal("the input snapshot changed")
	}
}

func TestApplyManyKeepsTheErrorKindAndUsesTheIDWhenThereIsNoName(t *testing.T) {
	_, _, err := ApplyMany(acceptance.Installed(), []Fix{{Kind: Equipment, ID: "gone", Details: topology.Details{Model: ptr("A")}}})
	if !errors.Is(err, ErrNotFound) || !strings.Contains(err.Error(), "fix 1 (gone): ") {
		t.Fatalf("err = %v", err)
	}
	s, _ := mustApply(t, acceptance.Installed(), Fix{Kind: Equipment, ID: "agg-08", Details: topology.Details{SerialNumber: ptr("SN-1")}})
	_, _, err = ApplyMany(s, []Fix{{Kind: Equipment, ID: "agg-03", Details: topology.Details{SerialNumber: ptr("sn-1")}}})
	if !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "fix 1 (AGG-03): ") ||
		!strings.Contains(err.Error(), "is already the serial number of AGG-0") {
		t.Fatalf("err = %v", err)
	}
}

func TestApplyManyNamesTheFixThatBreaksValidationWithinTheBatch(t *testing.T) {
	_, _, err := ApplyMany(acceptance.Installed(), []Fix{
		{Kind: Equipment, ID: "agg-03", Details: topology.Details{Model: ptr("A")}},
		{Kind: Equipment, ID: "agg-08", Details: topology.Details{SerialNumber: ptr("SN-1")}},
		{Kind: Equipment, ID: "agg-03", Details: topology.Details{SerialNumber: ptr("sn-1")}},
	})
	if !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "fix 3 (AGG-03): ") {
		t.Fatalf("err = %v", err)
	}
}

func TestApplyManyRefusesANameBeforeApplyingAnything(t *testing.T) {
	_, _, err := ApplyMany(acceptance.Installed(), []Fix{
		{Kind: Equipment, ID: "agg-03", Details: topology.Details{Model: ptr("A")}},
		{Kind: Equipment, ID: "agg-08", Name: ptr("AGG-08B")},
	})
	if !errors.Is(err, topology.ErrInvalidInput) || !strings.Contains(err.Error(), "fix 2 (AGG-08): invalid input: names are changed one at a time") {
		t.Fatalf("err = %v", err)
	}
}

func TestApplyManyOfNothingChangesNothing(t *testing.T) {
	s := acceptance.Installed()
	next, changes, err := ApplyMany(s, nil)
	if err != nil || len(changes) != 0 || !reflect.DeepEqual(next, s) {
		t.Fatalf("next changed or err: %v %v", changes, err)
	}
}
