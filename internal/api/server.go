package api

import (
	"context"
	"fmt"
	"os"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type Server struct {
	router        *echo.Echo
	port          string
	adminID       string
	statsProvider models.StatsProvider
}

func NewServer(port string, statsProvider models.StatsProvider) *Server {
	e := echo.New()

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	s := &Server{
		router:        e,
		port:          port,
		adminID:       os.Getenv("TG_ADMIN_ID"),
		statsProvider: statsProvider,
	}

	return s
}

func (s *Server) Start() error {
	s.SetupRoutes()
	addr := ":" + s.port
	fmt.Printf("✔ Starting API server on %s\n", addr)
	return s.router.Start(":" + s.port)
}

func (s *Server) SetupRoutes() {
	apiRouteGroup := s.router.Group("/api", s.isAdminMiddleware())
	apiRouteGroup.GET("/stats", s.handleStats)
}

func (s *Server) isAdminMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// TODO: Implement actual admin check logic here, e.g., check cookies mb
			return next(c)
		}
	}
}

func (s *Server) handleStats(c echo.Context) error {
	reqCtx := c.Request().Context()
	stats, err := s.statsProvider.GetStats(reqCtx)
	if err != nil {
		return c.JSON(500, map[string]string{"error": "Failed to get stats"})
	}
	return c.JSON(200, stats)
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.router.Shutdown(ctx)
}
