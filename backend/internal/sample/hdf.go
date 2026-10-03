package sample

import (
	"fmt"

	"nettop.local/backend/internal/topology"
)

// HDFParts is the complete inventory of one HDF chassis: the equipment, 4N
// subpanels, 24N positions as 48N side endpoints, and 24N internal bridges.
type HDFParts struct {
	Equipment topology.Equipment
	Subpanels []topology.Subpanel
	Endpoints []topology.Endpoint
	Links     []topology.Link
}

// HDF builds a complete rows×A–D grid with six positions per subpanel. IDs are
// opaque to the domain (they merely embed the chassis ID so fixtures are
// readable); labels are display text. Rack height is independent of rows.
func HDF(id, name, rackID string, unit, height, rows int) HDFParts {
	p := HDFParts{Equipment: topology.Equipment{ID: id, Name: name, Kind: "hdf", Role: "passive", RackID: rackID, Unit: unit, Height: height}}
	for row := 1; row <= rows; row++ {
		for _, column := range []string{"A", "B", "C", "D"} {
			sp := fmt.Sprintf("%s:sp-%d%s", id, row, column)
			p.Subpanels = append(p.Subpanels, topology.Subpanel{ID: sp, EquipmentID: id, Row: row, Column: column})
			for position := 1; position <= 6; position++ {
				front := fmt.Sprintf("%s:%d:f", sp, position)
				rear := fmt.Sprintf("%s:%d:r", sp, position)
				p.Endpoints = append(p.Endpoints,
					topology.Endpoint{ID: front, EquipmentID: id, SubpanelID: sp, Label: fmt.Sprintf("%d%s/%d front", row, column, position), Position: position, Side: "front"},
					topology.Endpoint{ID: rear, EquipmentID: id, SubpanelID: sp, Label: fmt.Sprintf("%d%s/%d rear", row, column, position), Position: position, Side: "rear"})
				p.Links = append(p.Links, topology.Link{ID: fmt.Sprintf("%s:%d:bridge", sp, position), A: front, B: rear, Kind: "internal"})
			}
		}
	}
	return p
}

// AddTo appends the chassis to a snapshot.
func (p HDFParts) AddTo(s *topology.Snapshot) {
	s.Equipment = append(s.Equipment, p.Equipment)
	s.Subpanels = append(s.Subpanels, p.Subpanels...)
	s.Endpoints = append(s.Endpoints, p.Endpoints...)
	s.Links = append(s.Links, p.Links...)
}
