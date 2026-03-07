package models

import "context"

type StatsProvider interface {
	GetStats(ctx context.Context) (UserStats, error)
}

type UserStats struct {
	Email    string  `json:"email"`
	Downlink float64 `json:"downlink"`
	Uplink   float64 `json:"uplink"`
}
