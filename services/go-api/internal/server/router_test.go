package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"aws-go/services/go-api/internal/model"
	"aws-go/services/go-api/internal/repository"
	"aws-go/services/go-api/internal/server"
	"aws-go/services/go-api/internal/service"
)

func init() {
	gin.SetMode(gin.TestMode)
}

type memDB struct {
	mu       sync.Mutex
	users    map[int64]model.User
	tasks    map[int64]model.Task
	nextUser int64
	nextTask int64
}

func newMemDB() *memDB {
	return &memDB{
		users:    map[int64]model.User{},
		tasks:    map[int64]model.Task{},
		nextUser: 1,
		nextTask: 1,
	}
}

type memUsers struct{ db *memDB }

func (m *memUsers) Create(_ context.Context, user *model.User) error {
	m.db.mu.Lock()
	defer m.db.mu.Unlock()
	for _, existing := range m.db.users {
		if existing.Email == user.Email {
			return repository.ErrConflict
		}
	}
	user.ID = m.db.nextUser
	m.db.nextUser++
	m.db.users[user.ID] = *user
	return nil
}

func (m *memUsers) List(_ context.Context, limit int) ([]model.User, error) {
	m.db.mu.Lock()
	defer m.db.mu.Unlock()
	users := make([]model.User, 0, len(m.db.users))
	for id := m.db.nextUser - 1; id > 0 && len(users) < limit; id-- {
		if user, ok := m.db.users[id]; ok {
			users = append(users, user)
		}
	}
	return users, nil
}

func (m *memUsers) Get(_ context.Context, id int64) (*model.User, error) {
	m.db.mu.Lock()
	defer m.db.mu.Unlock()
	user, ok := m.db.users[id]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return &user, nil
}

func (m *memUsers) Update(_ context.Context, user *model.User) error {
	m.db.mu.Lock()
	defer m.db.mu.Unlock()
	if _, ok := m.db.users[user.ID]; !ok {
		return repository.ErrNotFound
	}
	for id, existing := range m.db.users {
		if id != user.ID && existing.Email == user.Email {
			return repository.ErrConflict
		}
	}
	m.db.users[user.ID] = *user
	return nil
}

func (m *memUsers) Delete(_ context.Context, id int64) error {
	m.db.mu.Lock()
	defer m.db.mu.Unlock()
	if _, ok := m.db.users[id]; !ok {
		return repository.ErrNotFound
	}
	for _, task := range m.db.tasks {
		if task.AssigneeID == id {
			return repository.ErrHasTasks
		}
	}
	delete(m.db.users, id)
	return nil
}

type memTasks struct{ db *memDB }

func (m *memTasks) Create(_ context.Context, task *model.Task) error {
	m.db.mu.Lock()
	defer m.db.mu.Unlock()
	if _, ok := m.db.users[task.AssigneeID]; !ok {
		return repository.ErrAssigneeNotFound
	}
	task.ID = m.db.nextTask
	m.db.nextTask++
	task.Done = false
	task.CreatedAt = time.Now().UTC()
	stored := *task
	m.db.tasks[task.ID] = stored
	*task = m.db.withAssignee(stored)
	return nil
}

func (m *memTasks) List(_ context.Context, assigneeID *int64, limit int) ([]model.Task, error) {
	m.db.mu.Lock()
	defer m.db.mu.Unlock()
	tasks := make([]model.Task, 0)
	for id := m.db.nextTask - 1; id > 0 && len(tasks) < limit; id-- {
		task, ok := m.db.tasks[id]
		if !ok {
			continue
		}
		if assigneeID != nil && task.AssigneeID != *assigneeID {
			continue
		}
		tasks = append(tasks, m.db.withAssignee(task))
	}
	return tasks, nil
}

func (m *memTasks) Get(_ context.Context, id int64) (*model.Task, error) {
	m.db.mu.Lock()
	defer m.db.mu.Unlock()
	task, ok := m.db.tasks[id]
	if !ok {
		return nil, repository.ErrTaskNotFound
	}
	hydrated := m.db.withAssignee(task)
	return &hydrated, nil
}

func (m *memTasks) Update(_ context.Context, task *model.Task) error {
	m.db.mu.Lock()
	defer m.db.mu.Unlock()
	existing, ok := m.db.tasks[task.ID]
	if !ok {
		return repository.ErrTaskNotFound
	}
	if _, ok := m.db.users[task.AssigneeID]; !ok {
		return repository.ErrAssigneeNotFound
	}
	existing.Title = task.Title
	existing.AssigneeID = task.AssigneeID
	existing.Done = task.Done
	m.db.tasks[task.ID] = existing
	*task = m.db.withAssignee(existing)
	return nil
}

