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
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"golang.org/x/crypto/bcrypt"
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

// WebUserStore — контракт для работы с веб-аккаунтами.
type WebUserStore interface {
	CreateWebUser(ctx context.Context, u *models.WebUser) error
	GetWebUserByEmail(ctx context.Context, email string) (*models.WebUser, error)
	GetWebUserByID(ctx context.Context, id uint) (*models.WebUser, error)
	UpdateWebUserLogin(ctx context.Context, userID uint, ip string) error
}

// SessionStore — контракт для работы с auth-сессиями.
type SessionStore interface {
	SaveSession(ctx context.Context, session *models.AuthSession) error
	FindValidSession(ctx context.Context, sessionID string) (*models.AuthSession, error)
	UpdateSessionStatus(ctx context.Context, sessionID string, status models.SessionStatus) error
	DeleteExpiredSessions(ctx context.Context) error
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

// PresenceProvider — интерфейс для server.go.
// GetAllStats добавлен вместо GetTotalStats: фронт получает данные
// по каждому юзеру и агрегирует сам если нужно.
type PresenceProvider interface {
	IsOnline(email string) bool
	// GetAllStats возвращает срез со статистикой каждого пользователя из кэша.
	GetAllStats() []models.UserStats
}

// --- Структура сервера ---
type Server struct {
	router          *echo.Echo
	port            string
	apiKey          string // статичный токен для Postman/CI
	jwtSecret       string // секрет для подписи JWT выдаваемых после 2FA
	adminEmail      string
	adminTelegramID int64
	statsProvider   StatsProvider
	historyProvider HistoryProvider
	userStore       UserStore
	webUserStore    WebUserStore // веб-аккаунты
	xrayUsers       XrayUserManager
	presence        PresenceProvider
	otpStore        OTPStore
	sessionStore    SessionStore // auth-сессии
	notifier        Notifier
	staticDir       string // директория со статикой фронтенда
}

// NewServer принимает готовые зависимости. Никаких os.Getenv внутри пакета.
func NewServer(
	port, apiKey, jwtSecret, adminEmail string,
	statsProvider StatsProvider,
	historyProvider HistoryProvider,
	userStore UserStore,
	webUserStore WebUserStore,
	xrayUsers XrayUserManager,
	presence PresenceProvider,
	otpStore OTPStore,
	sessionStore SessionStore,
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
		statsProvider:   statsProvider,
		historyProvider: historyProvider,
		userStore:       userStore,
		webUserStore:    webUserStore,
		xrayUsers:       xrayUsers,
		presence:        presence,
		otpStore:        otpStore,
		sessionStore:    sessionStore,
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
	// ── Auth — публичные эндпоинты ────────────────────────────────────────────
	auth := s.router.Group("/api/auth")
	auth.POST("/register", s.handleRegister)        // email + password → создаёт WebUser + сессию регистрации
	auth.POST("/login", s.handleLogin)              // email + password → JWT или сессия 2FA
	auth.GET("/status/:session_id", s.handleStatus) // polling: PENDING | APPROVED+token | EXPIRED
	auth.POST("/verify", s.handleVerify)            // ручной ввод OTP (fallback)

	// ── Admin — защищённые эндпоинты (API key или JWT) ───────────────────────
	admin := s.router.Group("/api/admin", s.authMiddleware())
	admin.POST("/users", s.handleAdminCreateUser)
	admin.DELETE("/users/:email", s.handleAdminDeleteUser)
	admin.GET("/users", s.handleAdminListUsers)
	admin.PATCH("/users/:email/block", s.handleAdminBlockUser)
	admin.PATCH("/users/:email/unblock", s.handleAdminUnblockUser)
	admin.POST("/users/:email/reset-traffic", s.handleAdminResetTraffic)

	// ── Данные — только для авторизованных ───────────────────────────────────
	g := s.router.Group("/api", s.authMiddleware())
	g.GET("/stats", s.handleStats)
	g.GET("/history", s.handleHistory)

	// ── Статика — Next.js build ───────────────────────────────────────────────
	s.router.Static("/", s.staticDir)
	s.router.File("/", filepath.Join(s.staticDir, "index.html"))
}

// ── Auth handlers ─────────────────────────────────────────────────────────────

// registerInput — тело запроса для регистрации.
type registerInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// registerResponse — ответ на успешную регистрацию.
// SessionID используется фронтом для polling и построения TG-ссылки.
type registerResponse struct {
	SessionID string `json:"session_id"`
	TGLink    string `json:"tg_link"` // https://t.me/lovely_arti_bot?start=reg_{session_id}
}

// handleRegister обрабатывает регистрацию нового пользователя.
//
// Флоу:
//  1. Валидация email + password
//  2. Проверка что email не занят
//  3. Хеширование пароля (bcrypt cost=12)
//  4. Создание WebUser со статусом PENDING
//  5. Создание AuthSession типа REGISTER (без OTP — апрув через TG)
//  6. Возврат session_id и TG-ссылки для QR-кода
//
// После: фронт показывает QR, polling ждёт APPROVED.
// Бот апрувит → WebUser.Status = ACTIVE, TelegramID привязан.
func (s *Server) handleRegister(c echo.Context) error {
	var input registerInput
	if err := c.Bind(&input); err != nil {
		fmt.Println("Failed to bind register input:", err)
		return c.JSON(http.StatusBadRequest, errResp("invalid request body"))
	}
	if input.Email == "" || input.Password == "" {
		fmt.Println("Email or password is empty")
		return c.JSON(http.StatusBadRequest, errResp("email and password are required"))
	}
	if len(input.Password) < 8 {
		fmt.Println("Password is too short")
		return c.JSON(http.StatusBadRequest, errResp("password must be at least 8 characters"))
	}

	ctx := c.Request().Context()

	// Проверяем уникальность email перед тяжёлой операцией bcrypt
	if _, err := s.webUserStore.GetWebUserByEmail(ctx, input.Email); !errors.Is(err, dbstore.ErrNotFound) {
		fmt.Println("Email already registered:", input.Email)
		// err == nil означает что пользователь найден — email занят
		// Любая другая ошибка — возвращаем 500
		if err == nil {
			fmt.Println("Email already registered:", input.Email)
			return c.JSON(http.StatusConflict, errResp("email already registered"))
		}
		slog.Error("register: db lookup failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	// bcrypt cost=12 — баланс между безопасностью и временем (~250ms на современном железе).
	// Это намеренно медленно: защита от брутфорса на уровне алгоритма.
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		slog.Error("register: bcrypt failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	user := &models.WebUser{
		Email:        input.Email,
		PasswordHash: string(hash),
		Status:       models.WebUserPending,
	}
	if err := s.webUserStore.CreateWebUser(ctx, user); err != nil {
		slog.Error("register: create user failed", "email", input.Email, "error", err)
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	// Создаём сессию регистрации. OTP не нужен — достаточно факта нажатия START в боте.
	session := &models.AuthSession{
		ID:        uuid.NewString(),
		WebUserID: user.ID,
		Kind:      models.SessionKindRegister,
		Status:    models.SessionPending,
		ExpiresAt: time.Now().UTC().Add(10 * time.Minute),
	}
	if err := s.sessionStore.SaveSession(ctx, session); err != nil {
		slog.Error("register: save session failed", "user_id", user.ID, "error", err)
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	tgLink := fmt.Sprintf("https://t.me/lovely_arti_bot?start=reg_%s", session.ID)
	slog.Info("web user registered, awaiting tg confirmation",
		"email", input.Email,
		"user_id", user.ID,
		"session_id", session.ID,
	)

	return c.JSON(http.StatusCreated, registerResponse{
		SessionID: session.ID,
		TGLink:    tgLink,
	})
}

// loginInput — тело запроса для входа.
type loginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// loginResponse — ответ на успешный вход.
//
// Если RequiresTwoFA == false: Token содержит JWT, вход завершён.
// Если RequiresTwoFA == true:  SessionID содержит ID 2FA-сессии для polling и ввода кода.
type loginResponse struct {
	Token         string `json:"token,omitempty"`
	RequiresTwoFA bool   `json:"requires_two_fa"`
	SessionID     string `json:"session_id,omitempty"`
	TGLink        string `json:"tg_link,omitempty"` // ссылка для 2FA через TG
}

// handleLogin обрабатывает вход по email + password.
//
// Флоу A (пользователь ACTIVE):
//  1. Проверка пароля (bcrypt)
//  2. Создание 2FA-сессии + генерация OTP
//  3. Отправка OTP в Telegram
//  4. Ответ: {requires_two_fa: true, session_id, tg_link}
//  5. Фронт показывает экран 2FA, polling ждёт APPROVED
//
// Флоу B (пользователь PENDING):
//  1. Проверка пароля
//  2. Ответ: {requires_two_fa: true, session_id} — восстановление QR-экрана
//
// Намеренно не раскрываем причину отказа ("email не найден" vs "неверный пароль") —
// это защита от user enumeration атак.
func (s *Server) handleLogin(c echo.Context) error {
	var input loginInput
	if err := c.Bind(&input); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("invalid request body"))
	}
	if input.Email == "" || input.Password == "" {
		return c.JSON(http.StatusBadRequest, errResp("email and password are required"))
	}

	ctx := c.Request().Context()

	user, err := s.webUserStore.GetWebUserByEmail(ctx, input.Email)
	if err != nil {
		if errors.Is(err, dbstore.ErrNotFound) {
			// Одинаковая задержка что и при неверном пароле — против timing-атак
			_ = bcrypt.CompareHashAndPassword([]byte("$2a$12$dummy"), []byte(input.Password))
			return c.JSON(http.StatusUnauthorized, errResp("invalid credentials"))
		}
		slog.Error("login: db lookup failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	// Проверяем пароль через bcrypt. Намеренно медленно.
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		slog.Warn("login: invalid password attempt", "email", input.Email, "remote_ip", c.RealIP())
		return c.JSON(http.StatusUnauthorized, errResp("invalid credentials"))
	}

	if user.Status == models.WebUserSuspended {
		slog.Warn("login: suspended user attempted login", "email", input.Email)
		return c.JSON(http.StatusForbidden, errResp("account suspended"))
	}

	// Флоу B: пользователь ещё не привязал TG — возвращаем на QR-экран.
	// Создаём новую сессию регистрации чтобы QR был рабочим.
	if user.Status == models.WebUserPending {
		session := &models.AuthSession{
			ID:        uuid.NewString(),
			WebUserID: user.ID,
			Kind:      models.SessionKindRegister,
			Status:    models.SessionPending,
			ExpiresAt: time.Now().UTC().Add(10 * time.Minute),
		}
		if err := s.sessionStore.SaveSession(ctx, session); err != nil {
			return c.JSON(http.StatusInternalServerError, errResp("internal error"))
		}
		tgLink := fmt.Sprintf("https://t.me/lovely_arti_bot?start=reg_%s", session.ID)
		return c.JSON(http.StatusOK, loginResponse{
			RequiresTwoFA: true,
			SessionID:     session.ID,
			TGLink:        tgLink,
		})
	}

	// Флоу A: пользователь ACTIVE — создаём 2FA-сессию и отправляем OTP в TG.
	code, err := generateOTPCode()
	if err != nil {
		slog.Error("login: otp generation failed", "error", err)
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	session := &models.AuthSession{
		ID:        uuid.NewString(),
		WebUserID: user.ID,
		Kind:      models.SessionKindLogin2FA,
		OTPCode:   code,
		Status:    models.SessionPending,
		ExpiresAt: time.Now().UTC().Add(10 * time.Minute),
	}
	if err := s.sessionStore.SaveSession(ctx, session); err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	// Отправляем OTP через бота. user.TelegramID гарантированно != nil (статус ACTIVE).
	if err := s.notifier.SendOTP(ctx, *user.TelegramID, code); err != nil {
		slog.Error("login: failed to send otp", "email", input.Email, "error", err)
		return c.JSON(http.StatusInternalServerError, errResp("failed to send verification code"))
	}

	// TG-ссылка для 2FA — бот апрувит сессию нажатием START (альтернатива вводу кода).
	tgLink := fmt.Sprintf("https://t.me/lovely_arti_bot?start=2fa_%s", session.ID)

	// Фиксируем IP последнего входа (точнее — попытки, 2FA ещё не пройдена).
	// Полная запись с временем будет после успешного verify.
	go func() {
		_ = s.webUserStore.UpdateWebUserLogin(context.Background(), user.ID, c.RealIP())
	}()

	slog.Info("login: 2fa session created, otp sent",
		"email", input.Email,
		"session_id", session.ID,
	)

	return c.JSON(http.StatusOK, loginResponse{
		RequiresTwoFA: true,
		SessionID:     session.ID,
		TGLink:        tgLink,
	})
}

// statusResponse — ответ на polling запрос.
type statusResponse struct {
	Status string `json:"status"`          // PENDING | APPROVED | EXPIRED
	Token  string `json:"token,omitempty"` // JWT — только при APPROVED
}

// handleStatus — polling эндпоинт. Фронт опрашивает каждые ~1.5 секунды.
//
// При APPROVED выдаёт JWT и статус сессии — дальнейший polling не нужен.
// При EXPIRED фронт перенаправляет пользователя на начало флоу.
func (s *Server) handleStatus(c echo.Context) error {
	sessionID := c.Param("session_id")
	if sessionID == "" {
		return c.JSON(http.StatusBadRequest, errResp("session_id is required"))
	}

	ctx := c.Request().Context()

	session, err := s.sessionStore.FindValidSession(ctx, sessionID)
	if err != nil {
		if errors.Is(err, dbstore.ErrNotFound) {
			// Сессия не найдена или просрочена — клиент должен начать заново.
			return c.JSON(http.StatusOK, statusResponse{Status: string(models.SessionExpired)})
		}
		slog.Error("status: db lookup failed", "session_id", sessionID, "error", err)
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	if session.Status != models.SessionApproved {
		return c.JSON(http.StatusOK, statusResponse{Status: string(session.Status)})
	}

	// Сессия апрувнута — генерируем JWT и завершаем флоу.
	token, err := s.issueJWT(ctx, session.WebUserID)
	if err != nil {
		slog.Error("status: jwt issue failed", "session_id", sessionID, "error", err)
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	slog.Info("status: session approved, jwt issued",
		"session_id", sessionID,
		"web_user_id", session.WebUserID,
		"kind", session.Kind,
	)

	return c.JSON(http.StatusOK, statusResponse{
		Status: string(models.SessionApproved),
		Token:  token,
	})
}

// verifyInput — тело запроса для ручного ввода OTP.
type verifyInput struct {
	SessionID string `json:"session_id"`
	Code      string `json:"code"`
}

// handleVerify — fallback для ручного ввода кода из Telegram.
//
// Работает только для сессий типа LOGIN_2FA — у регистрационных сессий нет OTP.
// При успехе переводит сессию в APPROVED и возвращает JWT.
func (s *Server) handleVerify(c echo.Context) error {
	var input verifyInput
	if err := c.Bind(&input); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("invalid request body"))
	}
	if input.SessionID == "" || input.Code == "" {
		return c.JSON(http.StatusBadRequest, errResp("session_id and code are required"))
	}

	ctx := c.Request().Context()

	session, err := s.sessionStore.FindValidSession(ctx, input.SessionID)
	if err != nil {
		if errors.Is(err, dbstore.ErrNotFound) {
			return c.JSON(http.StatusUnauthorized, errResp("session expired or not found"))
		}
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	// Ручной ввод кода — только для 2FA сессий.
	if session.Kind != models.SessionKindLogin2FA {
		return c.JSON(http.StatusBadRequest, errResp("code verification not applicable for this session type"))
	}

	// Уже апрувнута (бот успел раньше) — просто выдаём токен.
	if session.Status == models.SessionApproved {
		token, err := s.issueJWT(ctx, session.WebUserID)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, errResp("internal error"))
		}
		return c.JSON(http.StatusOK, map[string]string{"token": token})
	}

	// constant-time сравнение — защита от timing-атак на OTP.
	if !secureCompare(input.Code, session.OTPCode) {
		slog.Warn("verify: invalid otp code",
			"session_id", input.SessionID,
			"remote_ip", c.RealIP(),
		)
		return c.JSON(http.StatusUnauthorized, errResp("invalid code"))
	}

	if err := s.sessionStore.UpdateSessionStatus(ctx, session.ID, models.SessionApproved); err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	token, err := s.issueJWT(ctx, session.WebUserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("internal error"))
	}

	slog.Info("verify: otp confirmed manually, jwt issued",
		"session_id", session.ID,
		"web_user_id", session.WebUserID,
	)

	return c.JSON(http.StatusOK, map[string]string{"token": token})
}

type createUserInput struct {
	Email        string     `json:"email"`
	TelegramID   *int64     `json:"telegram_id"`
	InboundTag   string     `json:"inbound_tag"`
	VlessFlow    string     `json:"vless_flow"`
	TrafficLimit int64      `json:"traffic_limit"`
	ExpiresAt    *time.Time `json:"expires_at"`
}

func (input *createUserInput) validate() error {
	if input.Email == "" {
		return fmt.Errorf("email is required")
	}
	if input.TelegramID != nil && *input.TelegramID <= 0 {
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

// ── Middleware ────────────────────────────────────────────────────────────────

// authMiddleware проверяет либо статический API-ключ (для admin-скриптов),
// либо JWT выданный нашим сервером (для веб-клиента).
// При успехе кладёт claims в контекст под ключом "claims".
func (s *Server) authMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" {
				return c.JSON(http.StatusUnauthorized, errResp("unauthorized"))
			}

			// Проверяем статический API-ключ (Bearer <api_key>).
			if secureCompare(authHeader, "Bearer "+s.apiKey) {
				return next(c)
			}

			// Проверяем JWT.
			const prefix = "Bearer "
			if len(authHeader) <= len(prefix) {
				return c.JSON(http.StatusUnauthorized, errResp("unauthorized"))
			}
			tokenStr := authHeader[len(prefix):]
			claims, err := s.parseJWT(tokenStr)
			if err != nil {
				slog.Warn("auth: invalid jwt", "remote_ip", c.RealIP(), "path", c.Request().URL.Path)
				return c.JSON(http.StatusUnauthorized, errResp("unauthorized"))
			}

			// Кладём claims в контекст — хендлеры могут использовать для персонализации.
			c.Set("claims", claims)
			return next(c)
		}
	}
}

func requestLogger() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			err := next(c)
			slog.Info("http",
				"method", c.Request().Method,
				"path", c.Request().URL.Path,
				"status", c.Response().Status,
				"ms", time.Since(start).Milliseconds(),
				"ip", c.RealIP(),
			)
			return err
		}
	}
}

