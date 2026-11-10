// Runtime: provided.al2023. The binary name must be bootstrap.
package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handler(ctx context.Context, _ events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	base := strings.TrimRight(os.Getenv("GO_API_BASE_URL"), "/")
	client := &http.Client{Timeout: 3 * time.Second}

	healthStatus, healthCode, err := getJSON(ctx, client, base+"/health")
	if err != nil || healthCode != http.StatusOK {
		return jsonResponse(http.StatusBadGateway, map[string]string{"error": "go api unavailable"}), nil
	}

	usersBody, usersCode, err := getJSON(ctx, client, base+"/users")
	if err != nil || usersCode != http.StatusOK {
		return jsonResponse(http.StatusBadGateway, map[string]string{"error": "go api unavailable"}), nil
	}

	var users []json.RawMessage
	if err := json.Unmarshal(usersBody, &users); err != nil {
		return jsonResponse(http.StatusBadGateway, map[string]string{"error": "go api unavailable"}), nil
	}

	var health struct {
		Status string `json:"status"`
	}
	_ = json.Unmarshal(healthStatus, &health)
	return jsonResponse(http.StatusOK, map[string]any{
		"go_health":  health.Status,
		"user_count": len(users),
	}), nil
}

func getJSON(ctx context.Context, client *http.Client, url string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return body, resp.StatusCode, err
}

func jsonResponse(status int, payload any) events.APIGatewayV2HTTPResponse {
	body, _ := json.Marshal(payload)
	return events.APIGatewayV2HTTPResponse{
		StatusCode: status,
		Headers:    map[string]string{"content-type": "application/json"},
		Body:       string(body),
	}
}

func main() {
	lambda.Start(handler)
}
