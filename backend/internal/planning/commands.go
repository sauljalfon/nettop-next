package planning

import (
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"nettop.local/backend/internal/topology"
)

var ErrInvalid = errors.New("invalid plan command")

type EquipmentInput struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Role      string `json:"role"`
	NetworkID string `json:"networkId,omitempty"`
	RackID    string `json:"rackId"`
	Unit      int    `json:"unit"`
	Height    int    `json:"height"`
	// PortCount is the ports of a switch (1–96) or the positions of a panel
	// (1–48). A switch given portGroups leaves it out (or gives their total).
	PortCount int `json:"portCount"`
	// PortGroups (switches only, 1–8) name and describe the ports in groups,
	// such as 24 × Gi1/0/{n} copper and 4 × Te1/1/{n} fiber. Without them a
	// switch has one group, "Port {n}".
	PortGroups []PortGroupInput `json:"portGroups,omitempty"`
	// Details are the optional detail fields of the equipment (never of its ports).
	Details *topology.Details `json:"details,omitempty"`
}

// PortGroupInput is one group of a switch's ports: Count ports named by
// Names (exactly one "{n}") numbered from Start (default 1).
//
// Instead of a pattern a group may give its Labels as they are (Duplicate does,
// because a label is display text and is never parsed back into a pattern).
type PortGroupInput struct {
	Count   int               `json:"count,omitempty"`
	Names   string            `json:"names,omitempty"`
	Start   *int              `json:"start,omitempty"`
	Labels  []string          `json:"labels,omitempty"`
	Details *PortGroupDetails `json:"details,omitempty"`
}

// PortGroupDetails are the port details every port of a group starts with.
type PortGroupDetails struct {
	PortType  string `json:"portType,omitempty"`
	Connector string `json:"connector,omitempty"`
	Speed     string `json:"speed,omitempty"`
}

// HDFInput creates one HDF chassis with its complete grid atomically. Rows and
// rack height are independent: rows sets the grid (4 columns × rows), height the
// chassis size in rack units.
type HDFInput struct {
	Name   string `json:"name"`
	RackID string `json:"rackId"`
	Unit   int    `json:"unit"`
	Height int    `json:"height"`
	Rows   int    `json:"rows"`
	// Details apply to the HDF itself.
	Details *topology.Details `json:"details,omitempty"`
}
type CableInput struct {
	A       string            `json:"a"`
	B       string            `json:"b"`
	Details *topology.Details `json:"details,omitempty"`
}
type PlacementInput struct {
	EquipmentID string `json:"equipmentId"`
	RackID      string `json:"rackId"`
	Unit        int    `json:"unit"`
}
type SiteInput struct {
	Name    string            `json:"name"`
	Details *topology.Details `json:"details,omitempty"`
}
type NodeInput struct {
	SiteID  string            `json:"siteId"`
	Name    string            `json:"name"`
	Details *topology.Details `json:"details,omitempty"`
}
type RackInput struct {
	NodeID  string            `json:"nodeId"`
	Name    string            `json:"name"`
	Units   int               `json:"units"`
	Details *topology.Details `json:"details,omitempty"`
}

// TargetInput names the object a delete_* or disconnect_cable command acts on:
// an equipment ID, a cable (link) ID, or a rack, node or site ID.
type TargetInput struct {
	ID string `json:"id"`
}

// Command carries exactly one payload, the one its Type needs.
type Command struct {
	Type             string          `json:"type"`
	ExpectedRevision string          `json:"expectedRevision"`
	Equipment        *EquipmentInput `json:"equipment,omitempty"`
	Cable            *CableInput     `json:"cable,omitempty"`
	Placement        *PlacementInput `json:"placement,omitempty"`
	HDF              *HDFInput       `json:"hdf,omitempty"`
	Site             *SiteInput      `json:"site,omitempty"`
	Node             *NodeInput      `json:"node,omitempty"`
	Rack             *RackInput      `json:"rack,omitempty"`
	Target           *TargetInput    `json:"target,omitempty"`
	Change           *ChangeInput    `json:"change,omitempty"`
	Batch            *BatchInput     `json:"batch,omitempty"`
	// Details go with a target in update_details; every other command carries
	// its details inside its own payload.
	Details *topology.Details `json:"details,omitempty"`
}

