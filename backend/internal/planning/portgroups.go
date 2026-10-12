package planning

import (
	"fmt"
	"strconv"
	"strings"

	"nettop.local/backend/internal/topology"
)

// Limits of a switch's ports.
const (
	MaxSwitchPorts     = 96
	MaxPortGroups      = 8
	MaxPortLabelLength = 64
)

// portSpec is one new switch port: its label, port group (1-based) and the
// details its group gives it.
type portSpec struct {
	label, portType, connector, speed string
	group                             int
}

// portGroupPorts expands a switch's port groups into its ports in position
// order, checking the limits in names: 1–8 groups, 1–96 ports in all, each Names
// pattern holding exactly one "{n}", labels of 1–64 characters that are unique
// on the switch ignoring case, and valid port details.
func portGroupPorts(name string, groups []PortGroupInput) ([]portSpec, error) {
	if len(groups) > MaxPortGroups {
		return nil, invalidf("%s: 1–%d port groups, not %d", name, MaxPortGroups, len(groups))
	}
	total := 0
	for g, group := range groups {
		who := fmt.Sprintf("%s: port group %d", name, g+1)
		switch {
		case len(group.Labels) > 0 && (group.Names != "" || group.Count != 0 || group.Start != nil):
			return nil, invalidf("%s: give Names with Count, or Labels, not both", who)
		case len(group.Labels) > 0:
			// The labels are checked one by one below.
		case group.Count < 1:
			return nil, invalidf("%s: Count must be at least 1", who)
		case strings.Count(group.Names, "{n}") != 1:
			return nil, invalidf("%s: Names must contain {n} once", who)
		case group.Start != nil && *group.Start < 0:
			return nil, invalidf("%s: Start must be 0 or more", who)
		}
		total += min(max(group.Count, len(group.Labels)), 1<<20)
	}
	if total > MaxSwitchPorts {
		return nil, invalidf("%s: a switch has 1–%d ports, not %d", name, MaxSwitchPorts, total)
	}
	var ports []portSpec
	used := map[string]bool{}
	for g, group := range groups {
		who := fmt.Sprintf("%s: port group %d", name, g+1)
		spec := portSpec{group: g + 1}
		if d := group.Details; d != nil {
			spec.portType, spec.connector, spec.speed = strings.TrimSpace(d.PortType), strings.TrimSpace(d.Connector), strings.TrimSpace(d.Speed)
		}
		if problem := (topology.Endpoint{PortType: spec.portType, Connector: spec.connector, Speed: spec.speed}).DetailProblem(who); problem != "" {
			return nil, invalidf("%s", problem)
		}
		start := 1
		if group.Start != nil {
			start = *group.Start
		}
		pattern := strings.TrimSpace(group.Names)
		count := group.Count
		if len(group.Labels) > 0 {
			count = len(group.Labels)
		}
		for i := 0; i < count; i++ {
			var label string
			if len(group.Labels) > 0 {
				if label = strings.TrimSpace(group.Labels[i]); label == "" {
					return nil, invalidf("%s: a port name must have 1–%d characters", who, MaxPortLabelLength)
				}
			} else {
				label = strings.Replace(pattern, "{n}", strconv.Itoa(start+i), 1)
			}
			if len([]rune(label)) > MaxPortLabelLength {
				return nil, invalidf("%s: port name %q is longer than %d characters", who, label, MaxPortLabelLength)
			}
			if used[strings.ToLower(label)] {
				return nil, invalidf("%s: port name %q is used twice", name, label)
			}
			used[strings.ToLower(label)] = true
			port := spec
			port.label = label
			ports = append(ports, port)
		}
	}
	return ports, nil
}
