package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"nettop.local/backend/internal/fixes"
	"nettop.local/backend/internal/pathfinding"
	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

type Repository interface {
	Ping(context.Context) error
	Snapshot(context.Context, string) (topology.Snapshot, error)
	Plans(context.Context) ([]planning.Plan, error)
	Plan(context.Context, string) (planning.Plan, error)
	CreatePlan(context.Context, string, string) (planning.Plan, error)
	Command(context.Context, string, planning.Command) (planning.Plan, error)
	// Record installs a draft and returns it, recorded, with the new installed
	// revision. Rebase ("Update draft") moves a draft to the current installed
	// revision or fails with a *planning.ConflictsError.
	Record(ctx context.Context, id, expectedRevision, note, recordedBy string) (planning.Plan, string, error)
	// RemoveChange runs a remove_change command (the one command a stale draft
	// accepts) and returns the plan with the keys removed.
	RemoveChange(ctx context.Context, id string, command planning.Command) (planning.Plan, []string, error)
	// Batch runs a batch command (many commands, all or nothing, one revision
	// bump) and returns the plan with the IDs it allocated, in command order.
	Batch(ctx context.Context, id string, command planning.Command) (planning.Plan, []string, error)
	// CheckPlan is read-only: whether the draft's base is stale, and every
	// change that cannot apply to the current installed topology.
	CheckPlan(ctx context.Context, id string) (stale bool, conflicts []planning.Conflict, err error)
	// RecordedPlansChanging lists recorded plans that changed an object, newest first.
	RecordedPlansChanging(ctx context.Context, objectID string) ([]planning.Plan, error)
	Rebase(ctx context.Context, id, expectedRevision string) (planning.Plan, error)
	// Presentation and reference data: none of these changes a topology
	// revision or a saved plan.
	SiteLayout(context.Context, string) (topology.SiteLayout, error)
	SaveNodePosition(ctx context.Context, siteID, nodeID string, x, y float64) error
	ResetSiteLayout(context.Context, string) error
	MapLayout(context.Context) (topology.MapLayout, error)
	SaveMapPosition(ctx context.Context, nodeID string, x, y float64) error
	ResetMapLayout(context.Context) error
	CreateNetwork(context.Context, string) (topology.Network, error)
	RenameNetwork(ctx context.Context, id, name string) (topology.Network, error)
	// Direct fixes of installed names and details (never topology): one
	// change_log row per changed field; the topology revision never changes.
	Fix(ctx context.Context, f fixes.Fix) ([]fixes.Entry, error)
	// FixMany applies up to 500 fixes in one transaction, all or nothing.
	FixMany(ctx context.Context, list []fixes.Fix, note string) ([]fixes.Entry, error)
	ChangeLog(ctx context.Context, entityKind, entityID string) ([]fixes.Entry, error)
}

// maxFixes is the most fixes one POST /api/installed/fixes applies.
const maxFixes = 500

// fixKinds maps the PATCH path's plural to change_log's entity kind.
var fixKinds = map[string]string{
	"equipment": fixes.Equipment, "endpoints": fixes.Endpoint, "links": fixes.Link,
	"sites": fixes.Site, "nodes": fixes.Node, "racks": fixes.Rack,
}

// topologyFields are the fields a direct fix refuses with 422 (they change
// topology, so they go through a plan), as opposed to unknown fields (400).
var topologyFields = map[string]bool{
	"id": true, "kind": true, "role": true, "networkId": true, "rackId": true, "unit": true, "height": true,
	"siteId": true, "nodeId": true, "units": true, "equipmentId": true, "subpanelId": true,
	"position": true, "side": true, "portGroup": true, "a": true, "b": true,
}

// fixFields reads the fields of one fix's JSON object into f, as the single
// PATCH and each fix of POST /api/installed/fixes both need: a topology field
// is 422 (named first, in sorted order, so the answer never depends on map
// order), anything unknown 400, a JSON null means "not given" and "" clears.
// A note is read only when withNote is set. It returns the status and message
// of a refusal, or 0.
func fixFields(body map[string]json.RawMessage, f *fixes.Fix, withNote bool) (int, string) {
	keys := slices.Sorted(maps.Keys(body))
	for _, key := range keys {
		if topologyFields[key] {
			return 422, key + " changes the topology: use a plan"
		}
	}
	for _, key := range keys {
		raw := body[key]
		if string(bytes.TrimSpace(raw)) == "null" {
			continue
		}
		switch {
		case key == "name":
			var name string
			if json.Unmarshal(raw, &name) != nil {
				return 400, "Invalid request JSON"
			}
			f.Name = &name
		case key == "note" && withNote:
			if json.Unmarshal(raw, &f.Note) != nil {
				return 400, "Invalid request JSON"
			}
		case key == "details":
			decoder := json.NewDecoder(bytes.NewReader(raw))
			decoder.DisallowUnknownFields()
			if decoder.Decode(&f.Details) != nil {
				return 400, "Invalid request JSON"
			}
		default:
			return 400, "Invalid request JSON"
		}
	}
	return 0, ""
}