// ChangeInput names one change of a draft by the key Check reports for it:
// "<kind>:<id>", e.g. "add_equipment:edge-18" or "remove_equipment:panel-a".
type ChangeInput struct {
	Key string `json:"key"`
}

// payloads counts the payloads a command carries.
func (c Command) payloads() int {
	n := 0
	for _, present := range []bool{c.Equipment != nil, c.Cable != nil, c.Placement != nil, c.HDF != nil, c.Site != nil, c.Node != nil, c.Rack != nil, c.Target != nil, c.Change != nil, c.Batch != nil} {
		if present {
			n++
		}
	}
	return n
}

// Execute is independent of storage. id is allocated by the application boundary
// and shared by all endpoints of an equipment addition before it is persisted.
func Execute(base topology.Snapshot, p Plan, c Command, id string) (Plan, error) {
	invalid := func(message string) (Plan, error) { return Plan{}, fmt.Errorf("%w: %s", ErrInvalid, message) }
	if c.Type == "remove_change" { // allowed on a stale draft: it can only shrink it
		next, _, err := ExecuteRemoveChange(base, p, c)
		return next, err
	}
	if c.Type == "batch" { // needs one ID per command from the application boundary
		return invalid("a batch is run by ExecuteBatch, with its IDs")
	}
	if p.Status == "recorded" {
		return Plan{}, ErrRecorded
	}
	if c.ExpectedRevision == "" {
		return invalid("expectedRevision is required")
	}
	if c.ExpectedRevision != p.Revision {
		return Plan{}, fmt.Errorf("%w: this draft changed; refresh before trying again", ErrConflict)
	}
	current, err := Apply(base, p)
	if err != nil {
		return Plan{}, err
	}
	next, _, err := applyCommand(base, current, p, c, id)
	if err != nil {
		return Plan{}, err
	}
	proposed, err := Apply(base, next)
	if err != nil {
		return invalid(err.Error())
	}
	next.Labels = planLabels(next, proposed, base)
	revision, err := strconv.ParseInt(p.Revision, 10, 64)
	if err != nil {
		return Plan{}, fmt.Errorf("invalid stored revision: %w", err)
	}
	next.Revision = strconv.FormatInt(revision+1, 10)
	return next, nil
}

