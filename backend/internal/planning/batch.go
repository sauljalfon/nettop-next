package planning

import (
	"fmt"
	"strconv"
	"strings"

	"nettop.local/backend/internal/topology"
)

// MaxBatch is the most commands one batch may hold.
const MaxBatch = 500

// BatchInput is the payload of a batch command: existing plan commands, each
// without its own expectedRevision.
type BatchInput struct {
	Commands []Command `json:"commands"`
}

// IDPrefix is the prefix of the ID the application boundary allocates for a
// command that creates something ("equipment-", "cable-", "site-", "node-",
// "rack-"); it is "" for a command that creates nothing.
func IDPrefix(commandType string) string {
	switch commandType {
	case "add_cable":
		return "cable-"
	case "add_site":
		return "site-"
	case "add_node":
		return "node-"
	case "add_rack":
		return "rack-"
	case "add_equipment", "add_hdf":
		return "equipment-"
	}
	return ""
}

// batchable are the commands a batch may hold: not batch itself (no nesting) and
// not remove_change.
var batchable = map[string]bool{
	"add_equipment": true, "add_hdf": true, "add_cable": true, "move_equipment": true,
	"add_site": true, "add_node": true, "add_rack": true,
	"delete_equipment": true, "disconnect_cable": true, "delete_rack": true, "delete_node": true, "delete_site": true,
}

// refsOf lists the IDs a command refers to.
func refsOf(c Command) []string {
	var out []string
	switch {
	case c.Equipment != nil:
		out = append(out, c.Equipment.RackID)
	case c.HDF != nil:
		out = append(out, c.HDF.RackID)
	case c.Cable != nil:
		out = append(out, c.Cable.A, c.Cable.B)
	case c.Placement != nil:
		out = append(out, c.Placement.EquipmentID, c.Placement.RackID)
	case c.Node != nil:
		out = append(out, c.Node.SiteID)
	case c.Rack != nil:
		out = append(out, c.Rack.NodeID)
	case c.Target != nil:
		out = append(out, c.Target.ID)
	}
	return out
}

// ExecuteBatch applies the batch's commands in order, all or nothing, with one
// revision bump. ids holds one ID per command, allocated by the application
// boundary ("" for a command that creates nothing: see IDPrefix).
//
// It is incremental: the proposed topology is built once, each command is
// validated against that working snapshot, and the snapshot is then updated by
// just what the command added, moved or removed, so a batch never re-applies the
// whole plan per command. Apply and Validate run once at the end as the safety
// net. A failing command is reported by its 1-based position and the reason in
// names ("command 7 (add_cable): HDF-02 · 2B/3 rear is already cabled (cable-a04)").
// A command cannot refer to an object created earlier in the same batch (their
// IDs are not known to the caller, and the bulk tools do not need it).
func ExecuteBatch(base topology.Snapshot, p Plan, c Command, ids []string) (Plan, error) {
	invalid := func(format string, args ...any) (Plan, error) {
		return Plan{}, fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
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
	if c.Type != "batch" || c.Batch == nil || c.payloads() != 1 {
		return invalid("batch requires only a batch payload")
	}
	commands := c.Batch.Commands
	if len(commands) < 1 || len(commands) > MaxBatch {
		return invalid("a batch holds 1–%d commands, got %d", MaxBatch, len(commands))
	}
	if len(ids) != len(commands) {
		return Plan{}, fmt.Errorf("batch needs one ID per command: %d IDs for %d commands", len(ids), len(commands))
	}
	for i, cmd := range commands {
		switch {
		case !batchable[cmd.Type]:
			return invalid("command %d (%s): not allowed in a batch (batch and remove_change cannot be nested; other types are not commands)", i+1, cmd.Type)
		case cmd.ExpectedRevision != "":
			return invalid("command %d (%s): commands in a batch take no expectedRevision", i+1, cmd.Type)
		}
	}
	work, err := Apply(base, p) // the working snapshot, built once
	if err != nil {
		return Plan{}, err
	}
	next := p
	var created []string
	for i, cmd := range commands {
		fail := func(reason string) (Plan, error) {
			return invalid("command %d (%s): %s", i+1, cmd.Type, reason)
		}
		for _, ref := range refsOf(cmd) {
			for _, made := range created {
				if ref == made || strings.HasPrefix(ref, made+":") {
					return fail(ref + " is created earlier in this batch; a batch cannot refer to objects it creates")
				}
			}
		}
		changed, delta, err := applyCommand(base, work, next, cmd, ids[i])
		if err != nil {
			return fail(strings.TrimPrefix(err.Error(), ErrInvalid.Error()+": "))
		}
		for _, s := range steps(delta) { // the working snapshot follows, incrementally
			if err := s.run(&work); err != nil {
				return fail(strings.TrimPrefix(err.Error(), ErrInvalid.Error()+": "))
			}
		}
		next = changed
		if IDPrefix(cmd.Type) != "" {
			created = append(created, ids[i])
		}
	}
	proposed, err := Apply(base, next) // the safety net, once
	if err != nil {
		return invalid("%s", err.Error())
	}
	next.Labels = planLabels(next, proposed, base)
	revision, err := strconv.ParseInt(p.Revision, 10, 64)
	if err != nil {
		return Plan{}, fmt.Errorf("invalid stored revision: %w", err)
	}
	next.Revision = strconv.FormatInt(revision+1, 10)
	return next, nil
}
