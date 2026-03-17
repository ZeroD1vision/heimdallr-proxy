package api

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strconv"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"github.com/golang-jwt/jwt/v5"
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

// OTPStore — всё что серверу нужно от БД для работы с OTP.
type OTPStore interface {
	SaveOTP(ctx context.Context, otp *models.OTPCode) error
	FindValidOTP(ctx context.Context, adminID int64, code string) (*models.OTPCode, error)
	MarkOTPUsed(ctx context.Context, id uint) error
}

// Notifier — отправка уведомлений пользователю.
// Реализуется ботом — сервер не знает про Telegram напрямую.
type Notifier interface {
	SendOTP(ctx context.Context, telegramID int64, code string) error
}

// --- Структура сервера ---

type Server struct {
	router          *echo.Echo
	port            string
	apiKey          string   // статичный токен для Postman/CI
	jwtSecret       string   // секрет для подписи JWT выдаваемых после 2FA
	adminEmail      string
	adminTelegramID int64
	statsProvider   StatsProvider
	historyProvider HistoryProvider
	otpStore        OTPStore
	notifier        Notifier
}

// NewServer принимает готовые зависимости. Никаких os.Getenv внутри пакета.
func NewServer(
	port, apiKey, jwtSecret, adminEmail string,
	adminTelegramID int64,
	statsProvider StatsProvider,
	historyProvider HistoryProvider,
	otpStore OTPStore,
	notifier Notifier,
) *Server {
	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())
	e.Use(requestLogger())

	return &Server{
		router:          e,
		port:            port,
		apiKey:          apiKey,
		jwtSecret:       jwtSecret,
		adminEmail:      adminEmail,
		adminTelegramID: adminTelegramID,
		statsProvider:   statsProvider,
		historyProvider: historyProvider,
		otpStore:        otpStore,
		notifier:        notifier,
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
	auth := s.router.Group("/api/auth")
	auth.POST("/request-otp", s.handleRequestOTP)
	auth.POST("/verify-otp", s.handleVerifyOTP)

	g := s.router.Group("/api", s.authMiddleware())
	g.GET("/stats", s.handleStats)
	g.GET("/history", s.handleHistory)
}

// --- Auth handlers ---
 
type requestOTPInput struct {
	TelegramID int64 `json:"telegram_id"`
}
 
// POST /api/auth/request-otp
// Генерирует OTP, сохраняет в БД и отправляет через Telegram бота.
// Принимает: {"telegram_id": 123456}
func (s *Server) handleRequestOTP(c echo.Context) error {
	var input requestOTPInput
	if err := c.Bind(&input); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}
	if input.TelegramID == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "telegram_id is required"})
	}
 
	// Проверяем что запрос идёт от известного администратора.
	// В будущем здесь будет поиск по БД для многопользовательского режима.
	if input.TelegramID != s.adminTelegramID {
		slog.Warn("otp requested for unknown telegram_id", "telegram_id", input.TelegramID, "remote_ip", c.RealIP())
		// Отвечаем одинаково — не раскрываем существует ли пользователь (timing-safe по смыслу)
		return c.JSON(http.StatusOK, map[string]string{"message": "if this account exists, a code has been sent"})
	}
 
	code, err := generateOTPCode()
	if err != nil {
		slog.Error("failed to generate otp code", "error", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "internal error"})
	}
 
	otp := &models.OTPCode{
		AdminID:   input.TelegramID,
		Code:      code,
		ExpiresAt: time.Now().UTC().Add(5 * time.Minute),
		Used:      false,
	}
 
	if err := s.otpStore.SaveOTP(c.Request().Context(), otp); err != nil {
		slog.Error("failed to save otp", "error", err, "telegram_id", input.TelegramID)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "internal error"})
	}
 
	if err := s.notifier.SendOTP(c.Request().Context(), input.TelegramID, code); err != nil {
		slog.Error("failed to send otp via telegram", "error", err, "telegram_id", input.TelegramID)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to send code"})
	}
 
	slog.Info("otp sent", "telegram_id", input.TelegramID)
	return c.JSON(http.StatusOK, map[string]string{"message": "code sent to your Telegram"})
}
 