// applyCommand validates one command against current (the proposed topology of
// plan p) and returns the changed plan together with delta: a plan holding only
// what this command added, moved or removed, so a caller that keeps a working
// snapshot (a batch) can update it incrementally instead of applying the whole
// plan again. It neither bumps the revision nor runs Apply.
func applyCommand(base, current topology.Snapshot, p Plan, c Command, id string) (Plan, Plan, error) {
	invalid := func(message string) (Plan, Plan, error) {
		return Plan{}, Plan{}, fmt.Errorf("%w: %s", ErrInvalid, message)
	}
	var delta Plan
	next := p.clone()
	was := struct{ sites, nodes, racks, equipment, subpanels, endpoints, links int }{len(p.Sites), len(p.Nodes), len(p.Racks), len(p.Equipment), len(p.Subpanels), len(p.Endpoints), len(p.Links)}
	// New code writes placements, never the legacy full-equipment updates.
	next.Placements, next.Updates = p.effectivePlacements(), []topology.Equipment{}
	if next.Subpanels == nil {
		next.Subpanels = []topology.Subpanel{}
	}
	if c.Details != nil && c.Type != "update_details" {
		return invalid(c.Type + " takes its details inside its payload")
	}
	switch c.Type {
	case "add_equipment":
		if c.Equipment == nil || c.payloads() != 1 {
			return invalid("add_equipment requires only an equipment payload")
		}
		e := *c.Equipment
		e.Name = strings.TrimSpace(e.Name)
		if len(e.Name) < 1 || len(e.Name) > 100 {
			return invalid("equipment name must contain 1–100 characters")
		}
		var ports []portSpec // a switch's ports, in position order
		if len(e.PortGroups) > 0 {
			if e.Kind != "switch" {
				return invalid(e.Name + ": port groups are for switches")
			}
			var err error
			if ports, err = portGroupPorts(e.Name, e.PortGroups); err != nil {
				return Plan{}, Plan{}, err
			}
			if e.PortCount != 0 && e.PortCount != len(ports) {
				return invalid(fmt.Sprintf("%s: portCount %d disagrees with the %d ports of its port groups; give one or the other", e.Name, e.PortCount, len(ports)))
			}
			e.PortCount = len(ports)
		} else {
			most := 48 // panel positions
			if e.Kind == "switch" {
				most = MaxSwitchPorts
			}
			if e.PortCount < 1 || e.PortCount > most {
				return invalid(fmt.Sprintf("port count must be between 1 and %d", most))
			}
			if e.Kind == "switch" {
				for n := 1; n <= e.PortCount; n++ {
					ports = append(ports, portSpec{label: fmt.Sprintf("Port %d", n), group: 1})
				}
			}
		}
		if e.Unit < 1 || e.Unit > 100 || e.Height < 1 || e.Height > 100 {
			return invalid("rack unit and height must be between 1 and 100")
		}
		if (e.Kind == "switch" && e.Role != "access" && e.Role != "aggregation" && e.Role != "backbone") || (e.Kind == "panel" && e.Role != "passive") || (e.Kind != "panel" && e.Kind != "switch") {
			return invalid("choose access/aggregation/backbone for a switch or passive for a panel")
		}
		if e.Kind == "switch" && e.NetworkID == "" {
			return invalid("a switch requires networkId")
		}
		if e.Kind == "panel" && e.NetworkID != "" {
			return invalid("passive panels are shared and cannot have a networkId")
		}
		for _, existing := range current.Equipment {
			if strings.EqualFold(existing.Name, e.Name) {
				return invalid("equipment name already exists in this topology")
			}
		}
		if problem := placementProblem(current, e.RackID, e.Unit, e.Height, nil, p.Labels); problem != "" {
			return invalid(problem)
		}
		added := topology.Equipment{ID: id, Name: e.Name, Kind: e.Kind, Role: e.Role, NetworkID: e.NetworkID, RackID: e.RackID, Unit: e.Unit, Height: e.Height}
		if err := setDetails(c.Equipment.Details, "equipment "+e.Name, added.SetDetail); err != nil {
			return Plan{}, Plan{}, err
		}
		next.Equipment = append(next.Equipment, added)
		for n := 1; n <= e.PortCount; n++ {
			portID := fmt.Sprintf("%s:p%d", id, n)
			if e.Kind == "switch" {
				spec := ports[n-1]
				next.Endpoints = append(next.Endpoints, topology.Endpoint{ID: portID, EquipmentID: id, Label: spec.label, Position: n, PortGroup: spec.group,
					PortType: spec.portType, Connector: spec.connector, Speed: spec.speed})
				continue
			}
			for _, side := range []string{"front", "rear"} {
				next.Endpoints = append(next.Endpoints, topology.Endpoint{ID: portID + ":" + side, EquipmentID: id, Label: fmt.Sprintf("%d · %s", n, side), Position: n, Side: side})
			}
			next.Links = append(next.Links, topology.Link{ID: portID + ":bridge", A: portID + ":front", B: portID + ":rear", Kind: "internal"})
		}
	case "add_hdf":
		if c.HDF == nil || c.payloads() != 1 {
			return invalid("add_hdf requires only an hdf payload")
		}
		h := *c.HDF
		h.Name = strings.TrimSpace(h.Name)
		if len(h.Name) < 1 || len(h.Name) > 100 {
			return invalid("HDF name must contain 1–100 characters")
		}
		// Rows are checked before anything is built so a huge value can never
		// allocate: the per-command safety cap is 128 subpanels, 768 positions,
		// and 1,536 side endpoints (exactly what MaxHDFRows rows produce).
		if h.Rows < 1 || h.Rows > topology.MaxHDFRows {
			return invalid(fmt.Sprintf("rows must be between 1 and %d", topology.MaxHDFRows))
		}
		if h.Unit < 1 || h.Unit > 100 || h.Height < 1 || h.Height > 100 {
			return invalid("rack unit and height must be between 1 and 100")
		}
		for _, existing := range current.Equipment {
			if strings.EqualFold(existing.Name, h.Name) {
				return invalid("equipment name already exists in this topology")
			}
		}
		if problem := placementProblem(current, h.RackID, h.Unit, h.Height, nil, p.Labels); problem != "" {
			return invalid(problem)
		}
		built := topology.NewHDF(id, h.Name, h.RackID, h.Unit, h.Height, h.Rows)
		if err := setDetails(c.HDF.Details, "equipment "+h.Name, built.Equipment.SetDetail); err != nil {
			return Plan{}, Plan{}, err
		}
		next.Equipment = append(next.Equipment, built.Equipment)
		next.Subpanels = append(next.Subpanels, built.Subpanels...)
		next.Endpoints = append(next.Endpoints, built.Endpoints...)
		next.Links = append(next.Links, built.Links...)
	case "add_cable":
		if c.Cable == nil || c.payloads() != 1 {
			return invalid("add_cable requires only a cable payload")
		}
		a, b := c.Cable.A, c.Cable.B
		if problem := cableProblem(current, a, b, p.Labels); problem != "" {
			return invalid(problem)
		}
		if a > b {
			a, b = b, a
		}
		added := topology.Link{ID: id, A: a, B: b, Kind: "cable"}
		if err := setDetails(c.Cable.Details, "a cable", added.SetDetail); err != nil {
			return Plan{}, Plan{}, err
		}
		next.Links = append(next.Links, added)
	case "move_equipment":
		if c.Placement == nil || c.payloads() != 1 {
			return invalid("move_equipment requires only a placement payload")
		}
		input := c.Placement
		if input.Unit < 1 || input.Unit > 100 {
			return invalid("starting rack unit must be between 1 and 100")
		}
		var updated topology.Equipment
		found := false
		for _, e := range current.Equipment {
			if e.ID == input.EquipmentID {
				updated = e
				found = true
				break
			}
		}
		if !found {
			return invalid("unknown equipment")
		}
		if problem := placementProblem(current, input.RackID, input.Unit, updated.Height, map[string]bool{updated.ID: true}, p.Labels); problem != "" {
			return invalid(problem)
		}
		updated.RackID, updated.Unit = input.RackID, input.Unit
		delta.Placements = []PlacementInput{*input}
		if i := slices.IndexFunc(next.Equipment, func(e topology.Equipment) bool { return e.ID == input.EquipmentID }); i >= 0 {
			next.Equipment[i].RackID, next.Equipment[i].Unit = input.RackID, input.Unit // proposed equipment is moved in its addition
		} else if i := slices.IndexFunc(next.Placements, func(pl PlacementInput) bool { return pl.EquipmentID == input.EquipmentID }); i >= 0 {
			next.Placements[i] = *input
		} else {
			next.Placements = append(next.Placements, *input)
		}
	case "add_site":
		if c.Site == nil || c.payloads() != 1 {
			return invalid("add_site requires only a site payload")
		}
		name, ok := validName(c.Site.Name)
		if !ok {
			return invalid("site name must contain 1–100 characters")
		}
		if slices.ContainsFunc(current.Sites, func(x topology.Site) bool { return strings.EqualFold(x.Name, name) }) {
			return invalid("site name already exists")
		}
		added := topology.Site{ID: id, Name: name}
		if err := setDetails(c.Site.Details, "site "+name, added.SetDetail); err != nil {
			return Plan{}, Plan{}, err
		}
		next.Sites = append(next.Sites, added)
	case "add_node":
		if c.Node == nil || c.payloads() != 1 {
			return invalid("add_node requires only a node payload")
		}
		name, ok := validName(c.Node.Name)
		if !ok {
			return invalid("node name must contain 1–100 characters")
		}
		if !slices.ContainsFunc(current.Sites, func(x topology.Site) bool { return x.ID == c.Node.SiteID }) {
			return invalid("unknown site " + c.Node.SiteID)
		}
		if slices.ContainsFunc(current.Nodes, func(x topology.LocationNode) bool {
			return x.SiteID == c.Node.SiteID && strings.EqualFold(x.Name, name)
		}) {
			return invalid("node name already exists in this site")
		}
		added := topology.LocationNode{ID: id, SiteID: c.Node.SiteID, Name: name}
		if err := setDetails(c.Node.Details, "node "+name, added.SetDetail); err != nil {
			return Plan{}, Plan{}, err
		}
		next.Nodes = append(next.Nodes, added)
	case "add_rack":
		if c.Rack == nil || c.payloads() != 1 {
			return invalid("add_rack requires only a rack payload")
		}
		name, ok := validName(c.Rack.Name)
		if !ok {
			return invalid("rack name must contain 1–100 characters")
		}
		if c.Rack.Units < 1 || c.Rack.Units > 60 {
			return invalid("rack units must be between 1–60")
		}
		if !slices.ContainsFunc(current.Nodes, func(x topology.LocationNode) bool { return x.ID == c.Rack.NodeID }) {
			return invalid("unknown node " + c.Rack.NodeID)
		}
		if slices.ContainsFunc(current.Racks, func(x topology.Rack) bool {
			return x.NodeID == c.Rack.NodeID && strings.EqualFold(x.Name, name)
		}) {
			return invalid("rack name already exists in this node")
		}
		added := topology.Rack{ID: id, NodeID: c.Rack.NodeID, Name: name, Units: c.Rack.Units}
		if err := setDetails(c.Rack.Details, "rack "+name, added.SetDetail); err != nil {
			return Plan{}, Plan{}, err
		}
		next.Racks = append(next.Racks, added)
	case "update_details":
		if c.Target == nil || c.Details == nil || c.payloads() != 1 {
			return invalid("update_details requires a target and details")
		}
		if len(c.Details.Fields()) == 0 {
			return invalid("update_details needs at least one field")
		}
		if err := updateDetails(&next, current, *c.Target, *c.Details, &delta); err != nil {
			return Plan{}, Plan{}, err
		}
	case "delete_equipment", "disconnect_cable", "delete_rack", "delete_node", "delete_site":
		if c.Target == nil || c.payloads() != 1 {
			return invalid(c.Type + " requires only a target payload")
		}
		kind := map[string]RemovalKind{"delete_equipment": RemoveEquipment, "disconnect_cable": RemoveLink, "delete_rack": RemoveRack, "delete_node": RemoveNode, "delete_site": RemoveSite}[c.Type]
		removed, err := next.remove(base, current, kind, c.Target.ID)
		if err != nil {
			return Plan{}, Plan{}, err
		}
		next = removed
		delta.Removals = removal(kind, c.Target.ID)
	default:
		return invalid("supported commands are add_equipment, add_hdf, add_cable, move_equipment, add_site, add_node, add_rack, update_details, delete_equipment, disconnect_cable, delete_rack, delete_node, delete_site, remove_change, and batch")
	}
	// What was appended is what the command added.
	delta.Sites, delta.Nodes, delta.Racks = next.Sites[min(was.sites, len(next.Sites)):], next.Nodes[min(was.nodes, len(next.Nodes)):], next.Racks[min(was.racks, len(next.Racks)):]
	delta.Equipment, delta.Subpanels = next.Equipment[min(was.equipment, len(next.Equipment)):], next.Subpanels[min(was.subpanels, len(next.Subpanels)):]
	delta.Endpoints, delta.Links = next.Endpoints[min(was.endpoints, len(next.Endpoints)):], next.Links[min(was.links, len(next.Links)):]
	if problem := addedDetailsProblem(current, delta); problem != "" {
		return invalid(problem)
	}
	return next, delta, nil
}

