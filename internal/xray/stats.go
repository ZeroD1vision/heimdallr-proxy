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
	conn, err := grpc.Dial(fmt.Sprintf("127.0.0.1:%s", os.Getenv("XRAY_STATS_PORT")), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return "", fmt.Errorf("failed to connect to Xray stats: %w", err)
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
		return "", fmt.Errorf("error getting stats: %w", err)
	}
	if res == nil {
		return "", fmt.Errorf("received nil response from Xray stats")
	}

	metrics := make(map[string]int64)
	for _, stat := range res.Stat {
		metrics[stat.Name] = stat.Value
	}

	up := metrics["user>>>zd_pc>>>traffic>>>uplink"]
	down := metrics["user>>>zd_pc>>>traffic>>>downlink"]

	mbDwn := float64(down) / (1024 * 1024)
	mbUp := float64(up) / (1024 * 1024)

	out := fmt.Sprintf("Uplink: %.2f MB, Downlink: %.2f MB\n", mbUp, mbDwn)
	return out, nil
}
