package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"aws-go/services/go-api/internal/model"
)

var (
	ErrTaskNotFound     = errors.New("task not found")
	ErrAssigneeNotFound = errors.New("assignee not found")
)

type TaskRepository struct {
	db *sql.DB
}

func NewTaskRepository(db *sql.DB) *TaskRepository {
	return &TaskRepository{db: db}
}

func (r *TaskRepository) Create(ctx context.Context, task *model.Task) error {
	err := r.db.QueryRowContext(ctx, `
		WITH created AS (
			INSERT INTO tasks (title, assignee_id)
			VALUES ($1, $2)
			RETURNING id, title, assignee_id, done, created_at
		)
		SELECT created.id, created.title, created.assignee_id, created.done, created.created_at,
		       users.id, users.name, users.email
		FROM created
		JOIN users ON users.id = created.assignee_id
	`, task.Title, task.AssigneeID).Scan(scanTask(task)...)
	if isForeignKeyViolation(err) {
		return ErrAssigneeNotFound
	}
	if err != nil {
		return fmt.Errorf("insert task: %w", err)
	}
	return nil
}

func (r *TaskRepository) List(ctx context.Context, assigneeID *int64, limit int) ([]model.Task, error) {
	query := `
		SELECT tasks.id, tasks.title, tasks.assignee_id, tasks.done, tasks.created_at,
		       users.id, users.name, users.email
		FROM tasks
		JOIN users ON users.id = tasks.assignee_id
	`
	args := []any{limit}
	if assigneeID != nil {
		query += ` WHERE tasks.assignee_id = $1`
		args = []any{*assigneeID, limit}
		query += ` ORDER BY tasks.id DESC LIMIT $2`
	} else {
		query += ` ORDER BY tasks.id DESC LIMIT $1`
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()

	tasks := make([]model.Task, 0)
	for rows.Next() {
		var task model.Task
		if err := rows.Scan(scanTask(&task)...); err != nil {
			return nil, fmt.Errorf("scan task: %w", err)
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate tasks: %w", err)
	}
	return tasks, nil
}

func (r *TaskRepository) Get(ctx context.Context, id int64) (*model.Task, error) {
	var task model.Task
	err := r.db.QueryRowContext(ctx, `
		SELECT tasks.id, tasks.title, tasks.assignee_id, tasks.done, tasks.created_at,
		       users.id, users.name, users.email
		FROM tasks
		JOIN users ON users.id = tasks.assignee_id
		WHERE tasks.id = $1
	`, id).Scan(scanTask(&task)...)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrTaskNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get task: %w", err)
	}
	return &task, nil
}

func (r *TaskRepository) Update(ctx context.Context, task *model.Task) error {
	err := r.db.QueryRowContext(ctx, `
		WITH updated AS (
			UPDATE tasks
			SET title = $1, assignee_id = $2, done = $3
			WHERE id = $4
			RETURNING id, title, assignee_id, done, created_at
		)
		SELECT updated.id, updated.title, updated.assignee_id, updated.done, updated.created_at,
		       users.id, users.name, users.email
		FROM updated
		JOIN users ON users.id = updated.assignee_id
	`, task.Title, task.AssigneeID, task.Done, task.ID).Scan(scanTask(task)...)
	if isForeignKeyViolation(err) {
		return ErrAssigneeNotFound
	}
	if errors.Is(err, sql.ErrNoRows) {
		return ErrTaskNotFound
	}
	if err != nil {
		return fmt.Errorf("update task: %w", err)
	}
	return nil
}

func (r *TaskRepository) Delete(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM tasks WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete task: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete task rows affected: %w", err)
	}
	if affected == 0 {
		return ErrTaskNotFound
	}
	return nil
}

func scanTask(task *model.Task) []any {
	return []any{
		&task.ID,
		&task.Title,
		&task.AssigneeID,
		&task.Done,
		&task.CreatedAt,
		&task.Assignee.ID,
		&task.Assignee.Name,
		&task.Assignee.Email,
	}
}
