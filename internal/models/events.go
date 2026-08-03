package models

type WSEvent struct {
	OwnerID   int64  `json:"-"`
	Type      string `json:"type"`
	Timestamp int64  `json:"timestamp"`
	Payload   []byte `json:"payload"`
}

type EventNotifier interface {
	Notify(event WSEvent)
}