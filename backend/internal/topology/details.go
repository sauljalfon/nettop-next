package topology

import (
	"fmt"
	"net/netip"
	"strings"
)

// Longest detail values, in characters: description and notes may hold more.
const (
	MaxDetailText = 200
	MaxDetailLong = 1000
)

var (
	equipmentStatuses = []string{"active", "inactive", "maintenance"}
	portTypes         = []string{"copper", "fiber"}
	portStates        = []string{"available", "reserved", "disabled", "faulty"}
	cableStatuses     = []string{"active", "inactive", "testing"}
	rackTypes         = []string{"standard", "wall-mount", "open-frame"}
)

// Details is the optional `details` payload of a command: any subset of the
// detail fields of the objects the plan adds. A nil field is not given; an
// empty string clears the field. Which fields apply depends on the object
// (see AppliesTo); an unknown field name is refused when the JSON is decoded.
type Details struct {
	Manufacturer *string `json:"manufacturer,omitempty"`
	Model        *string `json:"model,omitempty"`
	SerialNumber *string `json:"serialNumber,omitempty"`
	IPAddress    *string `json:"ipAddress,omitempty"`
	Status       *string `json:"status,omitempty"`
	Description  *string `json:"description,omitempty"`
	PortType     *string `json:"portType,omitempty"`
	Connector    *string `json:"connector,omitempty"`
	Speed        *string `json:"speed,omitempty"`
	State        *string `json:"state,omitempty"`
	Label        *string `json:"label,omitempty"`
	Notes        *string `json:"notes,omitempty"`
	Location     *string `json:"location,omitempty"`
	RackType     *string `json:"rackType,omitempty"`
}

// Fields lists the given fields, names in a fixed order, values trimmed.
func (d Details) Fields() []DetailField {
	var out []DetailField
	for _, f := range []struct {
		name string
		v    *string
	}{
		{"manufacturer", d.Manufacturer}, {"model", d.Model}, {"serialNumber", d.SerialNumber}, {"ipAddress", d.IPAddress},
		{"status", d.Status}, {"description", d.Description}, {"portType", d.PortType}, {"connector", d.Connector},
		{"speed", d.Speed}, {"state", d.State}, {"label", d.Label}, {"notes", d.Notes}, {"location", d.Location}, {"rackType", d.RackType},
	} {
		if f.v != nil {
			out = append(out, DetailField{f.name, strings.TrimSpace(*f.v)})
		}
	}
	return out
}

// Merge is d with the fields `later` gives replacing d's.
func (d Details) Merge(later Details) Details {
	pick := func(old, new *string) *string {
		if new != nil {
			return new
		}
		return old
	}
	return Details{
		Manufacturer: pick(d.Manufacturer, later.Manufacturer), Model: pick(d.Model, later.Model),
		SerialNumber: pick(d.SerialNumber, later.SerialNumber), IPAddress: pick(d.IPAddress, later.IPAddress),
		Status: pick(d.Status, later.Status), Description: pick(d.Description, later.Description),
		PortType: pick(d.PortType, later.PortType), Connector: pick(d.Connector, later.Connector),
		Speed: pick(d.Speed, later.Speed), State: pick(d.State, later.State), Label: pick(d.Label, later.Label),
		Notes: pick(d.Notes, later.Notes), Location: pick(d.Location, later.Location), RackType: pick(d.RackType, later.RackType),
	}
}

// DetailField is one detail field with its (trimmed) value.
type DetailField struct{ Name, Value string }

// Setters return false when the field does not apply to that kind of object.

func (e *Equipment) SetDetail(f DetailField) bool {
	switch f.Name {
	case "manufacturer":
		e.Manufacturer = f.Value
	case "model":
		e.Model = f.Value
	case "serialNumber":
		e.SerialNumber = f.Value
	case "ipAddress":
		e.IPAddress = f.Value
	case "status":
		e.Status = f.Value
	case "description":
		e.Description = f.Value
	default:
		return false
	}
	return true
}

func (p *Endpoint) SetDetail(f DetailField) bool {
	switch f.Name {
	case "portType":
		p.PortType = f.Value
	case "connector":
		p.Connector = f.Value
	case "speed":
		p.Speed = f.Value
	case "state":
		p.State = f.Value
	case "description":
		p.Description = f.Value
	default:
		return false
	}
	return true
}

func (l *Link) SetDetail(f DetailField) bool {
	if l.Kind != "cable" {
		return false
	}
	switch f.Name {
	case "label":
		l.Label = f.Value
	case "status":
		l.Status = f.Value
	case "notes":
		l.Notes = f.Value
	default:
		return false
	}
	return true
}

func (s *Site) SetDetail(f DetailField) bool {
	switch f.Name {
	case "location":
		s.Location = f.Value
	case "description":
		s.Description = f.Value
	default:
		return false
	}
	return true
}

func (n *LocationNode) SetDetail(f DetailField) bool {
	switch f.Name {
	case "location":
		n.Location = f.Value
	case "description":
		n.Description = f.Value
	default:
		return false
	}
	return true
}

func (r *Rack) SetDetail(f DetailField) bool {
	switch f.Name {
	case "location":
		r.Location = f.Value
	case "rackType":
		r.RackType = f.Value
	case "description":
		r.Description = f.Value
	default:
		return false
	}
	return true
}