func (m *memTasks) Delete(_ context.Context, id int64) error {
	m.db.mu.Lock()
	defer m.db.mu.Unlock()
	if _, ok := m.db.tasks[id]; !ok {
		return repository.ErrTaskNotFound
	}
	delete(m.db.tasks, id)
	return nil
}

func (db *memDB) withAssignee(task model.Task) model.Task {
	user, ok := db.users[task.AssigneeID]
	if !ok {
		return task
	}
	task.Assignee = model.Assignee{ID: user.ID, Name: user.Name, Email: user.Email}
	return task
}

type stubPinger struct {
	err error
}

func (s stubPinger) PingContext(context.Context) error { return s.err }

func newTestServer(db *memDB, pingErr error) http.Handler {
	return server.NewRouter(
		service.NewUserService(&memUsers{db: db}),
		service.NewTaskService(&memTasks{db: db}),
		stubPinger{err: pingErr},
	)
}

func TestUserCRUD(t *testing.T) {
	router := newTestServer(newMemDB(), nil)

	created := requestJSON(t, router, http.MethodPost, "/users", `{"name":"Ada","email":"Ada@Example.com"}`, http.StatusCreated)
	if created["name"] != "Ada" || created["email"] != "ada@example.com" {
		t.Fatalf("normalized user = %#v", created)
	}

	requestJSON(t, router, http.MethodPost, "/users", `{"name":"","email":"ada@example.com"}`, http.StatusBadRequest)
	requestJSON(t, router, http.MethodPost, "/users", `{"name":"Grace","email":"ada@example.com"}`, http.StatusConflict)

	second := requestJSON(t, router, http.MethodPost, "/users", `{"name":"Grace","email":"grace@example.com"}`, http.StatusCreated)
	listed := requestRaw(t, router, http.MethodGet, "/users?limit=1", "", http.StatusOK)
	var page []map[string]any
	if err := json.Unmarshal(listed, &page); err != nil {
		t.Fatal(err)
	}
	if len(page) != 1 || page[0]["email"] != second["email"] {
		t.Fatalf("list = %#v", page)
	}

	id := strconv.FormatInt(int64(created["id"].(float64)), 10)
	got := requestJSON(t, router, http.MethodGet, "/users/"+id, "", http.StatusOK)
	if got["email"] != "ada@example.com" {
		t.Fatalf("get = %#v", got)
	}

	updated := requestJSON(t, router, http.MethodPut, "/users/"+id, `{"name":"Ada Lovelace","email":"ada@example.com"}`, http.StatusOK)
	if updated["name"] != "Ada Lovelace" {
		t.Fatalf("update = %#v", updated)
	}

	requestRaw(t, router, http.MethodDelete, "/users/"+id, "", http.StatusNoContent)
	requestJSON(t, router, http.MethodGet, "/users/"+id, "", http.StatusNotFound)
	requestJSON(t, router, http.MethodGet, "/users/abc", "", http.StatusBadRequest)
	requestJSON(t, router, http.MethodGet, "/users?limit=nope", "", http.StatusBadRequest)
}

func TestHealth(t *testing.T) {
	okRouter := newTestServer(newMemDB(), nil)
	requestJSON(t, okRouter, http.MethodGet, "/health", "", http.StatusOK)

	badRouter := newTestServer(newMemDB(), errors.New("db down"))
	requestJSON(t, badRouter, http.MethodGet, "/health", "", http.StatusServiceUnavailable)
}

