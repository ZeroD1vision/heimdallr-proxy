// Package xray оборачивает gRPC API Xray-core в более узкий и безопасный клиентский слой.
// Здесь спрятаны детали reconnect-логики, таймаутов и форматирования запросов к stats/handler сервисам.
package xray

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	hsc "github.com/xtls/xray-core/app/proxyman/command" // hsc = Handler Service Command
	ssc "github.com/xtls/xray-core/app/stats/command"    // ssc = Stats Service Command
	"github.com/xtls/xray-core/common/protocol"
	"github.com/xtls/xray-core/common/serial"
	vless "github.com/xtls/xray-core/proxy/vless"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/credentials/insecure"
)

// Client — низкоуровневый gRPC клиент к Xray Stats API.
// Не логирует — только возвращает ошибки. Логирование на стороне вызывающего кода.
type Client struct {
	apiAddr       string
	conn          *grpc.ClientConn
	statsClient   ssc.StatsServiceClient
	handlerClient hsc.HandlerServiceClient
	mu            sync.Mutex
}

// NewClient создаёт клиент. При ошибке соединения не падает — Xray может
// подняться позже (например, туннель ещё не установлен). Ошибку первого
// соединения логирует вызывающий код через проверку после NewClient.
func NewClient(addr string) (*Client, error) {
	if addr == "" {
		return nil, fmt.Errorf("xray api address must not be empty")
	}

	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		// Возвращаем клиент без соединения — reconnect произойдёт при первом вызове.
		// Ошибку тоже возвращаем, чтобы main мог залогировать предупреждение.
		return &Client{apiAddr: addr, conn: nil}, fmt.Errorf("initial grpc dial %s: %w", addr, err)
	}

	return &Client{
		apiAddr:       addr,
		conn:          conn,
		statsClient:   ssc.NewStatsServiceClient(conn),
		handlerClient: hsc.NewHandlerServiceClient(conn),
	}, nil
}

// GetUserStats получает статистику трафика для конкретного пользователя по email.
// email — идентификатор пользователя в конфиге Xray (поле "email" в inbound).
func (c *Client) GetUserStats(ctx context.Context, email string) (models.UserStats, error) {
	if err := c.ensureConnected(); err != nil {
		return models.UserStats{}, err
	}

	// Xray Stats API: паттерн "user>>>EMAIL>>>traffic" возвращает uplink + downlink.
	req := &ssc.QueryStatsRequest{
		Pattern: fmt.Sprintf("user>>>%s>>>traffic", email),
		Reset_:  false,
	}

	// Создаём собственный таймаут поверх входящего ctx — gRPC вызов не должен висеть вечно.
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	res, err := c.statsClient.QueryStats(queryCtx, req)
	if err != nil {
		return models.UserStats{}, fmt.Errorf("query xray stats for %s: %w", email, err)
	}
	if res == nil {
		return models.UserStats{}, fmt.Errorf("empty response from xray stats api for %s", email)
	}

	// Раскладываем ответ в карту для удобного доступа по имени метрики.
	metrics := make(map[string]int64, len(res.Stat))
	for _, stat := range res.Stat {
		metrics[stat.Name] = stat.Value
	}

	// Xray возвращает байты — конвертируем в мегабайты для отображения.
	upBytes := metrics[fmt.Sprintf("user>>>%s>>>traffic>>>uplink", email)]
	downBytes := metrics[fmt.Sprintf("user>>>%s>>>traffic>>>downlink", email)]

	return models.UserStats{
		Email:    email,
		Uplink:   upBytes,
		Downlink: downBytes,
	}, nil
}

// AddUser добавляет пользователя в указанный inbound через HandlerService.
func (c *Client) AddUser(ctx context.Context, user models.User) error {
	if err := c.ensureConnected(); err != nil {
		return err
	}

	if user.Email == "" {
		return fmt.Errorf("email must not be empty")
	}
	if user.UUID == "" {
		return fmt.Errorf("uuid must not be empty")
	}
	if user.InboundTag == "" {
		return fmt.Errorf("inbound tag must not be empty")
	}

	// Поддерживаем оба поля модели: приоритет у VlessFlow,
	// fallback на Flow для обратной совместимости payload.
	flow := user.VlessFlow
	if flow == "" {
		flow = user.Flow
	}

	account := &vless.Account{
		Id:         user.UUID,
		Flow:       flow,
		Encryption: "none",
	}

	operation := serial.ToTypedMessage(&hsc.AddUserOperation{
		User: &protocol.User{
			Email:   user.Email,
			Level:   0,
			Account: serial.ToTypedMessage(account),
		},
	})

	callCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := c.handlerClient.AlterInbound(callCtx, &hsc.AlterInboundRequest{
		Tag:       user.InboundTag,
		Operation: operation,
	})
	if err != nil {
		return fmt.Errorf("xray add user %s on inbound %s: %w", user.Email, user.InboundTag, err)
	}

	slog.Info("XRAY_DEBUG", "email", user.Email, "uuid", user.UUID, "tag", user.InboundTag)
	return nil
}

// RemoveUser удаляет пользователя из указанного inbound по email.
func (c *Client) RemoveUser(ctx context.Context, inboundTag, email string) error {
	if err := c.ensureConnected(); err != nil {
		return err
	}
	if inboundTag == "" {
		return fmt.Errorf("inbound tag must not be empty")
	}
	if email == "" {
		return fmt.Errorf("email must not be empty")
	}

	callCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := c.handlerClient.AlterInbound(callCtx, &hsc.AlterInboundRequest{
		Tag: inboundTag,
		Operation: serial.ToTypedMessage(&hsc.RemoveUserOperation{
			Email: email,
		}),
	})
	if err != nil {
		return fmt.Errorf("xray remove user %s from inbound %s: %w", email, inboundTag, err)
	}

	return nil
}

// Close закрывает gRPC соединение. Вызывать при graceful shutdown.
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// ensureConnected проверяет соединение и переподключается если нужно.
// Выделено в отдельный метод чтобы не засорять GetUserStats.
func (c *Client) ensureConnected() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn != nil {
		state := c.conn.GetState()
		if state != connectivity.Shutdown {
			return nil
		}
		_ = c.conn.Close()
		c.conn = nil
	}

	baseDelay := 200 * time.Millisecond
	maxAttempts := 5

	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		conn, err := grpc.NewClient(c.apiAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err == nil {
			c.conn = conn
			c.statsClient = ssc.NewStatsServiceClient(conn)
			c.handlerClient = hsc.NewHandlerServiceClient(conn)
			return nil
		}
		lastErr = err

		delay := baseDelay << attempt
		if delay > 3*time.Second {
			delay = 3 * time.Second
		}
		time.Sleep(delay)
	}

	return fmt.Errorf("reconnect to xray api at %s failed after %d attempts: %w", c.apiAddr, maxAttempts, lastErr)
}
