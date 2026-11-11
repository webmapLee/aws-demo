package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"aws-go/services/go-api/internal/repository"
	"aws-go/services/go-api/internal/service"
)

type TaskHandler struct {
	svc *service.TaskService
}

func NewTaskHandler(svc *service.TaskService) *TaskHandler {
	return &TaskHandler{svc: svc}
}

type taskRequest struct {
	Title      string `json:"title"`
	AssigneeID int64  `json:"assignee_id"`
}

type taskUpdateRequest struct {
	Title      string `json:"title"`
	AssigneeID int64  `json:"assignee_id"`
	Done       *bool  `json:"done"`
}

func (h *TaskHandler) Create(c *gin.Context) {
	var req taskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	task, err := h.svc.Create(c.Request.Context(), req.Title, req.AssigneeID)
	if err != nil {
		writeTaskError(c, err)
		return
	}
	c.JSON(http.StatusCreated, task)
}

func (h *TaskHandler) List(c *gin.Context) {
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid limit"})
			return
		}
		limit = parsed
	}
	var assigneeID *int64
	if raw := c.Query("assignee_id"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid assignee"})
			return
		}
		assigneeID = &parsed
	}
	tasks, err := h.svc.List(c.Request.Context(), assigneeID, limit)
	if err != nil {
		writeTaskError(c, err)
		return
	}
	c.JSON(http.StatusOK, tasks)
}

func (h *TaskHandler) Get(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	task, err := h.svc.Get(c.Request.Context(), id)
	if err != nil {
		writeTaskError(c, err)
		return
	}
	c.JSON(http.StatusOK, task)
}

func (h *TaskHandler) Update(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var req taskUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Done == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	task, err := h.svc.Update(c.Request.Context(), id, req.Title, req.AssigneeID, *req.Done)
	if err != nil {
		writeTaskError(c, err)
		return
	}
	c.JSON(http.StatusOK, task)
}

func (h *TaskHandler) Delete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.Delete(c.Request.Context(), id); err != nil {
		writeTaskError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func writeTaskError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidInput):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, repository.ErrTaskNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
	case errors.Is(err, repository.ErrAssigneeNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "assignee not found"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	}
}
