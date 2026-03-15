package xray

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"github.com/xtls/xray-core/app/stats/command"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/credentials/insecure"
)

type Client struct {
	apiAddr string
	conn    *grpc.ClientConn
}

func NewClient(addr string) *Client {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		fmt.Printf("✘ Failed to establish gRPC connection to Xray API at %s: %v\n", addr, err)
		// Не выходим, так как туннель может подняться позже или Xray быть временно оффлайн
		return &Client{
			apiAddr: addr,
			conn:    nil,
		}
	}

	return &Client{
		apiAddr: addr,
		conn:    conn,
	}
}

func (c *Client) GetStats(ctx context.Context) (models.UserStats, error) {
	if c.conn == nil || c.conn.GetState() == connectivity.Shutdown {
		slog.Info("gRPC connection is dead, reconnecting...")
		conn, err := grpc.NewClient(c.apiAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err != nil {
			slog.Error("Failed to establish gRPC connection to Xray API",
				"api_addr", c.apiAddr,
				"error", err,
			)
			return models.UserStats{}, fmt.Errorf("failed to establish gRPC connection to Xray API at %s: %w", c.apiAddr, err)
		}
		c.conn = conn
	}

	if c.apiAddr == "" {
		return models.UserStats{}, fmt.Errorf("API address is not set")
	}

	client := command.NewStatsServiceClient(c.conn)
	req := &command.QueryStatsRequest{
		Pattern: "user>>>zd_pc>>>traffic",
		Reset_:  false,
	}

	timeoutCtx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	res, err := client.QueryStats(timeoutCtx, req)
	if err != nil {
		return models.UserStats{}, fmt.Errorf("failed to query statistics: %w", err)
	}
	if res == nil {
		return models.UserStats{}, fmt.Errorf("received empty response from service")
	}

	metrics := make(map[string]int64)
	for _, stat := range res.Stat {
		metrics[stat.Name] = stat.Value
	}

	up := metrics["user>>>zd_pc>>>traffic>>>uplink"]
	down := metrics["user>>>zd_pc>>>traffic>>>downlink"]

	mbUp := float64(up) / (1024 * 1024)
	mbDown := float64(down) / (1024 * 1024)

	return models.UserStats{
		Email:    "zd_pc",
		Uplink:   mbUp,
		Downlink: mbDown,
	}, nil
}

func (c *Client) Close() error {
	if c.conn != nil {
		slog.Info("Closing grpc connection", "addr", c.apiAddr)
		return c.conn.Close()
	}
	return nil
}