func TestTaskCRUD(t *testing.T) {
	router := newTestServer(newMemDB(), nil)

	ada := requestJSON(t, router, http.MethodPost, "/users", `{"name":"Ada","email":"ada@example.com"}`, http.StatusCreated)
	grace := requestJSON(t, router, http.MethodPost, "/users", `{"name":"Grace","email":"grace@example.com"}`, http.StatusCreated)
	adaID := int64(ada["id"].(float64))
	graceID := int64(grace["id"].(float64))

	requestJSON(t, router, http.MethodPost, "/tasks", `{"title":"","assignee_id":`+idText(adaID)+`}`, http.StatusBadRequest)
	requestJSON(t, router, http.MethodPost, "/tasks", `{"title":"`+strings.Repeat("字", 201)+`","assignee_id":`+idText(adaID)+`}`, http.StatusBadRequest)
	requestJSON(t, router, http.MethodPost, "/tasks", `{"title":"写周报","assignee_id":0}`, http.StatusBadRequest)
	requestJSON(t, router, http.MethodPost, "/tasks", `{"title":"写周报","assignee_id":9999}`, http.StatusNotFound)

	created := requestJSON(t, router, http.MethodPost, "/tasks", `{"title":"  写周报  ","assignee_id":`+idText(adaID)+`}`, http.StatusCreated)
	if created["title"] != "写周报" || created["done"] != false {
		t.Fatalf("created = %#v", created)
	}
	assignee, _ := created["assignee"].(map[string]any)
	if assignee["name"] != "Ada" || assignee["email"] != "ada@example.com" {
		t.Fatalf("assignee = %#v", created["assignee"])
	}
	taskID := idText(int64(created["id"].(float64)))

	okTitle := requestJSON(t, router, http.MethodPost, "/tasks", `{"title":"`+strings.Repeat("字", 200)+`","assignee_id":`+idText(graceID)+`}`, http.StatusCreated)
	if okTitle["title"] != strings.Repeat("字", 200) {
		t.Fatal("200 character title was rejected or trimmed")
	}

	filtered := requestList(t, router, "/tasks?assignee_id="+idText(adaID))
	if len(filtered) != 1 || filtered[0]["title"] != "写周报" {
		t.Fatalf("filter = %#v", filtered)
	}
	requestJSON(t, router, http.MethodGet, "/tasks?assignee_id=nope", "", http.StatusBadRequest)
	requestJSON(t, router, http.MethodGet, "/tasks?limit=nope", "", http.StatusBadRequest)

	updated := requestJSON(t, router, http.MethodPut, "/tasks/"+taskID, `{"title":"交周报","assignee_id":`+idText(graceID)+`,"done":true}`, http.StatusOK)
	if updated["title"] != "交周报" || updated["done"] != true || updated["assignee_id"] != float64(graceID) {
		t.Fatalf("update = %#v", updated)
	}
	requestJSON(t, router, http.MethodPut, "/tasks/"+taskID, `{"title":"交周报","assignee_id":9999,"done":true}`, http.StatusNotFound)
	kept := requestJSON(t, router, http.MethodGet, "/tasks/"+taskID, "", http.StatusOK)
	if kept["assignee_id"] != float64(graceID) {
		t.Fatalf("failed reassignment changed task: %#v", kept)
	}
	requestJSON(t, router, http.MethodPut, "/tasks/"+taskID, `{"title":"交周报","assignee_id":`+idText(graceID)+`}`, http.StatusBadRequest)

	conflict := requestJSON(t, router, http.MethodDelete, "/users/"+idText(graceID), "", http.StatusConflict)
	if conflict["error"] != "user has tasks" {
		t.Fatalf("conflict = %#v", conflict)
	}
	keptUser := requestJSON(t, router, http.MethodGet, "/users/"+idText(graceID), "", http.StatusOK)
	if keptUser["email"] != "grace@example.com" {
		t.Fatalf("user with tasks was removed: %#v", keptUser)
	}

	requestRaw(t, router, http.MethodDelete, "/tasks/"+taskID, "", http.StatusNoContent)
	requestJSON(t, router, http.MethodGet, "/tasks/"+taskID, "", http.StatusNotFound)
	requestJSON(t, router, http.MethodGet, "/tasks/abc", "", http.StatusBadRequest)

	graceTasks := requestList(t, router, "/tasks?assignee_id="+idText(graceID))
	if len(graceTasks) != 1 {
		t.Fatalf("grace tasks = %#v", graceTasks)
	}
	requestRaw(t, router, http.MethodDelete, "/tasks/"+idText(int64(graceTasks[0]["id"].(float64))), "", http.StatusNoContent)
	requestRaw(t, router, http.MethodDelete, "/users/"+idText(graceID), "", http.StatusNoContent)
	requestJSON(t, router, http.MethodGet, "/users/"+idText(graceID), "", http.StatusNotFound)
}

func requestList(t *testing.T, handler http.Handler, path string) []map[string]any {
	t.Helper()
	raw := requestRaw(t, handler, http.MethodGet, path, "", http.StatusOK)
	var payload []map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode list %s: %v body=%s", path, err, raw)
	}
	return payload
}

func idText(id int64) string {
	return strconv.FormatInt(id, 10)
}

func requestJSON(t *testing.T, handler http.Handler, method, path, body string, want int) map[string]any {
	t.Helper()
	raw := requestRaw(t, handler, method, path, body, want)
	if len(raw) == 0 {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode %s %s: %v body=%s", method, path, err, raw)
	}
	return payload
}

func requestRaw(t *testing.T, handler http.Handler, method, path, body string, want int) []byte {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != want {
		t.Fatalf("%s %s status = %d, want %d, body = %s", method, path, rec.Code, want, rec.Body.String())
	}
	return rec.Body.Bytes()
}
