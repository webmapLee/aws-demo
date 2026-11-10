package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"

	"aws-go/services/go-api/internal/model"
	"aws-go/services/go-api/internal/repository"
	"aws-go/services/go-api/internal/server"
	"aws-go/services/go-api/internal/service"
)

func init() {
	gin.SetMode(gin.TestMode)
}

type memStore struct {
	mu    sync.Mutex
	users map[int64]model.User
	next  int64
}

func newMemStore() *memStore {
	return &memStore{users: map[int64]model.User{}, next: 1}
}

func (m *memStore) Create(_ context.Context, user *model.User) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, existing := range m.users {
		if existing.Email == user.Email {
			return repository.ErrConflict
		}
	}
	user.ID = m.next
	m.next++
	m.users[user.ID] = *user
	return nil
}

func (m *memStore) List(_ context.Context, limit int) ([]model.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	users := make([]model.User, 0, len(m.users))
	for id := m.next - 1; id > 0 && len(users) < limit; id-- {
		if user, ok := m.users[id]; ok {
			users = append(users, user)
		}
	}
	return users, nil
}

func (m *memStore) Get(_ context.Context, id int64) (*model.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	user, ok := m.users[id]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return &user, nil
}

func (m *memStore) Update(_ context.Context, user *model.User) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.users[user.ID]; !ok {
		return repository.ErrNotFound
	}
	for id, existing := range m.users {
		if id != user.ID && existing.Email == user.Email {
			return repository.ErrConflict
		}
	}
	m.users[user.ID] = *user
	return nil
}

func (m *memStore) Delete(_ context.Context, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.users[id]; !ok {
		return repository.ErrNotFound
	}
	delete(m.users, id)
	return nil
}

type stubPinger struct {
	err error
}

func (s stubPinger) PingContext(context.Context) error { return s.err }

func newTestServer(store service.UserStore, pingErr error) http.Handler {
	return server.NewRouter(service.NewUserService(store), stubPinger{err: pingErr})
}

func TestUserCRUD(t *testing.T) {
	router := newTestServer(newMemStore(), nil)

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
	okRouter := newTestServer(newMemStore(), nil)
	requestJSON(t, okRouter, http.MethodGet, "/health", "", http.StatusOK)

	badRouter := newTestServer(newMemStore(), errors.New("db down"))
	requestJSON(t, badRouter, http.MethodGet, "/health", "", http.StatusServiceUnavailable)
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
