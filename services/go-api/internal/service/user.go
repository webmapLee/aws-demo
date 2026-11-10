package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"aws-go/services/go-api/internal/model"
)

var ErrInvalidInput = errors.New("invalid input")

var emailPattern = regexp.MustCompile(`^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$`)

type UserStore interface {
	Create(ctx context.Context, user *model.User) error
	List(ctx context.Context, limit int) ([]model.User, error)
	Get(ctx context.Context, id int64) (*model.User, error)
	Update(ctx context.Context, user *model.User) error
	Delete(ctx context.Context, id int64) error
}

type UserService struct {
	store UserStore
}

func NewUserService(store UserStore) *UserService {
	return &UserService{store: store}
}

func (s *UserService) Create(ctx context.Context, name, email string) (*model.User, error) {
	name, email, err := normalize(name, email)
	if err != nil {
		return nil, err
	}
	user := &model.User{Name: name, Email: email}
	if err := s.store.Create(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *UserService) List(ctx context.Context, limit int) ([]model.User, error) {
	return s.store.List(ctx, clampLimit(limit))
}

func (s *UserService) Get(ctx context.Context, id int64) (*model.User, error) {
	if id <= 0 {
		return nil, fmt.Errorf("%w: invalid id", ErrInvalidInput)
	}
	return s.store.Get(ctx, id)
}

func (s *UserService) Update(ctx context.Context, id int64, name, email string) (*model.User, error) {
	if id <= 0 {
		return nil, fmt.Errorf("%w: invalid id", ErrInvalidInput)
	}
	name, email, err := normalize(name, email)
	if err != nil {
		return nil, err
	}
	user := &model.User{ID: id, Name: name, Email: email}
	if err := s.store.Update(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *UserService) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("%w: invalid id", ErrInvalidInput)
	}
	return s.store.Delete(ctx, id)
}

func normalize(name, email string) (string, string, error) {
	name = strings.TrimSpace(name)
	email = strings.ToLower(strings.TrimSpace(email))
	if name == "" || len(name) > 100 {
		return "", "", fmt.Errorf("%w: name must be 1-100 characters", ErrInvalidInput)
	}
	if len(email) > 255 || !emailPattern.MatchString(email) {
		return "", "", fmt.Errorf("%w: email is invalid", ErrInvalidInput)
	}
	return name, email, nil
}

func clampLimit(limit int) int {
	switch {
	case limit <= 0:
		return 50
	case limit > 100:
		return 100
	default:
		return limit
	}
}
