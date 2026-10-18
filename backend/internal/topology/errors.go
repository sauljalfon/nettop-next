package topology

import "errors"

// Sentinel errors for presentation and reference data (node layout, networks).
// Repositories wrap them with a readable message; the HTTP layer maps them to
// 404, 409 and 422.
var (
	ErrSiteNotFound    = errors.New("site not found")
	ErrNodeNotFound    = errors.New("node not found")
	ErrNetworkNotFound = errors.New("network not found")
	ErrDuplicateName   = errors.New("duplicate name")
	ErrInvalidInput    = errors.New("invalid input")
)

// NodePosition is where the user dropped a node card on its site's screen. It is
// an arrangement, never a physical coordinate.
type NodePosition struct {
	NodeID string  `json:"nodeId"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
}

// SiteLayout lists only the nodes with a saved position.
type SiteLayout struct {
	SiteID    string         `json:"siteId"`
	Positions []NodePosition `json:"positions"`
}

// MapLayout lists only the nodes with a saved position on the conceptual
// overview, one coordinate space for the whole network.
type MapLayout struct {
	Positions []NodePosition `json:"positions"`
}

// MaxLayoutCoordinate bounds saved positions in both axes.
const MaxLayoutCoordinate = 1_000_000

// MaxNetworkNameLength counts characters, not bytes.
const MaxNetworkNameLength = 64
