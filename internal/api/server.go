package api

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	dbstore "github.com/ZeroD1vision/heimdallr-proxy/internal/db"
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

// UserStore — операции с пользователями в БД для admin API.
type UserStore interface {
	CreateUser(ctx context.Context, user *models.User) error
	DeleteUser(ctx context.Context, email string) error
	GetAllUsers(ctx context.Context) ([]models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	UpdateStatus(ctx context.Context, email string, isBlocked bool, expiresAt *time.Time) error
	ResetTraffic(ctx context.Context, email string) error
}

// XrayUserManager — контракт управления пользователями в Xray.
type XrayUserManager interface {
	AddUser(ctx context.Context, user models.User) error
	RemoveUser(ctx context.Context, inboundTag, email string) error
}

// PresenceProvider — read-only доступ к online/offline кэшу.
// API использует этот интерфейс для обогащения списка пользователей.
type PresenceProvider interface {
	IsOnline(email string) bool
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
	userStore       UserStore
	xrayUsers       XrayUserManager
	presence        PresenceProvider
	otpStore        OTPStore
	notifier        Notifier
	staticDir       string   // директория со статикой фронтенда
}

// NewServer принимает готовые зависимости. Никаких os.Getenv внутри пакета.
func NewServer(
	port, apiKey, jwtSecret, adminEmail string,
	adminTelegramID int64,
	statsProvider StatsProvider,
	historyProvider HistoryProvider,
	userStore UserStore,
	xrayUsers XrayUserManager,
	presence PresenceProvider,
	otpStore OTPStore,
	notifier Notifier,
	staticDir string,
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
		userStore:       userStore,
		xrayUsers:       xrayUsers,
		presence:        presence,
		otpStore:        otpStore,
		notifier:        notifier,
		staticDir:       staticDir,
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

	admin := s.router.Group("/api/admin", s.authMiddleware())
	admin.POST("/users", s.handleAdminCreateUser)
	admin.DELETE("/users/:email", s.handleAdminDeleteUser)
	admin.GET("/users", s.handleAdminListUsers)
	admin.PATCH("/users/:email/block", s.handleAdminBlockUser)
	admin.PATCH("/users/:email/unblock", s.handleAdminUnblockUser)
	admin.POST("/users/:email/reset-traffic", s.handleAdminResetTraffic)

	g := s.router.Group("/api", s.authMiddleware())
	g.GET("/stats", s.handleStats)
	g.GET("/history", s.handleHistory)
	s.router.Static("/", s.staticDir)
	s.router.File("/", filepath.Join(s.staticDir, "index.html"))
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

type createUserInput struct {
	Email        string     `json:"email"`
	TelegramID   int64      `json:"telegram_id"`
	InboundTag   string     `json:"inbound_tag"`
	VlessFlow    string     `json:"vless_flow"`
	TrafficLimit int64      `json:"traffic_limit"`
	ExpiresAt    *time.Time `json:"expires_at"`
}

func (input *createUserInput) validate() error {
    if input.Email == "" {
        return fmt.Errorf("email is required")
    }
    if input.TelegramID <= 0 {
        return fmt.Errorf("telegram_id must be > 0")
    }
    if input.TrafficLimit < 0 {
        return fmt.Errorf("traffic_limit must be >= 0")
    }
    if input.InboundTag == "" {
        input.InboundTag = "inbound-main"
    }
    return nil
}

func isNotFoundError(err error) bool {
	return errors.Is(err, dbstore.ErrNotFound)
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

// --- API handlers ---

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

// --- Users handlers ---

// Структура списка пользователей и статусом (Online/Offline)
type adminUserView struct {
	models.User
	Status string `json:"status"` // blocked | online | offline
}

// POST /api/admin/users — создание нового пользователя
func (s *Server) handleAdminCreateUser(c echo.Context) error {
	var input createUserInput
	if err := c.Bind(&input); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}
	if err := input.validate(); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	user := models.User{
		Email:        input.Email,
		TelegramID:   input.TelegramID,
		InboundTag:   input.InboundTag,
		VlessFlow:    input.VlessFlow,
		TrafficLimit: input.TrafficLimit,
		ExpiresAt:    input.ExpiresAt,
        IsBlocked:    false,
	}

	ctx := c.Request().Context()
	if err := s.userStore.CreateUser(ctx, &user); err != nil {
		slog.Error("admin create user: db error", "email", user.Email, "error", err)
		return c.JSON(http.StatusConflict, map[string]string{"error": "failed to create user in db"})
	}

	if err := s.xrayUsers.AddUser(ctx, user); err != nil {
		// Откатываем создание в БД при ошибке Xray API
		_ = s.userStore.DeleteUser(ctx, user.Email)
		slog.Error("admin create user: xray error, rollback done", "email", user.Email, "error", err)
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "failed to add user to xray"})
	}

	return c.JSON(http.StatusCreated, user)
}

