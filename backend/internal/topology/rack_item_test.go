package topology

import (
	"strings"
	"testing"
)

func rackItemSnapshot(itemType, itemText string) Snapshot {
	s := validSnapshot()
	s.Equipment = append(s.Equipment, Equipment{ID: "ri", Name: "Shelf 1", Kind: "rack_item", Role: "none", RackID: "r", Unit: 5, Height: 1, ItemType: itemType, ItemText: itemText})
	return s
}

func TestValidateRackItem(t *testing.T) {
	for _, typ := range []string{"ups", "pdu", "shelf", "cable-manager"} {
		if err := Validate(rackItemSnapshot(typ, "")); err != nil {
			t.Errorf("%s: %v", typ, err)
		}
	}
	if err := Validate(rackItemSnapshot("other", "KVM switch")); err != nil {
		t.Errorf("other: %v", err)
	}

	cases := []struct {
		name   string
		mutate func(*Snapshot)
		want   string
	}{
		{"no type", func(s *Snapshot) { s.Equipment[2].ItemType = "" }, "Shelf 1: a rack item needs a type: UPS, PDU, shelf, cable manager or other"},
		{"unknown type", func(s *Snapshot) { s.Equipment[2].ItemType = "toaster" }, "Shelf 1: a rack item needs a type: UPS, PDU, shelf, cable manager or other"},
		{"other without text", func(s *Snapshot) { s.Equipment[2].ItemType = "other" }, "Shelf 1: say what it is (an Other needs a short text)"},
		{"text on non-other", func(s *Snapshot) { s.Equipment[2].ItemText = "KVM" }, "Shelf 1: what it is is only for an Other"},
		{"text too long", func(s *Snapshot) {
			s.Equipment[2].ItemType = "other"
			s.Equipment[2].ItemText = strings.Repeat("k", 101)
		}, ""},
		{"type on a switch", func(s *Snapshot) { s.Equipment[0].Name = "Sw"; s.Equipment[0].ItemType = "ups" }, "Sw: only a rack item has a type"},
		{"text on a switch", func(s *Snapshot) { s.Equipment[0].Name = "Sw"; s.Equipment[0].ItemText = "x" }, "Sw: only a rack item has a type"},
		{"role access", func(s *Snapshot) { s.Equipment[2].Role = "access" }, ""},
		{"role passive", func(s *Snapshot) { s.Equipment[2].Role = "passive" }, ""},
		{"role none on a switch", func(s *Snapshot) { s.Equipment[0].Role = "none" }, ""},
		{"network", func(s *Snapshot) { s.Equipment[2].NetworkID = "net" }, ""},
		{"endpoint", func(s *Snapshot) {
			s.Endpoints = append(s.Endpoints, Endpoint{ID: "rp", EquipmentID: "ri", Label: "P"})
		}, "Shelf 1 is a rack item and has no ports"},
		{"collides with a switch", func(s *Snapshot) { s.Equipment[2].Unit = 2 }, "rack collision: b and ri"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := rackItemSnapshot("shelf", "")
			c.mutate(&s)
			err := Validate(s)
			if err == nil {
				t.Fatal("expected validation error")
			}
			if c.want != "" && err.Error() != c.want {
				t.Fatalf("got %q, want %q", err.Error(), c.want)
			}
		})
	}
}

func TestRackItemDetails(t *testing.T) {
	typ, text := "other", "KVM"
	d := Details{ItemType: &typ, ItemText: &text}
	fields := d.Fields()
	if len(fields) != 2 || fields[0] != (DetailField{"itemType", "other"}) || fields[1] != (DetailField{"itemText", "KVM"}) {
		t.Fatalf("fields %v", fields)
	}
	later := "ups"
	if m := d.Merge(Details{ItemType: &later}); *m.ItemType != "ups" || *m.ItemText != "KVM" {
		t.Fatal("merge")
	}
	item := Equipment{Kind: "rack_item"}
	if !item.SetDetail(DetailField{"itemType", "ups"}) || item.ItemType != "ups" || !item.SetDetail(DetailField{"itemText", "x"}) || item.ItemText != "x" {
		t.Fatal("rack item must take its detail fields")
	}
	sw := Equipment{Kind: "switch"}
	if sw.SetDetail(DetailField{"itemType", "ups"}) || sw.SetDetail(DetailField{"itemText", "x"}) {
		t.Fatal("a switch must not take rack item details")
	}
	if DetailWord("itemType") != "type" || DetailWord("itemText") != "what it is" {
		t.Fatal("words")
	}
}
