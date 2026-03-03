package xray

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/xtls/xray-core/app/stats/command"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func GetStats() (string, error) {
	if os.Getenv("XRAY_API_ADDR") == "" {
		return "", fmt.Errorf("environment variable XRAY_API_ADDR is not set")
	}
	conn, err := grpc.NewClient(os.Getenv("XRAY_API_ADDR"), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return "", fmt.Errorf("failed to establish grpc connection: %w", err)
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
		return "", fmt.Errorf("failed to query statistics: %w", err)
	}
	if res == nil {
		return "", fmt.Errorf("received empty response from service")
	}

	metrics := make(map[string]int64)
	for _, stat := range res.Stat {
		metrics[stat.Name] = stat.Value
	}

	up := metrics["user>>>zd_pc>>>traffic>>>uplink"]
	down := metrics["user>>>zd_pc>>>traffic>>>downlink"]

	mbDwn := float64(down) / (1024 * 1024)
	mbUp := float64(up) / (1024 * 1024)

	out := fmt.Sprintf("User: zd_pc\n↑ Uplink: %.2f MB\n↓ Downlink: %.2f MB", mbUp, mbDwn)
	return out, nil
}
