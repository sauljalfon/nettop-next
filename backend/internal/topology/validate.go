package topology

import "fmt"

func Validate(s Snapshot) error {
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
		if e.Kind != "switch" && e.Kind != "panel" {
			return fmt.Errorf("unsupported equipment kind %s", e.Kind)
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
	endpoints := map[string]Endpoint{}
	positions := map[string]bool{}
	for _, p := range s.Endpoints {
		if _, ok := endpoints[p.ID]; ok || p.ID == "" {
			return fmt.Errorf("duplicate or empty endpoint ID")
		}
		e, ok := equipment[p.EquipmentID]
		if !ok {
			return fmt.Errorf("unknown owner for %s", p.ID)
		}
		if e.Kind == "panel" {
			if p.Position < 1 || (p.Side != "front" && p.Side != "rear") {
				return fmt.Errorf("invalid panel endpoint %s", p.ID)
			}
			key := fmt.Sprintf("%s/%s/%d/%s", e.ID, p.Subpanel, p.Position, p.Side)
			if positions[key] {
				return fmt.Errorf("duplicate panel position")
			}
			positions[key] = true
		} else if p.Side != "" || p.Position != 0 || p.Subpanel != "" {
			return fmt.Errorf("device endpoint has panel metadata")
		}
		endpoints[p.ID] = p
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
			if equipment[a.EquipmentID].Kind != "panel" || a.EquipmentID != b.EquipmentID || a.Position != b.Position || a.Subpanel != b.Subpanel || a.Side == b.Side {
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
	return nil
}
