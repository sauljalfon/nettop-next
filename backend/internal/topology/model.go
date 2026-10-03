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
	Subpanel    string `json:"subpanel,omitempty"`
	Position    int    `json:"position,omitempty"`
	Side        string `json:"side,omitempty"`
}

type Link struct {
	ID   string `json:"id"`
	A    string `json:"a"`
	B    string `json:"b"`
	Kind string `json:"kind"` // cable or internal
}

type Snapshot struct {
	Networks  []Network      `json:"networks"`
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
