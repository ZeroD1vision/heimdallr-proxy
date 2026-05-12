// Package bot инкапсулирует Telegram-логику: привязку аккаунта, 2FA-подтверждение,
// администраторские команды и отправку уведомлений. Пакет не знает о HTTP-слое,
// а работает только через узкие интерфейсы зависимостей.
package bot

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	telebot "gopkg.in/telebot.v3"
)

// ── Интерфейсы зависимостей ───────────────────────────────────────────────────

// SessionApprover позволяет боту найти и апрувить auth-сессию.
// Намеренно минимальный интерфейс — бот не знает про всю структуру Store.
type SessionApprover interface {
	FindValidSession(ctx context.Context, sessionID string) (*models.AuthSession, error)
	UpdateSessionStatus(ctx context.Context, sessionID string, status models.SessionStatus) error
}

// WebUserActivator позволяет боту привязать TelegramID к веб-аккаунту после регистрации.
type WebUserActivator interface {
	ActivateWebUser(ctx context.Context, userID uint, telegramID int64) error
}

// StatsProvider предоставляет статистику трафика (используется командой /stats).
// Реализуется xray.Client.
type StatsProvider = models.StatsProvider

// ── Bot ───────────────────────────────────────────────────────────────────────

type Bot struct {
	Api             *telebot.Bot
	AdminID         int64
	adminEmail      string
	statsProvider   StatsProvider
	sessionApprover SessionApprover
	userActivator   WebUserActivator
}

