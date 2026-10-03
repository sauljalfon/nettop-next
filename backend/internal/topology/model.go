package topology

type Site struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type LocationNode struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	SiteID string `json:"siteId"`
}

type Network struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Equipment struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Role      string `json:"role"`
	NetworkID string `json:"networkId,omitempty"`
	RackID    string `json:"rackId"`
	Unit      int    `json:"unit"`
	Height    int    `json:"height"`
}

type Rack struct {
	NodeID string `json:"nodeId"`
	ID     string `json:"id"`
	Name   string `json:"name"`
	Units  int    `json:"units"`
}

type Endpoint struct {
	ID          string `json:"id"`
	EquipmentID string `json:"equipmentId"`
	Label       string `json:"label"`
	SubpanelID  string `json:"subpanelId,omitempty"`
	Position    int    `json:"position,omitempty"`
	Side        string `json:"side,omitempty"`
}

// Subpanel is one row/column block of an HDF chassis. Row and Column are
// structured identity fields; labels are display text and are never parsed.
type Subpanel struct {
	ID          string `json:"id"`
	EquipmentID string `json:"equipmentId"`
	Row         int    `json:"row"`
	Column      string `json:"column"`
}

type Link struct {
	ID   string `json:"id"`
	A    string `json:"a"`
	B    string `json:"b"`
	Kind string `json:"kind"` // cable or internal
}

type Snapshot struct {
	Networks  []Network      `json:"networks"`
	Subpanels []Subpanel     `json:"subpanels"`
	Sites     []Site         `json:"sites"`
	Nodes     []LocationNode `json:"nodes"`
	Context   string         `json:"context"`
	Revision  string         `json:"revision"`
	Site      string         `json:"site"`
	Room      string         `json:"room"`
	Racks     []Rack         `json:"racks"`
	Equipment []Equipment    `json:"equipment"`
	Endpoints []Endpoint     `json:"endpoints"`
	Links     []Link         `json:"links"`
}
