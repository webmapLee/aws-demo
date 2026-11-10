package repository

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"aws-go/services/go-api/internal/database"
	"aws-go/services/go-api/internal/model"
)

func TestUserRepositoryCRUD(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}

	db, err := database.Open(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	repo := NewUserRepository(db)
	ctx := context.Background()
	email := fmt.Sprintf("phase1-%d@example.com", time.Now().UnixNano())

	created := &model.User{Name: "Phase One", Email: email}
	if err := repo.Create(ctx, created); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = repo.Delete(context.Background(), created.ID) })

	if err := repo.Create(ctx, &model.User{Name: "Dup", Email: email}); err != ErrConflict {
		t.Fatalf("duplicate error = %v", err)
	}

	got, err := repo.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Email != email {
		t.Fatalf("email = %s", got.Email)
	}

	created.Name = "Phase One Updated"
	if err := repo.Update(ctx, created); err != nil {
		t.Fatal(err)
	}

	users, err := repo.List(ctx, 20)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, user := range users {
		if user.ID == created.ID && user.Name == "Phase One Updated" {
			found = true
		}
	}
	if !found {
		t.Fatal("updated user missing from list")
	}

	if err := repo.Delete(ctx, created.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Get(ctx, created.ID); err != ErrNotFound {
		t.Fatalf("after delete = %v", err)
	}
}