// DELETE /api/admin/users/:email — удаление пользователя
func (s *Server) handleAdminDeleteUser(c echo.Context) error {
	email := c.Param("email")
	if email == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "email is required"})
	}

	ctx := c.Request().Context()
	user, err := s.userStore.GetUserByEmail(ctx, email)
	if err != nil {
		if isNotFoundError(err) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "user not found"})
		}
		slog.Error("admin delete user: fetch failed", "email", email, "error", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "db fetch failed"})
	}

	if err := s.userStore.DeleteUser(ctx, email); err != nil {
		if isNotFoundError(err) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "user not found"})
		}
		slog.Error("admin delete user: db delete failed", "email", email, "error", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "db delete failed"})
	}

	if err := s.xrayUsers.RemoveUser(ctx, user.InboundTag, user.Email); err != nil {
		if user.IsBlocked {
			// Если пользователь уже заблокирован, значит его нет в Xray — игнорируем ошибку удаления.
			slog.Warn("admin delete user: xray remove failed but user is already blocked, ignoring", "email", email, "error", err)
			return c.NoContent(http.StatusNoContent)
		}
		// Ошибка удаления из Xray для активного пользователя — критическая, нужно логировать и компенсировать.
		_ = s.userStore.CreateUser(ctx, user) // компенсация
		slog.Error("admin delete user: xray error, rollback done", "email", email, "error", err)
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "xray remove user failed"})
	}

	return c.NoContent(http.StatusNoContent)
}

// GET /api/admin/users — список всех пользователей
func (s *Server) handleAdminListUsers(c echo.Context) error {
	users, err := s.userStore.GetAllUsers(c.Request().Context())
	if err != nil {
		slog.Error("admin list users: fetch failed", "error", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch users"})
	}

	out := make([]adminUserView, 0, len(users))
	for _, u := range users {
		status := "offline"
		if u.IsBlocked {
			status = "blocked"
		} else if s.presence != nil && s.presence.IsOnline(u.Email) {
			status = "online"
		}
		out = append(out, adminUserView{User: u, Status: status})
	}

	return c.JSON(http.StatusOK, out)
}

// PATCH /api/admin/users/:email/block — принудительная блокировка пользователя.
func (s *Server) handleAdminBlockUser(c echo.Context) error {
	email := c.Param("email")
	if email == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "email is required"})
	}

	ctx := c.Request().Context()
	user, err := s.userStore.GetUserByEmail(ctx, email)
	if err != nil {
		if isNotFoundError(err) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "user not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "db fetch failed"})
	}

	if err := s.xrayUsers.RemoveUser(ctx, user.InboundTag, user.Email); err != nil {
		slog.Error("admin block user: xray remove failed", "email", user.Email, "error", err)
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "xray remove user failed"})
	}

	if err := s.userStore.UpdateStatus(ctx, user.Email, true, user.ExpiresAt); err != nil {
		_ = s.xrayUsers.AddUser(ctx, *user) // компенсация
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "db status update failed"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "blocked"})
}

// PATCH /api/admin/users/:email/unblock — разблокировка и возврат в Xray inbound.
func (s *Server) handleAdminUnblockUser(c echo.Context) error {
	email := c.Param("email")
	if email == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "email is required"})
	}

	ctx := c.Request().Context()
	user, err := s.userStore.GetUserByEmail(ctx, email)
	if err != nil {
		if isNotFoundError(err) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "user not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "db fetch failed"})
	}

	if err := s.xrayUsers.AddUser(ctx, *user); err != nil {
		slog.Error("admin unblock user: xray add failed", "email", user.Email, "error", err)
		return c.JSON(http.StatusBadGateway, map[string]string{"error": "xray add user failed"})
	}

	if err := s.userStore.UpdateStatus(ctx, user.Email, false, nil); err != nil {
		_ = s.xrayUsers.RemoveUser(ctx, user.InboundTag, user.Email) // компенсация
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "db status update failed"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "active"})
}

// POST /api/admin/users/:email/reset-traffic — сброс лимита трафика пользователя.
func (s *Server) handleAdminResetTraffic(c echo.Context) error {
	email := c.Param("email")
	if email == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "email is required"})
	}

	if err := s.userStore.ResetTraffic(c.Request().Context(), email); err != nil {
		if isNotFoundError(err) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "user not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to reset traffic"})
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "traffic_reset"})
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