type verifyOTPInput struct {
	TelegramID int64  `json:"telegram_id"`
	Code       string `json:"code"`
}
 
// POST /api/auth/verify-otp
// Проверяет OTP, возвращает JWT при успехе.
// Принимает: {"telegram_id": 123456, "code": "847291"}
// Возвращает: {"token": "eyJ..."}
func (s *Server) handleVerifyOTP(c echo.Context) error {
	var input verifyOTPInput
	if err := c.Bind(&input); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}
	if input.TelegramID == 0 || input.Code == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "telegram_id and code are required"})
	}
 
	otp, err := s.otpStore.FindValidOTP(c.Request().Context(), input.TelegramID, input.Code)
	if err != nil {
		// Не различаем "не найден" и "истёк" — одинаковый ответ против брутфорса
		slog.Warn("invalid or expired otp attempt", "telegram_id", input.TelegramID, "remote_ip", c.RealIP())
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid or expired code"})
	}
 
	if err := s.otpStore.MarkOTPUsed(c.Request().Context(), otp.ID); err != nil {
		slog.Error("failed to mark otp as used", "error", err, "otp_id", otp.ID)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "internal error"})
	}
 
	token, err := s.generateJWT(input.TelegramID)
	if err != nil {
		slog.Error("failed to generate jwt", "error", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "internal error"})
	}
 
	slog.Info("otp verified, jwt issued", "telegram_id", input.TelegramID)
	return c.JSON(http.StatusOK, map[string]string{"token": token})
}

// --- Middleware ---
 
// authMiddleware принимает два типа токенов:
// 1. Статичный API ключ (API_ADMIN_TOKEN) — для Postman и CI/CD
// 2. JWT выданный после успешной верификации OTP — для демонстрации 2FA
func (s *Server) authMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			}
 
			// Пробуем статичный ключ
			if secureCompare(authHeader, "Bearer "+s.apiKey) {
				return next(c)
			}
 
			// Пробуем JWT
			const prefix = "Bearer "
			if len(authHeader) > len(prefix) {
				tokenStr := authHeader[len(prefix):]
				if err := s.validateJWT(tokenStr); err == nil {
					return next(c)
				}
			}
 
			slog.Warn("unauthorized api access",
				"remote_ip", c.RealIP(),
				"path", c.Request().URL.Path,
			)
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		}
	}
}

// requestLogger логирует входящие запросы через slog.
func requestLogger() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			err := next(c)
			slog.Info("http request",
				"method",     c.Request().Method,
				"path",       c.Request().URL.Path,
				"status",     c.Response().Status,
				"latency_ms", time.Since(start).Milliseconds(),
				"remote_ip",  c.RealIP(),
			)
			return err
		}
	}
}

// --- JWT helpers ---
 
type jwtClaims struct {
	TelegramID int64 `json:"telegram_id"`
	jwt.RegisteredClaims
}
 
func (s *Server) generateJWT(telegramID int64) (string, error) {
	claims := jwtClaims{
		TelegramID: telegramID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}
 
func (s *Server) validateJWT(tokenStr string) error {
	token, err := jwt.ParseWithClaims(tokenStr, &jwtClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})
	if err != nil {
		return err
	}
	if !token.Valid {
		return fmt.Errorf("token is not valid")
	}
	return nil
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

// --- Helpers ---
 
// generateOTPCode генерирует криптографически безопасный 6-значный код.
// crypto/rand вместо math/rand — нельзя предсказать следующий код.
func generateOTPCode() (string, error) {
	const digits = 6
	max := new(big.Int).Exp(big.NewInt(10), big.NewInt(digits), nil) // 10^6 = 1000000
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", fmt.Errorf("generate random otp: %w", err)
	}
	// Форматируем с ведущими нулями: 000001, 047391 и т.д.
	return fmt.Sprintf("%06d", n.Int64()), nil
}
 
func secureCompare(given, expected string) bool {
	g, e := []byte(given), []byte(expected)
	if subtle.ConstantTimeEq(int32(len(g)), int32(len(e))) == 0 {
		return false
	}
	return subtle.ConstantTimeCompare(g, e) == 1
}