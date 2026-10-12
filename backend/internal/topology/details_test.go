package topology_test

import (
	"strings"
	"testing"

	"nettop.local/backend/internal/topology"
)

// detailsBase is base() with endpoint labels and one cable, so every kind of
// object that can carry details exists.
func detailsBase() topology.Snapshot {
	s := base()
	s.Endpoints = []topology.Endpoint{
		{ID: "sw1:p1", EquipmentID: "sw1", Label: "Port 1"},
		{ID: "sw1:p2", EquipmentID: "sw1", Label: "Port 2"},
		{ID: "sw2:p1", EquipmentID: "sw2", Label: "Port 1"},
	}
	s.Links = []topology.Link{{ID: "cable-1", A: "sw1:p1", B: "sw2:p1", Kind: "cable"}}
	s.Sites[0].Name = "Campus"
	s.Racks[0].Name = "Rack 1"
	return s
}

// FD-02 (domain): the fields are checked by Validate, so they hold for
// Installed and every proposed topology, and each reason is in names.
func TestFD02DetailValuesAreValidatedInNames(t *testing.T) {
	long := strings.Repeat("x", 201)
	longText := strings.Repeat("x", 1001)
	cases := map[string]struct {
		change func(*topology.Snapshot)
		want   string
	}{
		"equipment status":        {func(s *topology.Snapshot) { s.Equipment[0].Status = "broken" }, `SW1: status must be active, inactive or maintenance, not "broken"`},
		"equipment manufacturer":  {func(s *topology.Snapshot) { s.Equipment[0].Manufacturer = long }, "SW1: manufacturer is longer than 200 characters"},
		"equipment description":   {func(s *topology.Snapshot) { s.Equipment[0].Description = longText }, "SW1: description is longer than 1000 characters"},
		"equipment ip":            {func(s *topology.Snapshot) { s.Equipment[1].IPAddress = "10.0.0.256" }, `SW2: IP address "10.0.0.256" is not an IPv4 or IPv6 address`},
		"port type":               {func(s *topology.Snapshot) { s.Endpoints[0].PortType = "coax" }, `SW1 · Port 1: port type must be copper or fiber, not "coax"`},
		"port state":              {func(s *topology.Snapshot) { s.Endpoints[1].State = "broken" }, `SW1 · Port 2: state must be available, reserved, disabled or faulty, not "broken"`},
		"port speed length":       {func(s *topology.Snapshot) { s.Endpoints[2].Speed = long }, "SW2 · Port 1: speed is longer than 200 characters"},
		"serial number length":    {func(s *topology.Snapshot) { s.Equipment[0].SerialNumber = long }, "SW1: serial number is longer than 200 characters"},
		"cable status":            {func(s *topology.Snapshot) { s.Links[0].Status = "broken" }, `cable cable-1: status must be active, inactive or testing, not "broken"`},
		"cable notes length":      {func(s *topology.Snapshot) { s.Links[0].Notes = longText }, "cable cable-1: notes is longer than 1000 characters"},
		"rack type":               {func(s *topology.Snapshot) { s.Racks[0].RackType = "tower" }, `Rack 1: rack type must be standard, wall-mount or open-frame, not "tower"`},
		"site location length":    {func(s *topology.Snapshot) { s.Sites[0].Location = long }, "Campus: location is longer than 200 characters"},
		"node description length": {func(s *topology.Snapshot) { s.Nodes[0].Description = longText }, "Room: description is longer than 1000 characters"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			s := detailsBase()
			c.change(&s)
			err := topology.Validate(s)
			if err == nil || err.Error() != c.want {
				t.Fatalf("got %v\nwant %s", err, c.want)
			}
		})
	}
}

func TestFD02ValidValuesAreAccepted(t *testing.T) {
	s := detailsBase()
	s.Equipment[0].Manufacturer, s.Equipment[0].Model, s.Equipment[0].Status = "Acme", "X1", "maintenance"
	s.Equipment[0].IPAddress = "10.0.0.1"
	s.Equipment[1].IPAddress = "2001:db8::1"
	s.Equipment[1].SerialNumber = strings.Repeat("s", 200)
	s.Endpoints[0].PortType, s.Endpoints[0].Connector, s.Endpoints[0].Speed, s.Endpoints[0].State = "fiber", "SFP+", "10G", "faulty"
	s.Links[0].Label, s.Links[0].Status, s.Links[0].Notes = "A-1", "testing", strings.Repeat("n", 1000)
	s.Racks[0].RackType, s.Racks[0].Location = "open-frame", "north wall"
	s.Sites[0].Description, s.Nodes[0].Location = "main", "floor 2"
	mustValid(t, s)
}

// The IP address is not unique: two devices may share one (a stack, a VIP).
func TestFD02IPAddressIsNotUnique(t *testing.T) {
	s := detailsBase()
	s.Equipment[0].IPAddress, s.Equipment[1].IPAddress = "10.0.0.1", "10.0.0.1"
	mustValid(t, s)
}

// The serial number is unique among non-empty values, ignoring case.
func TestFD02SerialNumberIsUniqueIgnoringCase(t *testing.T) {
	s := detailsBase()
	s.Equipment[0].SerialNumber, s.Equipment[1].SerialNumber = "SN-0042", "sn-0042"
	err := topology.Validate(s)
	if err == nil || err.Error() != "sn-0042 is already the serial number of SW1" {
		t.Fatalf("got %v", err)
	}
	s.Equipment[1].SerialNumber = "" // empty values never clash
	s.Equipment[0].SerialNumber = ""
	mustValid(t, s)
}

// A bridge carries no details.
func TestFD02ABridgeCarriesNoDetails(t *testing.T) {
	s, h := withHDF(1, 1)
	_ = h
	for i, l := range s.Links {
		if l.Kind == "internal" {
			s.Links[i].Label = "no"
			break
		}
	}
	err := topology.Validate(s)
	if err == nil || !strings.Contains(err.Error(), "bridge") {
		t.Fatalf("got %v, want a bridge refusal", err)
	}
}
