package topology

import (
	"errors"
	"fmt"
	"strings"
)

const (
	// MaxHDFRows is the supported HDF row range (1..MaxHDFRows); every row has
	// columns A–D and each subpanel has PositionsPerSubpanel local positions.
	MaxHDFRows           = 32
	PositionsPerSubpanel = 6
)

var hdfColumns = [...]string{"A", "B", "C", "D"} // fixed order: also the build order of NewHDF

func validColumn(c string) bool {
	for _, column := range hdfColumns {
		if c == column {
			return true
		}
	}
	return false
}

func Validate(s Snapshot) error {
	networks := map[string]bool{}
	for _, n := range s.Networks {
		if n.ID == "" || strings.TrimSpace(n.Name) == "" || networks[n.ID] {
			return fmt.Errorf("invalid or duplicate network")
		}
		networks[n.ID] = true
	}
	sites := map[string]bool{}
	for _, site := range s.Sites {
		if site.ID == "" || site.Name == "" || sites[site.ID] {
			return fmt.Errorf("invalid or duplicate site")
		}
		sites[site.ID] = true
	}
	nodes := map[string]bool{}
	for _, node := range s.Nodes {
		if node.ID == "" || node.Name == "" || nodes[node.ID] || !sites[node.SiteID] {
			return fmt.Errorf("invalid node or site ownership")
		}
		nodes[node.ID] = true
	}
	racks := map[string]Rack{}
	for _, r := range s.Racks {
		if !nodes[r.NodeID] {
			return fmt.Errorf("rack %s must belong to a node", r.ID)
		}
		if r.ID == "" || r.Units < 1 {
			return fmt.Errorf("invalid rack")
		}
		if _, ok := racks[r.ID]; ok {
			return fmt.Errorf("duplicate rack %s", r.ID)
		}
		racks[r.ID] = r
	}
	equipment := map[string]Equipment{}
	occupied := map[string]string{}
	for _, e := range s.Equipment {
		if _, ok := equipment[e.ID]; ok || e.ID == "" {
			return fmt.Errorf("duplicate or empty equipment ID")
		}
		r, ok := racks[e.RackID]
		if !ok || e.Unit < 1 || e.Height < 1 || e.Unit+e.Height-1 > r.Units {
			return fmt.Errorf("invalid placement for %s", e.ID)
		}
		if e.Kind != "switch" && e.Kind != "panel" && e.Kind != "hdf" {
			return fmt.Errorf("unsupported equipment kind %s", e.Kind)
		}
		switch e.Kind {
		case "switch":
			if e.Role != "access" && e.Role != "aggregation" && e.Role != "backbone" {
				return fmt.Errorf("switch %s must have role access, aggregation, or backbone", e.ID)
			}
			if !networks[e.NetworkID] {
				return fmt.Errorf("switch %s must belong to exactly one existing network", e.ID)
			}
		case "panel", "hdf":
			if e.Role != "passive" {
				return fmt.Errorf("%s %s must have role passive", e.Kind, e.ID)
			}
			if e.NetworkID != "" {
				return fmt.Errorf("passive equipment %s cannot have exclusive network membership", e.ID)
			}
		}
		for u := e.Unit; u < e.Unit+e.Height; u++ {
			key := fmt.Sprintf("%s:%d", e.RackID, u)
			if occupied[key] != "" {
				return fmt.Errorf("rack collision: %s and %s", occupied[key], e.ID)
			}
			occupied[key] = e.ID
		}
		equipment[e.ID] = e
	}
	// HDF structure: each subpanel is a stable ID with structured row/column
	// fields. Labels are display text and are never parsed.
	subpanels := map[string]Subpanel{}
	grid := map[string]bool{}
	rowsOf := map[string]int{}
	for _, sp := range s.Subpanels {
		if sp.ID == "" {
			return fmt.Errorf("subpanel with empty ID")
		}
		if _, ok := subpanels[sp.ID]; ok {
			return fmt.Errorf("duplicate subpanel %s", sp.ID)
		}
		if owner, ok := equipment[sp.EquipmentID]; !ok || owner.Kind != "hdf" {
			return fmt.Errorf("subpanel %s must belong to an hdf chassis", sp.ID)
		}
		if sp.Row < 1 || sp.Row > MaxHDFRows || !validColumn(sp.Column) {
			return fmt.Errorf("subpanel %s must have row 1-%d and column A-D", sp.ID, MaxHDFRows)
		}
		cell := fmt.Sprintf("%s/%d/%s", sp.EquipmentID, sp.Row, sp.Column)
		if grid[cell] {
			return fmt.Errorf("duplicate subpanel row/column %s", cell)
		}
		grid[cell] = true
		subpanels[sp.ID] = sp
		if sp.Row > rowsOf[sp.EquipmentID] {
			rowsOf[sp.EquipmentID] = sp.Row
		}
	}
	subpanelCount := map[string]int{}
	for _, sp := range subpanels {
		subpanelCount[sp.EquipmentID]++
	}
	for _, e := range s.Equipment {
		// Unique (row, column) cells within rows 1..N and exactly 4N of them
		// means every row has all four columns.
		if e.Kind == "hdf" && (rowsOf[e.ID] == 0 || subpanelCount[e.ID] != len(hdfColumns)*rowsOf[e.ID]) {
			return fmt.Errorf("hdf %s is incomplete: it needs rows 1..N with columns A-D in every row", e.ID)
		}
	}
	endpoints := map[string]Endpoint{}
	positions := map[string]bool{}
	switchPositions := map[string]bool{}
	perSubpanel := map[string]int{}
	for _, p := range s.Endpoints {
		if _, ok := endpoints[p.ID]; ok || p.ID == "" {
			return fmt.Errorf("duplicate or empty endpoint ID")
		}
		e, ok := equipment[p.EquipmentID]
		if !ok {
			return fmt.Errorf("unknown owner for %s", p.ID)
		}
		switch e.Kind {
		case "panel":
			if p.Position < 1 || (p.Side != "front" && p.Side != "rear") || p.SubpanelID != "" {
				return fmt.Errorf("invalid panel endpoint %s", p.ID)
			}
		case "hdf":
			sp, ok := subpanels[p.SubpanelID]
			if !ok || sp.EquipmentID != e.ID {
				return fmt.Errorf("hdf endpoint %s must belong to a subpanel of its own chassis", p.ID)
			}
			if p.Position < 1 || p.Position > PositionsPerSubpanel || (p.Side != "front" && p.Side != "rear") {
				return fmt.Errorf("invalid hdf endpoint %s", p.ID)
			}
			perSubpanel[p.SubpanelID]++
		default:
			if p.Side != "" || p.SubpanelID != "" || p.Position < 0 || p.PortGroup < 0 || (p.Position == 0 && p.PortGroup != 0) {
				return fmt.Errorf("device endpoint has panel metadata")
			}
			if p.Position > 0 {
				key := fmt.Sprintf("%s#%d", e.ID, p.Position)
				if switchPositions[key] {
					return fmt.Errorf("%s has two ports at position %d", e.Name, p.Position)
				}
				switchPositions[key] = true
			}
		}
		if e.Kind != "switch" {
			key := fmt.Sprintf("%s/%s/%d/%s", e.ID, p.SubpanelID, p.Position, p.Side)
			if positions[key] {
				return fmt.Errorf("duplicate panel position")
			}
			positions[key] = true
		}
		endpoints[p.ID] = p
	}
	for id := range subpanels {
		// Unique (position 1-6, side) pairs make 12 endpoints a full subpanel.
		if perSubpanel[id] != 2*PositionsPerSubpanel {
			return fmt.Errorf("subpanel %s needs a front and rear endpoint for each of its %d positions", id, PositionsPerSubpanel)
		}
	}
	ids := map[string]bool{}
	cables := map[string]bool{}
	bridges := map[string]bool{}
	for _, l := range s.Links {
		if l.ID == "" || ids[l.ID] {
			return fmt.Errorf("duplicate or empty link ID")
		}
		ids[l.ID] = true
		a, okA := endpoints[l.A]
		b, okB := endpoints[l.B]
		if !okA || !okB || l.A == l.B {
			return fmt.Errorf("invalid endpoints on %s", l.ID)
		}
		switch l.Kind {
		case "cable":
			if a.EquipmentID == b.EquipmentID {
				return fmt.Errorf("same equipment cable rejected")
			}
			if cables[l.A] || cables[l.B] {
				return fmt.Errorf("endpoint occupied on %s", l.ID)
			}
			cables[l.A] = true
			cables[l.B] = true
		case "internal":
			// Continuity exists only between opposite sides of one position of
			// one subpanel (or one standard-panel position).
			if kind := equipment[a.EquipmentID].Kind; (kind != "panel" && kind != "hdf") || a.EquipmentID != b.EquipmentID || a.Position != b.Position || a.SubpanelID != b.SubpanelID || a.Side == b.Side {
				return fmt.Errorf("invalid panel bridge %s", l.ID)
			}
			if bridges[l.A] || bridges[l.B] {
				return fmt.Errorf("duplicate bridge")
			}
			bridges[l.A] = true
			bridges[l.B] = true
		default:
			return fmt.Errorf("unknown link kind %s", l.Kind)
		}
	}
	if problem := detailsProblem(s); problem != "" {
		return errors.New(problem)
	}
	for _, p := range s.Endpoints {
		if equipment[p.EquipmentID].Kind == "hdf" && !bridges[p.ID] {
			return fmt.Errorf("hdf endpoint %s has no internal bridge", p.ID)
		}
	}
	return nil
}
