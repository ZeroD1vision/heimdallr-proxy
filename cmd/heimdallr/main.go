package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/xtls/xray-core/app/stats/command"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	log.Println("heimdallr-proxy is running...")
	err := godotenv.Load()
	if err != nil {
		val := os.Getenv("APP_ENV")
		log.Printf("APP_ENV in system: [%s]", val)
		log.Printf("Error: %v", err)
	}

	// Тут в будущем мы запустим:
	// 1. Подключение к БД
	// 2. gRPC клиент к Xray
	// 3. Telegram бот
	// 4. API сервер для Vue

	conn, err := grpc.NewClient(fmt.Sprintf("127.0.0.1:%s", os.Getenv("SERVER_TUNNEL_PORT")), grpc.WithTransportCredentials(insecure.NewCredentials()))

	if err != nil {
		log.Fatalf("Failed to connect to Xray gRPC API: %v", err)
	}

	defer conn.Close()

	client := command.NewStatsServiceClient(conn)

	req := &command.GetStatsRequest{
		Name:   "user>>>zd_pc>>>traffic>>>downlink",
		Reset_: false,
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	fmt.Println("Requesting stats from Xray gRPC API...")
	res, err := client.GetStats(ctx, req)

	if err != nil {
		log.Fatalf("✘ Error getting stats: %v", err)
	}

	mb := float64(res.Stat.Value) / 1024 / 1024
	fmt.Printf("✔ Success!\nUser: zd_pc\nTraffic (downlink): %.2f MB (%d bytes)\n", mb, res.Stat.Value)
}
