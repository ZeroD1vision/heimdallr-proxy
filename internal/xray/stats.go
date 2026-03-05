package xray

import (
	"context"
	"fmt"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"github.com/xtls/xray-core/app/stats/command"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type Client struct {
	apiAddr string
}

func NewClient(addr string) *Client {
	return &Client {
		apiAddr: addr,
	}
}

func (c *Client) GetStats(ctx context.Context) (models.UserStats, error) {
	if c.apiAddr == "" {
		return models.UserStats{}, fmt.Errorf("API address is not set")
	}
	conn, err := grpc.NewClient(c.apiAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return models.UserStats{}, fmt.Errorf("failed to establish grpc connection: %w", err)
	}

	defer conn.Close()

	client := command.NewStatsServiceClient(conn)
	req := &command.QueryStatsRequest{
		Pattern: "user>>>zd_pc>>>traffic",
		Reset_:  false,
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	res, err := client.QueryStats(ctx, req)
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

	up := uint64(metrics["user>>>zd_pc>>>traffic>>>uplink"])
	down := uint64(metrics["user>>>zd_pc>>>traffic>>>downlink"])

	return models.UserStats{
		Email:   "zd_pc",
		Uplink:  up,
		Downlink: down,
	}, nil
}
