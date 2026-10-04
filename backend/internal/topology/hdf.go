package topology

import "fmt"

// HDF is the complete inventory of one HDF chassis: the equipment, 4N
// subpanels, 24N positions as 48N side endpoints, and 24N internal bridges.
type HDF struct {
	Equipment Equipment
	Subpanels []Subpanel
	Endpoints []Endpoint
	Links     []Link
}

// NewHDF builds a complete rows×A–D grid with six positions per subpanel. It is
// the single implementation shared by plan commands and fixtures. The chassis
// id is allocated by the caller; child IDs are derived from it and are opaque
// to the domain (they are never parsed). Labels are display text only. Rack
// height is independent of rows. Callers must keep rows within 1..MaxHDFRows
// before building (add_hdf does; Validate rejects anything else).
func NewHDF(id, name, rackID string, unit, height, rows int) HDF {
	h := HDF{Equipment: Equipment{ID: id, Name: name, Kind: "hdf", Role: "passive", RackID: rackID, Unit: unit, Height: height}}
	for row := 1; row <= rows; row++ {
		for _, column := range hdfColumns {
			sp := fmt.Sprintf("%s:sp-%d%s", id, row, column)
			h.Subpanels = append(h.Subpanels, Subpanel{ID: sp, EquipmentID: id, Row: row, Column: column})
			for position := 1; position <= PositionsPerSubpanel; position++ {
				front := fmt.Sprintf("%s:%d:f", sp, position)
				rear := fmt.Sprintf("%s:%d:r", sp, position)
				h.Endpoints = append(h.Endpoints,
					Endpoint{ID: front, EquipmentID: id, SubpanelID: sp, Label: fmt.Sprintf("%d%s/%d front", row, column, position), Position: position, Side: "front"},
					Endpoint{ID: rear, EquipmentID: id, SubpanelID: sp, Label: fmt.Sprintf("%d%s/%d rear", row, column, position), Position: position, Side: "rear"})
				h.Links = append(h.Links, Link{ID: fmt.Sprintf("%s:%d:bridge", sp, position), A: front, B: rear, Kind: "internal"})
			}
		}
	}
	return h
}

// AddTo appends the chassis to a snapshot.
func (h HDF) AddTo(s *Snapshot) {
	s.Equipment = append(s.Equipment, h.Equipment)
	s.Subpanels = append(s.Subpanels, h.Subpanels...)
	s.Endpoints = append(s.Endpoints, h.Endpoints...)
	s.Links = append(s.Links, h.Links...)
}
