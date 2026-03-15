package api

import (
	"context"
	"crypto/subtle"
	"fmt"
	"log/slog"
	"net/http"
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
	apiKey        string
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
		apiKey:        os.Getenv("API_ADMIN_TOKEN"),
	}

	return s
}

func (s *Server) Start() error {
	s.SetupRoutes()
	addr := ":" + s.port
	fmt.Printf("✔ Starting API server on %s\n", addr)
	slog.Info("api server started", "port", s.port)
	return s.router.Start(":" + s.port)
}

func (s *Server) SetupRoutes() {
	apiRouteGroup := s.router.Group("/api", s.isAdminMiddleware())
	apiRouteGroup.GET("/stats", s.handleStats)
}

func (s *Server) isAdminMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			adminToken := os.Getenv("API_ADMIN_TOKEN")
			authHeader := c.Request().Header.Get("Authorization")

			if authHeader == "" || !secureCompare(authHeader, "Bearer "+adminToken) { // Use secure comparison to prevent timing attacks
				slog.Warn("Unauthorized access attempt to API endpoint", 
					"remote_ip", c.RealIP(), 
					"request_id", c.Response().Header().Get(echo.HeaderXRequestID))
				
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error": "Unauthorized access. Key is missing or invalid.",
				})
			}
			return next(c)
		}
	}
}

func secureCompare(given string, expected string) bool {
	// Use constant time comparison to prevent timing attacks
	g, e := []byte(given), []byte(expected)
	// Check if lengths are equal first to avoid unnecessary comparison
	if subtle.ConstantTimeEq(int32(len(g)), int32(len(e))) == 0 { 
		return false
	}
	return subtle.ConstantTimeCompare(g, e) == 1 // Return true if they match, false otherwise
}

func (s *Server) handleStats(c echo.Context) error {
	reqCtx := c.Request().Context()
	stats, err := s.statsProvider.GetStats(reqCtx)
	if err != nil {
		slog.Error("failed to fetch xray stats", 
            "error", err, 
            "remote_ip", c.RealIP(),
            "request_id", c.Response().Header().Get(echo.HeaderXRequestID),
        )
		return c.JSON(500, map[string]string{
            "status": "error",
            "message": "Internal service error",
        })
	}
	return c.JSON(200, stats)
}

func (s *Server) Shutdown(ctx context.Context) error {
	slog.Info("Shutting down API server...")
	return s.router.Shutdown(ctx)
}
