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
  conn *grpc.ClientConn
}

func NewClient(addr string) *Client {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
  if err != nil {
    fmt.Printf("✘ Failed to establish gRPC connection to Xray API at %s: %v\n", addr, err)
    // Не выходим, так как туннель может подняться позже или Xray быть временно оффлайн
    return &Client{
      apiAddr: addr,
      conn: nil,
    }
  }

  return &Client {
		apiAddr: addr,
    conn: conn,
	}
}

func (c *Client) GetStats(ctx context.Context) (models.UserStats, error) {
  if c.conn == nil {
    conn, err := grpc.NewClient(c.apiAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil {
      return models.UserStats{}, fmt.Errorf("failed to establish gRPC connection to Xray API at %s: %w", c.apiAddr, err)
    }
    c.conn = conn
  }

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

	up := metrics["user>>>zd_pc>>>traffic>>>uplink"]
	down := metrics["user>>>zd_pc>>>traffic>>>downlink"]

  mbUp := float64(up) / (1024 * 1024)
  mbDown := float64(down) / (1024 * 1024)

	return models.UserStats{
		Email:   "zd_pc",
		Uplink:   mbUp,
		Downlink: mbDown,
	}, nil
}
