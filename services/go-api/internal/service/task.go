package service

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"aws-go/services/go-api/internal/model"
)

type TaskStore interface {
	Create(ctx context.Context, task *model.Task) error
	List(ctx context.Context, assigneeID *int64, limit int) ([]model.Task, error)
	Get(ctx context.Context, id int64) (*model.Task, error)
	Update(ctx context.Context, task *model.Task) error
	Delete(ctx context.Context, id int64) error
}

type TaskService struct {
	store TaskStore
}

func NewTaskService(store TaskStore) *TaskService {
	return &TaskService{store: store}
}

func (s *TaskService) Create(ctx context.Context, title string, assigneeID int64) (*model.Task, error) {
	title, err := normalizeTitle(title)
	if err != nil {
		return nil, err
	}
	if assigneeID <= 0 {
		return nil, fmt.Errorf("%w: assignee is invalid", ErrInvalidInput)
	}
	task := &model.Task{Title: title, AssigneeID: assigneeID}
	if err := s.store.Create(ctx, task); err != nil {
		return nil, err
	}
	return task, nil
}

func (s *TaskService) List(ctx context.Context, assigneeID *int64, limit int) ([]model.Task, error) {
	if assigneeID != nil && *assigneeID <= 0 {
		return nil, fmt.Errorf("%w: assignee is invalid", ErrInvalidInput)
	}
	return s.store.List(ctx, assigneeID, clampLimit(limit))
}

func (s *TaskService) Get(ctx context.Context, id int64) (*model.Task, error) {
	if id <= 0 {
		return nil, fmt.Errorf("%w: invalid id", ErrInvalidInput)
	}
	return s.store.Get(ctx, id)
}

func (s *TaskService) Update(ctx context.Context, id int64, title string, assigneeID int64, done bool) (*model.Task, error) {
	if id <= 0 {
		return nil, fmt.Errorf("%w: invalid id", ErrInvalidInput)
	}
	title, err := normalizeTitle(title)
	if err != nil {
		return nil, err
	}
	if assigneeID <= 0 {
		return nil, fmt.Errorf("%w: assignee is invalid", ErrInvalidInput)
	}
	task := &model.Task{ID: id, Title: title, AssigneeID: assigneeID, Done: done}
	if err := s.store.Update(ctx, task); err != nil {
		return nil, err
	}
	return task, nil
}

func (s *TaskService) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("%w: invalid id", ErrInvalidInput)
	}
	return s.store.Delete(ctx, id)
}

func normalizeTitle(title string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" || utf8.RuneCountInString(title) > 200 {
		return "", fmt.Errorf("%w: title must be 1-200 characters", ErrInvalidInput)
	}
	return title, nil
}
