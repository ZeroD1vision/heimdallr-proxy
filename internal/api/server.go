package api

import (
	"context"
	"crypto/subtle"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// Интерфейсы определены здесь — API знает только то, что ему нужно.

// StatsProvider — живая статистика из Xray.
type StatsProvider interface {
	GetUserStats(ctx context.Context, email string) (models.UserStats, error)
}

// HistoryProvider — исторические данные из БД.
type HistoryProvider interface {
	GetHistory(ctx context.Context, email string, limit int) ([]models.UserHistory, error)
}

type Server struct {
	router     	      *echo.Echo
	port       	      string
	apiKey        	  string
	adminEmail    	  string
	statsProvider     StatsProvider
	historyProvider   HistoryProvider
}

// NewServer принимает готовые зависимости. Никаких os.Getenv внутри пакета.
func NewServer(port, apiKey, adminEmail string, stats StatsProvider, history HistoryProvider) *Server {
	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	return &Server{
		router:          e,
		port:            port,
		apiKey:          apiKey,
		adminEmail:      adminEmail,
		statsProvider:   stats,
		historyProvider: history,
	}
}

func (s *Server) Start() error {
	s.setupRoutes()
	addr := fmt.Sprintf(":%s", s.port)
	slog.Info("api server starting", "addr", addr)
	return s.router.Start(addr)
}

func (s *Server) Shutdown(ctx context.Context) error {
	slog.Info("api server shutting down")
	return s.router.Shutdown(ctx)
}

func (s *Server) setupRoutes() {
	g := s.router.Group("/api", s.authMiddleware())
	g.GET("/stats", s.handleStats)
	g.GET("/history", s.handleHistory)
}

func (s *Server) authMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" || !secureCompare(authHeader, "Bearer "+s.apiKey) {
				slog.Warn("unauthorized api access",
					"remote_ip", c.RealIP(),
					"path", c.Request().URL.Path,
				)
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error": "unauthorized",
				})
			}
			return next(c)
		}
	}
}

// GET /api/stats — статистика в текущий момент
func (s *Server) handleStats(c echo.Context) error {
	stats, err := s.statsProvider.GetUserStats(c.Request().Context(), s.adminEmail)
	if err != nil {
		slog.Error("api: failed to get stats", "error", err, "remote_ip", c.RealIP())
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "internal error"})
	}
	return c.JSON(http.StatusOK, stats)
}

// GET /api/history?limit=100 — история из БД
func (s *Server) handleHistory(c echo.Context) error {
	limit := 100
	if l := c.QueryParam("limit"); l != "" {
		parsed, err := strconv.Atoi(l)
		if err != nil || parsed <= 0 || parsed > 1000 {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "limit must be between 1 and 1000",
			})
		}
		limit = parsed
	}

	history, err := s.historyProvider.GetHistory(c.Request().Context(), s.adminEmail, limit)
	if err != nil {
		slog.Error("api: failed to get history", "error", err, "remote_ip", c.RealIP())
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "internal error"})
	}
	return c.JSON(http.StatusOK, history)
}

func secureCompare(given, expected string) bool {
	g, e := []byte(given), []byte(expected)
	if subtle.ConstantTimeEq(int32(len(g)), int32(len(e))) == 0 {
		return false
	}
	return subtle.ConstantTimeCompare(g, e) == 1
}