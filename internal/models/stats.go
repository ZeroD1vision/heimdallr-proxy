package models

import "context"

type StatsProvider interface {
	GetStats(ctx context.Context) (string, error)
}

type UserStats struct {
	Email string `json:"email"`
	Downlink uint64 `json:"downlink"`
	Uplink uint64 `json:"uplink"`
}