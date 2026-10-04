package sample

import "nettop.local/backend/internal/topology"

// HDFParts is the complete inventory of one HDF chassis.
type HDFParts = topology.HDF

// HDF builds a fixture chassis with the same domain builder that add_hdf uses.
func HDF(id, name, rackID string, unit, height, rows int) HDFParts {
	return topology.NewHDF(id, name, rackID, unit, height, rows)
}
