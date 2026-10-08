package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"

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
	// Presentation and reference data: none of these changes a topology
	// revision or a saved plan.
	SiteLayout(context.Context, string) (topology.SiteLayout, error)
	SaveNodePosition(ctx context.Context, siteID, nodeID string, x, y float64) error
	ResetSiteLayout(context.Context, string) error
	CreateNetwork(context.Context, string) (topology.Network, error)
	RenameNetwork(ctx context.Context, id, name string) (topology.Network, error)
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
	case errors.Is(err, planning.ErrConflict):
		problem(w, 409, err.Error())
	case errors.Is(err, planning.ErrNotFound):
		problem(w, 404, "Plan not found")
	case errors.Is(err, planning.ErrInvalid):
		problem(w, 422, err.Error())
	case errors.Is(err, topology.ErrSiteNotFound):
		problem(w, 404, "Site not found")
	case errors.Is(err, topology.ErrNetworkNotFound):
		problem(w, 404, "Network not found")
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
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384))
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

func New(repo Repository) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := repo.Ping(r.Context()); err != nil {
			problem(w, 503, "Database unavailable")
			return
		}
		respond(w, 200, map[string]string{"status": "ok", "storage": "postgresql"})
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
		plans, err := repo.Plans(r.Context())
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
		if !decode(w, r, &command) {
			return
		}
		p, err := repo.Command(r.Context(), r.PathValue("id"), command)
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
