package xray

import (
	"context"
	"fmt"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"github.com/xtls/xray-core/app/stats/command"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/credentials/insecure"
)

// Client — низкоуровневый gRPC клиент к Xray Stats API.
// Не логирует — только возвращает ошибки. Логирование на стороне вызывающего кода.
type Client struct {
	apiAddr string
	conn    *grpc.ClientConn
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

	return &Client{apiAddr: addr, conn: conn}, nil
}

// GetUserStats получает статистику трафика для конкретного пользователя по email.
// email — идентификатор пользователя в конфиге Xray (поле "email" в inbound).
func (c *Client) GetUserStats(ctx context.Context, email string) (models.UserStats, error) {
	if err := c.ensureConnected(); err != nil {
		return models.UserStats{}, err
	}

	client := command.NewStatsServiceClient(c.conn)

	// Xray Stats API: паттерн "user>>>EMAIL>>>traffic" возвращает uplink + downlink.
	req := &command.QueryStatsRequest{
		Pattern: fmt.Sprintf("user>>>%s>>>traffic", email),
		Reset_:  false,
	}

	// Создаём собственный таймаут поверх входящего ctx — gRPC вызов не должен висеть вечно.
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	res, err := client.QueryStats(queryCtx, req)
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

// Close закрывает gRPC соединение. Вызывать при graceful shutdown.
func (c *Client) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// ensureConnected проверяет соединение и переподключается если нужно.
// Выделено в отдельный метод чтобы не засорять GetUserStats.
func (c *Client) ensureConnected() error {
	if c.conn != nil && c.conn.GetState() != connectivity.Shutdown {
		return nil
	}

	conn, err := grpc.NewClient(c.apiAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("reconnect to xray api at %s: %w", c.apiAddr, err)
	}

	c.conn = conn
	return nil
}