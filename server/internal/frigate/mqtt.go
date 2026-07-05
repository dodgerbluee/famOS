package frigate

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type MQTTEvent struct {
	Type   string      `json:"type"`
	Before *EventState `json:"before"`
	After  *EventState `json:"after"`
}

type EventState struct {
	ID           string   `json:"id"`
	Camera       string   `json:"camera"`
	Label        string   `json:"label"`
	TopScore     float64  `json:"top_score"`
	StartTime    float64  `json:"start_time"`
	EndTime      float64  `json:"end_time"`
	CurrentZones []string `json:"current_zones"`
}

type MotionAlert struct {
	EventID   string  `json:"eventId"`
	Camera    string  `json:"camera"`
	Label     string  `json:"label"`
	Score     float64 `json:"score"`
	Timestamp string  `json:"timestamp"`
	Type      string  `json:"type"`
}

type AlertHandler func(alert MotionAlert)

type MQTTConfig struct {
	Host      string
	Port      int
	Username  string
	Password  string
	ClientID  string
	BaseTopic string
}

type MQTTSubscriber struct {
	config  MQTTConfig
	client  mqtt.Client
	handler AlertHandler
}

func NewMQTTSubscriber(config MQTTConfig, handler AlertHandler) *MQTTSubscriber {
	return &MQTTSubscriber{
		config:  config,
		handler: handler,
	}
}

func (s *MQTTSubscriber) Start() {
	topic := fmt.Sprintf("%s/events", s.config.BaseTopic)
	opts := mqtt.NewClientOptions().
		AddBroker(fmt.Sprintf("tcp://%s:%d", s.config.Host, s.config.Port)).
		SetClientID(s.config.ClientID).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(10 * time.Second).
		SetOnConnectHandler(func(c mqtt.Client) {
			log.Printf("MQTT connected, subscribing to %s", topic)
			c.Subscribe(topic, 0, s.handleMessage)
		}).
		SetConnectionLostHandler(func(c mqtt.Client, err error) {
			log.Printf("MQTT connection lost: %v", err)
		})

	if s.config.Username != "" {
		opts.SetUsername(s.config.Username)
		opts.SetPassword(s.config.Password)
	}

	s.client = mqtt.NewClient(opts)

	go func() {
		for {
			token := s.client.Connect()
			token.Wait()
			if token.Error() != nil {
				log.Printf("MQTT connect failed: %v, retrying in 10s", token.Error())
				time.Sleep(10 * time.Second)
				continue
			}
			return
		}
	}()
}

func (s *MQTTSubscriber) Stop() {
	if s.client != nil && s.client.IsConnected() {
		s.client.Disconnect(1000)
	}
}

func (s *MQTTSubscriber) handleMessage(_ mqtt.Client, msg mqtt.Message) {
	var event MQTTEvent
	if err := json.Unmarshal(msg.Payload(), &event); err != nil {
		log.Printf("failed to parse MQTT event: %v", err)
		return
	}

	if event.Type != "new" || event.After == nil {
		return
	}

	state := event.After
	if state.Label == "" || state.TopScore < 0.5 {
		return
	}

	alert := MotionAlert{
		EventID:   state.ID,
		Camera:    state.Camera,
		Label:     state.Label,
		Score:     state.TopScore,
		Timestamp: time.Now().Format(time.RFC3339),
		Type:      "motion",
	}

	s.handler(alert)
}