func respond(w http.ResponseWriter, code int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(value)
}
func problem(w http.ResponseWriter, code int, message string) {
	respond(w, code, map[string]string{"error": message})
}
func repositoryError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, context.Canceled):
		// Navigation aborts obsolete reads; the client has already disconnected.
		return
	case errors.As(err, new(*planning.ConflictsError)):
		var c *planning.ConflictsError
		errors.As(err, &c)
		respond(w, 409, map[string]any{"error": c.Error(), "conflicts": c.Conflicts})
	case errors.Is(err, planning.ErrConflict):
		problem(w, 409, err.Error())
	case errors.Is(err, planning.ErrNotFound):
		problem(w, 404, "Plan not found")
	case errors.Is(err, planning.ErrInvalid):
		problem(w, 422, err.Error())
	case errors.Is(err, topology.ErrSiteNotFound):
		problem(w, 404, "Site not found")
	case errors.Is(err, topology.ErrNodeNotFound):
		problem(w, 404, "Node not found")
	case errors.Is(err, topology.ErrNetworkNotFound):
		problem(w, 404, "Network not found")
	case errors.Is(err, fixes.ErrNotFound):
		var many *fixes.ManyError
		if errors.As(err, &many) {
			problem(w, 404, fmt.Sprintf("Not found: fix %d (%s): %s", many.Position, many.Object, strings.TrimPrefix(many.Err.Error(), "not found: ")))
			return
		}
		problem(w, 404, "Not found: "+strings.TrimPrefix(err.Error(), "not found: "))
	case errors.Is(err, topology.ErrDuplicateName):
		problem(w, 409, err.Error())
	case errors.Is(err, topology.ErrInvalidInput):
		problem(w, 422, err.Error())
	default:
		slog.Error("repository operation failed", "error", err)
		problem(w, 500, "Database operation failed. Check the API logs.")
	}
}
func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	return decodeUpTo(w, r, value, 16384)
}

// maxCommandBody leaves room for a batch of 500 commands.
const maxCommandBody = 1 << 20

func decodeUpTo(w http.ResponseWriter, r *http.Request, value any, limit int64) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		problem(w, 400, "Invalid request JSON")
		return false
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		problem(w, 400, "Expected a single JSON object")
		return false
	}
	return true
}
func snapshot(w http.ResponseWriter, r *http.Request, repo Repository) (topology.Snapshot, bool) {
	contextName := r.URL.Query().Get("context")
	planID := r.URL.Query().Get("planId")
	if (contextName != "" && contextName != "installed" && contextName != "planned") || (contextName == "planned" && planID == "") || (contextName != "planned" && planID != "") {
		problem(w, 400, "Use context=installed, or context=planned with a planId")
		return topology.Snapshot{}, false
	}
	s, err := repo.Snapshot(r.Context(), planID)
	if err != nil {
		repositoryError(w, err)
		return s, false
	}
	return s, true
}

