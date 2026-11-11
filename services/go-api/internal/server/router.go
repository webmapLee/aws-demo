package server

import (
	"github.com/gin-gonic/gin"

	"aws-go/services/go-api/internal/handler"
	"aws-go/services/go-api/internal/service"
)

func NewRouter(users *service.UserService, tasks *service.TaskService, db handler.Pinger) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	router.GET("/health", handler.NewHealthHandler(db).Check)

	userHandler := handler.NewUserHandler(users)
	router.POST("/users", userHandler.Create)
	router.GET("/users", userHandler.List)
	router.GET("/users/:id", userHandler.Get)
	router.PUT("/users/:id", userHandler.Update)
	router.DELETE("/users/:id", userHandler.Delete)

	taskHandler := handler.NewTaskHandler(tasks)
	router.POST("/tasks", taskHandler.Create)
	router.GET("/tasks", taskHandler.List)
	router.GET("/tasks/:id", taskHandler.Get)
	router.PUT("/tasks/:id", taskHandler.Update)
	router.DELETE("/tasks/:id", taskHandler.Delete)

	return router
}
