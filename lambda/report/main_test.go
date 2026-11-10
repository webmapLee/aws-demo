package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func TestHandlerReportsHealthAndUserCount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			w.Header().Set("content-type", "application/json")
			_, _ = w.Write([]byte(`{"status":"ok"}`))
		case "/users":
			w.Header().Set("content-type", "application/json")
			_, _ = w.Write([]byte(`[{"id":1},{"id":2}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	t.Setenv("GO_API_BASE_URL", server.URL)
	response, err := handler(context.Background(), events.APIGatewayV2HTTPRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.StatusCode, response.Body)
	}

	var payload struct {
		GoHealth  string `json:"go_health"`
		UserCount int    `json:"user_count"`
	}
	if err := json.Unmarshal([]byte(response.Body), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.GoHealth != "ok" || payload.UserCount != 2 {
		t.Fatalf("payload = %+v", payload)
	}
}

func TestHandlerReturnsBadGatewayWhenGoIsDown(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	t.Setenv("GO_API_BASE_URL", server.URL)
	response, err := handler(context.Background(), events.APIGatewayV2HTTPRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d, body = %s", response.StatusCode, response.Body)
	}
}