// New serves the API. `environment` (dev, test or prod) is reported by
// GET /api/health so the UI can label a non-production deployment.
func New(repo Repository, environment string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := repo.Ping(r.Context()); err != nil {
			problem(w, 503, "Database unavailable")
			return
		}
		respond(w, 200, map[string]string{"status": "ok", "storage": "postgresql", "environment": environment})
	})
	mux.HandleFunc("GET /api/topology", func(w http.ResponseWriter, r *http.Request) {
		if s, ok := snapshot(w, r, repo); ok {
			respond(w, 200, s)
		}
	})
	mux.HandleFunc("POST /api/traces", func(w http.ResponseWriter, r *http.Request) {
		s, ok := snapshot(w, r, repo)
		if !ok {
			return
		}
		if revision := r.URL.Query().Get("expectedRevision"); revision != "" && revision != s.Revision {
			repositoryError(w, planning.ErrConflict)
			return
		}
		var req pathfinding.Request
		if !decode(w, r, &req) {
			return
		}
		result, err := pathfinding.Trace(s, req)
		if err != nil {
			problem(w, 422, err.Error())
			return
		}
		respond(w, 200, result)
	})
	mux.HandleFunc("GET /api/plans", func(w http.ResponseWriter, r *http.Request) {
		var plans []planning.Plan
		var err error
		if r.URL.Query().Has("objectId") {
			objectID := r.URL.Query().Get("objectId")
			if objectID == "" {
				problem(w, 400, "objectId must not be empty")
				return
			}
			plans, err = repo.RecordedPlansChanging(r.Context(), objectID)
		} else {
			plans, err = repo.Plans(r.Context())
		}
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, plans)
	})
	mux.HandleFunc("GET /api/plans/{id}", func(w http.ResponseWriter, r *http.Request) {
		p, err := repo.Plan(r.Context(), r.PathValue("id"))
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, p)
	})
	mux.HandleFunc("POST /api/plans", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Name                 string `json:"name"`
			ExpectedBaseRevision string `json:"expectedBaseRevision"`
		}
		if !decode(w, r, &input) {
			return
		}
		p, err := repo.CreatePlan(r.Context(), input.Name, input.ExpectedBaseRevision)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 201, p)
	})
	mux.HandleFunc("POST /api/plans/{id}/commands", func(w http.ResponseWriter, r *http.Request) {
		var command planning.Command
		if !decodeUpTo(w, r, &command, maxCommandBody) {
			return
		}
		if command.Type == "batch" {
			p, ids, err := repo.Batch(r.Context(), r.PathValue("id"), command)
			if err != nil {
				repositoryError(w, err)
				return
			}
			respond(w, 200, map[string]any{"plan": p, "ids": ids})
			return
		}
		if command.Type == "remove_change" {
			p, removed, err := repo.RemoveChange(r.Context(), r.PathValue("id"), command)
			if err != nil {
				repositoryError(w, err)
				return
			}
			respond(w, 200, map[string]any{"plan": p, "removed": removed})
			return
		}
		p, err := repo.Command(r.Context(), r.PathValue("id"), command)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, p)
	})
	mux.HandleFunc("POST /api/plans/{id}/record", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			ExpectedRevision string `json:"expectedRevision"`
			Note             string `json:"note"`
			RecordedBy       string `json:"recordedBy"`
		}
		if !decode(w, r, &input) {
			return
		}
		p, revision, err := repo.Record(r.Context(), r.PathValue("id"), input.ExpectedRevision, input.Note, input.RecordedBy)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, map[string]any{"plan": p, "installedRevision": revision})
	})
	mux.HandleFunc("POST /api/plans/{id}/check", func(w http.ResponseWriter, r *http.Request) {
		stale, conflicts, err := repo.CheckPlan(r.Context(), r.PathValue("id"))
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, map[string]any{"stale": stale, "conflicts": conflicts})
	})
	mux.HandleFunc("POST /api/plans/{id}/rebase", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			ExpectedRevision string `json:"expectedRevision"`
		}
		if !decode(w, r, &input) {
			return
		}
		p, err := repo.Rebase(r.Context(), r.PathValue("id"), input.ExpectedRevision)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, p)
	})
	mux.HandleFunc("GET /api/sites/{siteId}/layout", func(w http.ResponseWriter, r *http.Request) {
		layout, err := repo.SiteLayout(r.Context(), r.PathValue("siteId"))
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, layout)
	})
	mux.HandleFunc("PUT /api/sites/{siteId}/layout/nodes/{nodeId}", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			X *json.RawMessage `json:"x"`
			Y *json.RawMessage `json:"y"`
		}
		if !decode(w, r, &input) {
			return
		}
		x, xerr := coordinate(input.X)
		y, yerr := coordinate(input.Y)
		if err := errors.Join(xerr, yerr); err != nil {
			repositoryError(w, fmt.Errorf("%w: x and y are required finite numbers", topology.ErrInvalidInput))
			return
		}
		siteID, nodeID := r.PathValue("siteId"), r.PathValue("nodeId")
		if err := repo.SaveNodePosition(r.Context(), siteID, nodeID, x, y); err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, topology.NodePosition{NodeID: nodeID, X: x, Y: y})
	})
	mux.HandleFunc("DELETE /api/sites/{siteId}/layout", func(w http.ResponseWriter, r *http.Request) {
		if err := repo.ResetSiteLayout(r.Context(), r.PathValue("siteId")); err != nil {
			repositoryError(w, err)
			return
		}
		w.WriteHeader(204)
	})
	mux.HandleFunc("GET /api/map-layout", func(w http.ResponseWriter, r *http.Request) {
		layout, err := repo.MapLayout(r.Context())
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, layout)
	})
	mux.HandleFunc("PUT /api/map-layout/nodes/{nodeId}", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			X *json.RawMessage `json:"x"`
			Y *json.RawMessage `json:"y"`
		}
		if !decode(w, r, &input) {
			return
		}
		x, xerr := coordinate(input.X)
		y, yerr := coordinate(input.Y)
		if err := errors.Join(xerr, yerr); err != nil {
			repositoryError(w, fmt.Errorf("%w: x and y are required finite numbers", topology.ErrInvalidInput))
			return
		}
		nodeID := r.PathValue("nodeId")
		if err := repo.SaveMapPosition(r.Context(), nodeID, x, y); err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, topology.NodePosition{NodeID: nodeID, X: x, Y: y})
	})
	mux.HandleFunc("DELETE /api/map-layout", func(w http.ResponseWriter, r *http.Request) {
		if err := repo.ResetMapLayout(r.Context()); err != nil {
			repositoryError(w, err)
			return
		}
		w.WriteHeader(204)
	})
	mux.HandleFunc("POST /api/networks", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Name string `json:"name"`
		}
		if !decode(w, r, &input) {
			return
		}
		n, err := repo.CreateNetwork(r.Context(), input.Name)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 201, n)
	})
	mux.HandleFunc("PATCH /api/networks/{id}", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Name string `json:"name"`
		}
		if !decode(w, r, &input) {
			return
		}
		n, err := repo.RenameNetwork(r.Context(), r.PathValue("id"), input.Name)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, n)
	})
	// Direct fixes: names and details of installed objects, never topology.
	mux.HandleFunc("PATCH /api/installed/{kind}/{id}", func(w http.ResponseWriter, r *http.Request) {
		kind, ok := fixKinds[r.PathValue("kind")]
		if !ok {
			problem(w, 404, "Not found: "+r.PathValue("kind"))
			return
		}
		var body map[string]json.RawMessage
		if !decode(w, r, &body) {
			return
		}
		if body == nil {
			problem(w, 400, "Invalid request JSON")
			return
		}
		f := fixes.Fix{Kind: kind, ID: r.PathValue("id")}
		if code, msg := fixFields(body, &f, true); code != 0 {
			problem(w, code, msg)
			return
		}
		entries, err := repo.Fix(r.Context(), f)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, map[string]any{"changes": entries})
	})
	// Many direct fixes in one request, all or nothing.
	mux.HandleFunc("POST /api/installed/fixes", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Note  *string                      `json:"note"`
			Fixes []map[string]json.RawMessage `json:"fixes"`
		}
		if !decodeUpTo(w, r, &body, maxCommandBody) {
			return
		}
		if len(body.Fixes) < 1 || len(body.Fixes) > maxFixes {
			problem(w, 422, fmt.Sprintf("Send 1–%d fixes in one request", maxFixes))
			return
		}
		var note string
		if body.Note != nil {
			note = *body.Note
		}
		if utf8.RuneCountInString(strings.TrimSpace(note)) > fixes.MaxNote {
			problem(w, 422, fmt.Sprintf("A note has at most %d characters", fixes.MaxNote))
			return
		}
		list := make([]fixes.Fix, 0, len(body.Fixes))
		for i, fix := range body.Fixes {
			if fix == nil {
				problem(w, 400, "Invalid request JSON")
				return
			}
			var wire struct{ kind, id string }
			for key, dst := range map[string]*string{"kind": &wire.kind, "id": &wire.id} {
				if raw, ok := fix[key]; ok && json.Unmarshal(raw, dst) != nil {
					problem(w, 400, "Invalid request JSON")
					return
				}
				delete(fix, key)
			}
			kind, ok := fixKinds[wire.kind]
			if !ok {
				problem(w, 404, fmt.Sprintf("Not found: fix %d: kind %q", i+1, wire.kind))
				return
			}
			f := fixes.Fix{Kind: kind, ID: wire.id}
			if code, msg := fixFields(fix, &f, false); code != 0 {
				if code == 422 {
					msg = fmt.Sprintf("fix %d: %s", i+1, msg)
				}
				problem(w, code, msg)
				return
			}
			list = append(list, f)
		}
		entries, err := repo.FixMany(r.Context(), list, note)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, map[string]any{"changes": entries})
	})
	mux.HandleFunc("GET /api/change-log", func(w http.ResponseWriter, r *http.Request) {
		kind, id := r.URL.Query().Get("entityKind"), r.URL.Query().Get("entityId")
		if kind == "" || id == "" {
			problem(w, 400, "entityKind and entityId are required")
			return
		}
		entries, err := repo.ChangeLog(r.Context(), kind, id)
		if err != nil {
			repositoryError(w, err)
			return
		}
		respond(w, 200, entries)
	})
	return mux
}

// coordinate reads a JSON number only: a missing value, null, a string, or a
// number too large for a float64 is an error (reported as 422, not 400).
func coordinate(raw *json.RawMessage) (float64, error) {
	if raw == nil || len(*raw) == 0 {
		return 0, errors.New("missing")
	}
	if c := (*raw)[0]; c != '-' && (c < '0' || c > '9') {
		return 0, errors.New("not a number")
	}
	return strconv.ParseFloat(string(*raw), 64)
}
