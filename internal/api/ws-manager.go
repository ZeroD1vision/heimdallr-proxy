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
	pingWait       = pongWait * 9 / 10
	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// TODO: В production надо бует настроить строгую проверку Origin
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSManager struct {
	clients    map[int64]map[*WSClient]bool
	register   chan *WSClient
	unregister chan *WSClient
	notifier   chan models.Event
}

type WSClient struct {
	manager    *WSManager
	ownerID    int64
	conn       *websocket.Conn
	send	   chan []byte
	closeOnce  sync.Once
}

func NewWSManager() *WSManager {
	return &WSManager{
		clients:    make(map[int64]map[*WSClient]bool),
		notifier:   make(chan models.Event, 256),
		register:   make(chan *WSClient),
		unregister: make(chan *WSClient),
	}
}


func (m *WSManager) Notify(event models.Event) {
	if event.Timestamp == 0 {
		event.Timestamp = time.Now().Unix()
	}
	m.notifier <- event
}

func (m *WSManager) Run() {
	for {
		select {
		case client := <-m.register:
			if _, ok := m.clients[client.ownerID]; !ok {
				m.clients[client.ownerID] = make(map[*WSClient]bool)
			}
			m.clients[client.ownerID][client] = true

			slog.Info("ws client connected", 
    		    "owner_id", client.ownerID, 
    		    "total_active_clients", len(m.clients[client.ownerID]),
    		)

		case client := <-m.unregister:
			if _, ok := m.clients[client.ownerID]; ok {
				if _, ok := m.clients[client.ownerID][client]; ok {
					delete(m.clients[client.ownerID], client)
					client.Close()
					close(client.send)

					if len(m.clients[client.ownerID]) == 0 {
						delete(m.clients, client.ownerID)
					}
					slog.Info("ws client disconnected", 
        			    "owner_id", client.ownerID,
        			)
				}
			}

		case event := <-m.notifier:
			slog.Debug("ws manager received event", 
			    "event_owner", event.OwnerID, 
			    "registered_clients", len(m.clients[event.OwnerID]),
			)
			userClients, ok := m.clients[event.OwnerID]; 
			
			if !ok || len(userClients) == 0 {
				continue
			}

			payload, err := json.Marshal(event)
			if err != nil {
				slog.Error("failed to marshal ws event", "error", err, "type", event.Type)
				continue
			}

			for client := range userClients {
				select {
				case client.send <- payload:
				default:
					if _, exists := userClients[client]; exists {
    				    delete(userClients, client)
    				    close(client.send)
    				    client.Close()
    				    if len(userClients) == 0 {
    				        delete(m.clients, client.ownerID)
    				    }
    				}
				}
			}
		}
	}
}

func (c *WSClient) writeToSocket() {
	ticker := time.NewTicker(pingWait)
	defer func() {
		ticker.Stop()
		c.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))

			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				slog.Error("ws write error", "error", err, "owner_id", c.ownerID)
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				slog.Error("ws ping error", "error", err, "owner_id", c.ownerID)
				return
			}
		}
	}
}

func (c *WSClient) readFromSocket() {
	defer func() {
		c.manager.unregister <- c
		c.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Warn("ws unexpected close", "error", err, "owner_id", c.ownerID)
			}
			break
		}
	}
}

// Вспомогаетльные функции

// Закрывает соединение с клиентом и очищает ресурсы безопасно для многопоточности с использованием sync.Once.
func (c *WSClient) Close() {
	c.closeOnce.Do(func() {
		c.conn.Close()
	})
}