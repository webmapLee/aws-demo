package model

import "time"

type Assignee struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type Task struct {
	ID         int64     `json:"id"`
	Title      string    `json:"title"`
	AssigneeID int64     `json:"assignee_id"`
	Assignee   Assignee  `json:"assignee"`
	Done       bool      `json:"done"`
	CreatedAt  time.Time `json:"created_at"`
}