// removal is a plan's Removals holding just one object.
func removal(kind RemovalKind, id string) Removals {
	switch kind {
	case RemoveEquipment:
		return Removals{Equipment: []string{id}}
	case RemoveLink:
		return Removals{Links: []string{id}}
	case RemoveRack:
		return Removals{Racks: []string{id}}
	case RemoveNode:
		return Removals{Nodes: []string{id}}
	}
	return Removals{Sites: []string{id}}
}

// validName trims name and reports whether it has 1–100 characters.
func validName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	return name, len([]rune(name)) >= 1 && len([]rune(name)) <= 100
}

func unitRange(from, to int) string {
	if from == to {
		return fmt.Sprintf("U%d", from)
	}
	return fmt.Sprintf("U%d–%d", from, to)
}

func unitsWord(n int) string {
	if n == 1 {
		return "1 unit"
	}
	return fmt.Sprintf("%d units", n)
}

// placementProblem says in names why equipment of this height cannot sit at the
// unit in the rack: it does not fit, or other equipment holds the units. It
// returns "" when the placement is fine. ignore holds the equipment that does not count as in the way (the one being moved, or what a plan moves or removes).
// Validate stays the safety net; this is what the user reads.
func placementProblem(s topology.Snapshot, rackID string, unit, height int, ignore map[string]bool, labels map[string]string) string {
	i := slices.IndexFunc(s.Racks, func(r topology.Rack) bool { return r.ID == rackID })
	if i < 0 {
		return gone(labels, rackID, "unknown rack "+rackID)
	}
	rack := s.Racks[i]
	if unit < 1 || unit+height-1 > rack.Units {
		verb := "do"
		if height == 1 {
			verb = "does"
		}
		return fmt.Sprintf("%s has units 1–%d; %s from U%d %s not fit", rack.Name, rack.Units, unitsWord(height), unit, verb)
	}
	from, to := 1<<30, 0
	var names []string
	for _, e := range s.Equipment {
		if e.RackID != rackID || ignore[e.ID] {
			continue
		}
		lo, hi := max(unit, e.Unit), min(unit+height-1, e.Unit+e.Height-1)
		if lo > hi {
			continue
		}
		from, to = min(from, lo), max(to, hi)
		names = append(names, e.Name)
	}
	if len(names) == 0 {
		return ""
	}
	who := names[0]
	if len(names) > 1 {
		who = strings.Join(names[:len(names)-1], ", ") + " and " + names[len(names)-1]
	}
	return fmt.Sprintf("%s in %s is taken by %s", unitRange(from, to), rack.Name, who)
}

// cableProblem says in names why a cable cannot join these two endpoints.
func cableProblem(s topology.Snapshot, a, b string, labels map[string]string) string {
	names := map[string]string{}
	owners := map[string]string{}
	equipmentOf := map[string]string{}
	for _, e := range s.Equipment {
		owners[e.ID] = e.Name
	}
	for _, p := range s.Endpoints {
		if p.ID == a || p.ID == b {
			names[p.ID] = owners[p.EquipmentID] + " · " + p.Label
			equipmentOf[p.ID] = p.EquipmentID
		}
	}
	for _, id := range []string{a, b} {
		if _, ok := names[id]; !ok {
			return gone(labels, id, "endpoint "+id+" does not exist")
		}
	}
	if a == b {
		return names[a] + " cannot be cabled to itself"
	}
	if equipmentOf[a] == equipmentOf[b] {
		return names[a] + " and " + names[b] + " are on the same equipment"
	}
	for _, l := range s.Links {
		if l.Kind != "cable" {
			continue
		}
		for _, id := range []string{a, b} {
			if l.A == id || l.B == id {
				return fmt.Sprintf("%s is already cabled (%s)", names[id], l.ID)
			}
		}
	}
	return ""
}