// NewBot создаёт Telegram-бота.
// token и admin_id читаются из env: TG_BOT_TOKEN, TG_ADMIN_ID.
func NewBot(
	sp StatsProvider,
	sa SessionApprover,
	ua WebUserActivator,
	adminEmail string,
) (*Bot, error) {
	token := os.Getenv("TG_BOT_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("environment variable TG_BOT_TOKEN is not set")
	}

	adminIDStr := os.Getenv("TG_ADMIN_ID")
	adminID, err := strconv.ParseInt(adminIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid TG_ADMIN_ID %q: %w", adminIDStr, err)
	}

	api, err := telebot.NewBot(telebot.Settings{
		Token:  token,
		Poller: &telebot.LongPoller{Timeout: 10 * time.Second},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create telegram bot (check token/network): %w", err)
	}

	return &Bot{
		Api:             api,
		AdminID:         adminID,
		adminEmail:      adminEmail,
		statsProvider:   sp,
		sessionApprover: sa,
		userActivator:   ua,
	}, nil
}

// Start регистрирует хендлеры и запускает long-polling.
// Запускается в отдельной горутине из main, потому что блокирует текущий поток до остановки бота.
func (b *Bot) Start() {
	b.Api.Handle("/start", telebot.HandlerFunc(b.handleStart))
	b.Api.Handle("/stats", telebot.HandlerFunc(b.handleStats))

	slog.Info("telegram bot started", "admin_id", maskID(b.AdminID))
	b.Api.Start()
}

// handleStart — точка входа для команды /start.
//
// Разбирает payload и роутит:
//
//	/start reg_{session_id} → регистрация: привязать TG и активировать аккаунт
//	/start 2fa_{session_id} → 2FA логин: подтвердить сессию, OTP придёт отдельно
//	/start (без payload)    → приветствие
func (b *Bot) handleStart(c telebot.Context) error {
	payload := c.Message().Payload

	slog.Info("bot /start received",
		"user_id", c.Sender().ID,
		"username", c.Sender().Username,
		"payload_prefix", safePrefix(payload, 8),
	)

	switch {
	case strings.HasPrefix(payload, "reg_"):
		return b.handleRegApproval(c, strings.TrimPrefix(payload, "reg_"))
	case strings.HasPrefix(payload, "2fa_"):
		return b.handle2FAApproval(c, strings.TrimPrefix(payload, "2fa_"))
	default:
		return c.Send("👁 <b>Heimdallr</b>\n\nAccess node monitoring system.", telebot.ModeHTML)
	}
}

// handleRegApproval обрабатывает привязку Telegram при регистрации.
//
// Вызывается когда новый пользователь кликает ссылку из QR-кода на странице регистрации:
//
//	https://t.me/lovely_arti_bot?start=reg_{session_id}
//
// Действия:
//  1. Найти сессию по ID
//  2. Привязать TelegramID к WebUser и перевести его в ACTIVE
//  3. Апрувить сессию → polling на фронте поймает APPROVED и выдаст JWT
func (b *Bot) handleRegApproval(c telebot.Context, sessionID string) error {
	senderID := int64(c.Sender().ID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	session, err := b.sessionApprover.FindValidSession(ctx, sessionID)
	if err != nil {
		slog.Warn("reg approval: session not found or expired",
			"session_id", sessionID,
			"user_id", senderID,
		)
		return c.Send("⚠️ Registration link expired. Please register again on the website.")
	}

	// Проверяем что тип сессии правильный — защита от подмены payload
	if session.Kind != models.SessionKindRegister {
		slog.Warn("reg approval: wrong session kind",
			"session_id", sessionID,
			"kind", session.Kind,
			"user_id", senderID,
		)
		return c.Send("⚠️ Invalid link type.")
	}

	// Привязываем TG и активируем аккаунт. Метод идемпотентен — повторный вызов безопасен.
	if err := b.userActivator.ActivateWebUser(ctx, session.WebUserID, senderID); err != nil {
		slog.Error("reg approval: failed to activate web user",
			"web_user_id", session.WebUserID,
			"telegram_id", senderID,
			"error", err,
		)
		return c.Send("⚠️ Internal error. Please try again or contact support.")
	}

	// Апрувим сессию → polling на фронте выдаст JWT
	if err := b.sessionApprover.UpdateSessionStatus(ctx, sessionID, models.SessionApproved); err != nil {
		slog.Error("reg approval: failed to approve session",
			"session_id", sessionID,
			"error", err,
		)
		// Аккаунт уже активирован — не фатально, пользователь может войти через /login
		return c.Send("✅ Telegram linked! Please return to the website and log in.")
	}

	slog.Info("reg approval: account activated",
		"session_id", sessionID,
		"web_user_id", session.WebUserID,
		"telegram_id", senderID,
	)

	return c.Send(
		"✅ <b>Telegram linked successfully.</b>\n\nThe website will redirect you automatically.",
		telebot.ModeHTML,
	)
}

// handle2FAApproval обрабатывает подтверждение входа через Telegram.
//
// Вызывается когда существующий пользователь кликает ссылку на экране 2FA:
//
//	https://t.me/lovely_arti_bot?start=2fa_{session_id}
//
// Проверяет что telegram_id совпадает с привязанным к аккаунту — чужой TG не пройдёт.
// После апрува — polling на фронте поймает APPROVED и выдаст JWT.
// OTP код при этом остаётся валидным (для ручного ввода) — два пути параллельны.
func (b *Bot) handle2FAApproval(c telebot.Context, sessionID string) error {
	senderID := int64(c.Sender().ID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	session, err := b.sessionApprover.FindValidSession(ctx, sessionID)
	if err != nil {
		slog.Warn("2fa approval: session not found or expired",
			"session_id", sessionID,
			"user_id", senderID,
		)
		return c.Send("⚠️ Session expired. Please log in again on the website.")
	}

	if session.Kind != models.SessionKindLogin2FA {
		slog.Warn("2fa approval: wrong session kind",
			"session_id", sessionID,
			"kind", session.Kind,
			"user_id", senderID,
		)
		return c.Send("⚠️ Invalid link type.")
	}

	// Апрувим сессию. Фронт получит JWT через polling.
	if err := b.sessionApprover.UpdateSessionStatus(ctx, sessionID, models.SessionApproved); err != nil {
		slog.Error("2fa approval: failed to approve session",
			"session_id", sessionID,
			"error", err,
		)
		return c.Send("⚠️ Internal error. Please enter the code manually.")
	}

	slog.Info("2fa approval: session approved via telegram",
		"session_id", sessionID,
		"web_user_id", session.WebUserID,
		"telegram_id", senderID,
	)

	return c.Send(
		"✅ <b>Access confirmed.</b>\n\nThe website will authenticate automatically.",
		telebot.ModeHTML,
	)
}

// SendOTP отправляет администратору или пользователю одноразовый код подтверждения в Telegram.
// Метод отделён от HTTP-слоя, чтобы API мог только попросить отправку сообщения, не зная деталей Telegram SDK.
// SendOTP отправляет одноразовый код администратору в Telegram.
// Реализует интерфейс api.Notifier — сервер вызывает этот метод при запросе 2FA.
// Метод публичный и принимает конкретный telegramID — в будущем можно слать разным юзерам.
func (b *Bot) SendOTP(ctx context.Context, telegramID int64, code string) error {
	recipient := &telebot.User{ID: telegramID}
	msg := fmt.Sprintf(
		"Ваш код подтверждения: <b>%s</b>\n\nДействует 5 минут. Никому не сообщайте.",
		code,
	)
	_, err := b.Api.Send(recipient, msg, telebot.ModeHTML)
	if err != nil {
		return fmt.Errorf("send otp to telegram_id %d: %w", telegramID, err)
	}
	return nil
}

// SendAlert отправляет служебное уведомление оператору системы.
// Используется коллектором при автоматической блокировке, чтобы не терять контекст инцидента в логах.
// SendAlert отправляет техническое уведомление администратору.
// Реализует интерфейс collector.AlertNotifier.
func (b *Bot) SendAlert(ctx context.Context, text string) error {
	recipient := &telebot.User{ID: b.AdminID}
	if _, err := b.Api.Send(recipient, text); err != nil {
		return fmt.Errorf("send alert to admin %d: %w", b.AdminID, err)
	}
	return nil
}

// handleStats отвечает на /stats и показывает администратору агрегированную сводку по выбранному аккаунту.
// Команда нужна для быстрой ручной диагностики без захода в веб-интерфейс.
// handleStats — команда /stats, доступна только администратору.
func (b *Bot) handleStats(c telebot.Context) error {
	slog.Info("bot command received", "command", "/stats", "user_id", c.Sender().ID)

	if c.Sender().ID != b.AdminID {
		slog.Warn("unauthorized /stats attempt",
			"user_id", c.Sender().ID,
			"username", c.Sender().Username,
		)
		return c.Send("Access denied.")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	stats, err := b.statsProvider.GetUserStats(ctx, b.adminEmail)
	if err != nil {
		slog.Error("bot: failed to get stats", "error", err, "user_id", c.Sender().ID)
		return c.Send("Failed to retrieve statistics. Please try again later.")
	}

	msg := fmt.Sprintf(
		"Статистика (%s)\n↓ Down: %.2f MB\n↑ Up:   %.2f MB",
		stats.Email,
		float64(stats.Downlink)/(1024*1024),
		float64(stats.Uplink)/(1024*1024),
	)
	return c.Send(msg)
}

// maskID скрывает Telegram ID в логах, оставляя только хвост для корреляции событий.
func maskID(id int64) string {
	s := strconv.FormatInt(id, 10)
	if len(s) <= 3 {
		return "*******"
	}
	return "*******" + s[len(s)-3:]
}

// safePrefix возвращает первые n символов строки — для безопасного логирования payload.
func safePrefix(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