// ── JWT ───────────────────────────────────────────────────────────────────────

// jwtClaims — payload нашего JWT.
// HasXray позволяет фронту сразу знать нужно ли показывать плейсхолдеры.
type jwtClaims struct {
	WebUserID uint   `json:"web_user_id"`
	Email     string `json:"email"`
	HasXray   bool   `json:"has_xray"` // есть ли Xray-аккаунт (для показа метрик)
	jwt.RegisteredClaims
}

// issueJWT выдаёт JWT для web-пользователя.
// Проверяет наличие Xray-аккаунта и пишет флаг в claims.
func (s *Server) issueJWT(ctx context.Context, webUserID uint) (string, error) {
	slog.Info("issueJWT starting", "webUserID", webUserID, "hasStore", s.webUserStore != nil)
	user, err := s.webUserStore.GetWebUserByID(ctx, webUserID)
	if err != nil {
		return "", fmt.Errorf("issueJWT: get web user: %w", err)
	}

	// Проверяем наличие Xray-аккаунта по email.
	// Ошибка здесь не критична — просто выставим HasXray=false.
	_, xrayErr := s.userStore.GetUserByEmail(ctx, user.Email)
	hasXray := xrayErr == nil

	claims := jwtClaims{
		WebUserID: user.ID,
		Email:     user.Email,
		HasXray:   hasXray,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

func (s *Server) parseJWT(tokenStr string) (*jwtClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &jwtClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*jwtClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}

// --- API handlers ---

// GET /api/stats — статистика в текущий момент
func (s *Server) handleStats(c echo.Context) error {
	return c.JSON(http.StatusOK, s.presence.GetAllStats())
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

// ── Helpers ───────────────────────────────────────────────────────────────────

// generateOTPCode генерирует криптографически безопасный 6-значный код.
// crypto/rand вместо math/rand — нельзя предсказать следующий код.
func generateOTPCode() (string, error) {
	const digits = 6
	max := new(big.Int).Exp(big.NewInt(10), big.NewInt(digits), nil) // 10^6 = 1_000_000
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

// errResp формирует стандартный JSON-ответ с ошибкой.
func errResp(msg string) map[string]string {
	return map[string]string{"error": msg}
}

// isNotFound проверяет является ли ошибка "запись не найдена".
func isNotFound(err error) bool {
	return errors.Is(err, dbstore.ErrNotFound)
}
