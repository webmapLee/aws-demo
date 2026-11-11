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

func TestTaskRepositoryCRUD(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}

	db, err := database.Open(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	users := NewUserRepository(db)
	tasks := NewTaskRepository(db)
	ctx := context.Background()
	stamp := time.Now().UnixNano()

	ada := &model.User{Name: "Ada", Email: fmt.Sprintf("task-ada-%d@example.com", stamp)}
	grace := &model.User{Name: "Grace", Email: fmt.Sprintf("task-grace-%d@example.com", stamp)}
	if err := users.Create(ctx, ada); err != nil {
		t.Fatal(err)
	}
	if err := users.Create(ctx, grace); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = users.Delete(context.Background(), ada.ID)
		_ = users.Delete(context.Background(), grace.ID)
	})

	if err := tasks.Create(ctx, &model.Task{Title: "orphan", AssigneeID: ada.ID + grace.ID + 1000}); err != ErrAssigneeNotFound {
		t.Fatalf("missing assignee = %v", err)
	}

	task := &model.Task{Title: "写周报", AssigneeID: ada.ID}
	if err := tasks.Create(ctx, task); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tasks.Delete(context.Background(), task.ID) })
	if task.Assignee.Name != "Ada" || task.Done {
		t.Fatalf("created = %+v", task)
	}

	listed, err := tasks.List(ctx, &ada.ID, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 1 || listed[0].ID != task.ID {
		t.Fatalf("list = %+v", listed)
	}

	task.Title = "交周报"
	task.AssigneeID = grace.ID
	task.Done = true
	if err := tasks.Update(ctx, task); err != nil {
		t.Fatal(err)
	}
	if task.Assignee.Email != grace.Email || !task.Done {
		t.Fatalf("updated = %+v", task)
	}

	if err := users.Delete(ctx, grace.ID); err != ErrHasTasks {
		t.Fatalf("delete assignee = %v", err)
	}
	if err := tasks.Delete(ctx, task.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := tasks.Get(ctx, task.ID); err != ErrTaskNotFound {
		t.Fatalf("after delete = %v", err)
	}
	if err := users.Delete(ctx, grace.ID); err != nil {
		t.Fatal(err)
	}
}