// DetailWord is a detail field's name as words for a message ("IP address",
// "serial number", "port type", "rack type"), never the JSON name.
func DetailWord(name string) string {
	switch name {
	case "serialNumber":
		return "serial number"
	case "ipAddress":
		return "IP address"
	case "portType":
		return "port type"
	case "rackType":
		return "rack type"
	}
	return name
}

// field is one checked value: text up to max characters, optionally one of a set.
type field struct {
	name, value string
	max         int
	oneOf       []string
}

// problem says in names ("who: ...") why the value is not allowed, or "".
func (f field) problem(who string) string {
	if len([]rune(f.value)) > f.max {
		return fmt.Sprintf("%s: %s is longer than %d characters", who, DetailWord(f.name), f.max)
	}
	if f.value == "" || f.oneOf == nil {
		return ""
	}
	for _, v := range f.oneOf {
		if f.value == v {
			return ""
		}
	}
	return fmt.Sprintf("%s: %s must be %s, not %q", who, DetailWord(f.name), orList(f.oneOf), f.value)
}

func orList(values []string) string {
	if len(values) < 2 {
		return strings.Join(values, "")
	}
	return strings.Join(values[:len(values)-1], ", ") + " or " + values[len(values)-1]
}

func firstProblem(who string, fields ...field) string {
	for _, f := range fields {
		if p := f.problem(who); p != "" {
			return p
		}
	}
	return ""
}

// DetailProblem says in names why an object's detail values are not allowed
// ("" when they are). who is how the user knows the object.

func (e Equipment) DetailProblem() string {
	if p := firstProblem(e.Name,
		field{"manufacturer", e.Manufacturer, MaxDetailText, nil}, field{"model", e.Model, MaxDetailText, nil},
		field{"serialNumber", e.SerialNumber, MaxDetailText, nil}, field{"ipAddress", e.IPAddress, MaxDetailText, nil},
		field{"status", e.Status, MaxDetailText, equipmentStatuses}, field{"description", e.Description, MaxDetailLong, nil}); p != "" {
		return p
	}
	if e.IPAddress != "" {
		if _, err := netip.ParseAddr(e.IPAddress); err != nil {
			return fmt.Sprintf("%s: IP address %q is not an IPv4 or IPv6 address", e.Name, e.IPAddress)
		}
	}
	return ""
}

func (p Endpoint) DetailProblem(who string) string {
	return firstProblem(who,
		field{"portType", p.PortType, MaxDetailText, portTypes}, field{"connector", p.Connector, MaxDetailText, nil},
		field{"speed", p.Speed, MaxDetailText, nil}, field{"state", p.State, MaxDetailText, portStates},
		field{"description", p.Description, MaxDetailLong, nil})
}

func (l Link) DetailProblem() string {
	who := "cable " + l.ID
	if l.Kind != "cable" {
		if l.Label != "" || l.Status != "" || l.Notes != "" {
			return fmt.Sprintf("bridge %s cannot carry cable details", l.ID)
		}
		return ""
	}
	return firstProblem(who,
		field{"label", l.Label, MaxDetailText, nil}, field{"status", l.Status, MaxDetailText, cableStatuses},
		field{"notes", l.Notes, MaxDetailLong, nil})
}

func (s Site) DetailProblem() string {
	return firstProblem(s.Name, field{"location", s.Location, MaxDetailText, nil}, field{"description", s.Description, MaxDetailLong, nil})
}

func (n LocationNode) DetailProblem() string {
	return firstProblem(n.Name, field{"location", n.Location, MaxDetailText, nil}, field{"description", n.Description, MaxDetailLong, nil})
}

func (r Rack) DetailProblem() string {
	return firstProblem(r.Name, field{"location", r.Location, MaxDetailText, nil},
		field{"rackType", r.RackType, MaxDetailText, rackTypes}, field{"description", r.Description, MaxDetailLong, nil})
}

// SerialProblem says why serial number `serial` cannot be used by `who`, given
// the owner of each serial number already used (lower-cased): "" when it is
// empty or free.
func SerialProblem(serial string, owners map[string]string) string {
	if serial == "" {
		return ""
	}
	if owner, taken := owners[strings.ToLower(serial)]; taken {
		return fmt.Sprintf("%s is already the serial number of %s", serial, owner)
	}
	return ""
}

// detailsProblem checks every object's detail values and the serial numbers.
func detailsProblem(s Snapshot) string {
	for _, x := range s.Sites {
		if p := x.DetailProblem(); p != "" {
			return p
		}
	}
	for _, x := range s.Nodes {
		if p := x.DetailProblem(); p != "" {
			return p
		}
	}
	for _, x := range s.Racks {
		if p := x.DetailProblem(); p != "" {
			return p
		}
	}
	names := make(map[string]string, len(s.Equipment))
	owners := map[string]string{}
	for _, e := range s.Equipment {
		names[e.ID] = e.Name
		if p := e.DetailProblem(); p != "" {
			return p
		}
		if p := SerialProblem(e.SerialNumber, owners); p != "" {
			return p
		}
		if e.SerialNumber != "" {
			owners[strings.ToLower(e.SerialNumber)] = e.Name
		}
	}
	for _, p := range s.Endpoints {
		if p.PortType == "" && p.Connector == "" && p.Speed == "" && p.State == "" && p.Description == "" {
			continue
		}
		if msg := p.DetailProblem(names[p.EquipmentID] + " · " + p.Label); msg != "" {
			return msg
		}
	}
	for _, l := range s.Links {
		if msg := l.DetailProblem(); msg != "" {
			return msg
		}
	}
	return ""
}
