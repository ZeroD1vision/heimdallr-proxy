package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 30 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// TODO: В production надо бует настроить строгую проверку Origin
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSManager struct {
	clients    map[int64]map[*Client]bool
	register   chan *Client
	unregister chan *Client
	notifier   chan models.WSEvent
}

type Client struct {
	manager    *WSManager
	ownerID    int64
	conn       *websocket.Conn
	send	   chan []byte
	closeOnce  sync.Once
}

func NewWSManager() *WSManager {
	return &WSManager{
		clients:    make(map[int64]map[*Client]bool),
		notifier:   make(chan models.WSEvent, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (m *WSManager) Notify(event models.WSEvent) {
	m.notifier <- event
}

func (m *WSManager) Run() {
	for {
		select {
		case client := <-m.register:
			if _, ok := m.clients[client.ownerID]; !ok {
				m.clients[client.ownerID] = make(map[*Client]bool)
			}
			m.clients[client.ownerID][client] = true

		case client := <-m.unregister:
			if _, ok := m.clients[client.ownerID]; ok {
				if _, ok := m.clients[client.ownerID][client]; ok {
					delete(m.clients[client.ownerID], client)
					client.Close()

					if len(m.clients[client.ownerID]) == 0 {
						delete(m.clients, client.ownerID)
					}
				}
			}

		case event := <-m.notifier:
			userClients, ok := m.clients[event.OwnerID]; 
			
			if !ok || len(userClients) == 0 {
				continue
			}

			payload, err := json.Marshal(event)
			if err != nil {
				slog.Error("Failed to marshal event", "error", err)
				continue
			}

			for client := range userClients {
				select {
				case client.send <- payload:
				default:
					delete(userClients, client)
					client.Close()
				}
			}
		}
	}
}

// Вспомогаетльные функции
func (c *Client) Close() {
	c.closeOnce.Do(func() {
		close(c.send)
		c.conn.Close()
	})
}