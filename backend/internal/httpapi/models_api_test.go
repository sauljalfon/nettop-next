package httpapi

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"nettop.local/backend/internal/planning"
	"nettop.local/backend/internal/topology"
)

type modelsFake struct {
	Repository
	err    error
	models []planning.SwitchModel
	id     string
	got    planning.SwitchModel
}

func (f *modelsFake) SwitchModels(context.Context) ([]planning.SwitchModel, error) {
	return f.models, f.err
}
func (f *modelsFake) CreateSwitchModel(_ context.Context, m planning.SwitchModel) (planning.SwitchModel, error) {
	f.got = m
	m.ID = "model-new"
	return m, f.err
}
func (f *modelsFake) UpdateSwitchModel(_ context.Context, id string, m planning.SwitchModel) (planning.SwitchModel, error) {
	f.id, f.got = id, m
	m.ID = id
	return m, f.err
}
func (f *modelsFake) DeleteSwitchModel(_ context.Context, id string) error {
	f.id = id
	return f.err
}

const modelBody = `{"name":"C9300-48P","manufacturer":"Cisco","height":1,"portGroups":[{"count":48,"names":"Gi1/0/{n}","start":1,"details":{"portType":"copper","connector":"RJ45","speed":"1G"}}]}`

func TestSwitchModelRoutes(t *testing.T) {
	f := &modelsFake{}
	call := newCaller(t, New(f, "dev"))
	if w := call("GET", "/api/switch-models", "", 200); strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("an empty list is []: %s", w.Body.String())
	}
	w := call("POST", "/api/switch-models", modelBody, 201)
	created := decodeBody[planning.SwitchModel](t, w)
	if created.ID != "model-new" || f.got.Name != "C9300-48P" || f.got.Height != 1 || len(f.got.PortGroups) != 1 || f.got.PortGroups[0].Count != 48 {
		t.Fatalf("created %+v, passed %+v", created, f.got)
	}
	f.models = []planning.SwitchModel{created}
	if got := decodeBody[[]planning.SwitchModel](t, call("GET", "/api/switch-models", "", 200)); len(got) != 1 || got[0].ID != "model-new" {
		t.Fatalf("list: %+v", got)
	}
	if got := decodeBody[planning.SwitchModel](t, call("PUT", "/api/switch-models/model-x", modelBody, 200)); got.ID != "model-x" || f.id != "model-x" {
		t.Fatalf("update: %+v %q", got, f.id)
	}
	call("DELETE", "/api/switch-models/model-x", "", 204)
	if f.id != "model-x" {
		t.Fatal("delete id not passed")
	}
}

func TestSwitchModelErrorStatuses(t *testing.T) {
	f := &modelsFake{}
	call := newCaller(t, New(f, "dev"))
	call("POST", "/api/switch-models", `{"name":"x","height":1,"portGroups":[],"extra":1}`, 400)
	call("PUT", "/api/switch-models/m", `{bad`, 400)
	call("POST", "/api/switch-models", `{"name":"x","height":1,"portGroups":[{"labels":["A"]}]}`, 400)
	call("PUT", "/api/switch-models/m", `{"name":"x","height":1,"portGroups":[{"labels":["A"]}]}`, 400)
	for _, c := range []struct {
		err    error
		status int
		msg    string
	}{
		{fmt.Errorf("%w: C9300-48P: port group 2: Names must contain {n} once", topology.ErrInvalidInput), 422, ""},
		{fmt.Errorf("%w: a switch model with this name already exists (ignoring case)", topology.ErrDuplicateName), 409, ""},
		{fmt.Errorf("%w: model-x", topology.ErrModelNotFound), 404, "Switch model not found"},
		{fmt.Errorf("connection reset"), 500, ""},
	} {
		f.err = c.err
		for _, r := range [][3]string{{"GET", "/api/switch-models", ""}, {"POST", "/api/switch-models", modelBody}, {"PUT", "/api/switch-models/m", modelBody}, {"DELETE", "/api/switch-models/m", ""}} {
			w := call(r[0], r[1], r[2], c.status)
			if c.msg != "" && errorOf(t, w) != c.msg {
				t.Fatalf("%s: %q", r[0], errorOf(t, w))
			}
		}
	}
}
