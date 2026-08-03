package models

type Event struct {
	OwnerID   int64  `json:"-"`
	Type      string `json:"type"`
	Timestamp int64  `json:"timestamp"`
	Payload   any    `json:"payload"`
}