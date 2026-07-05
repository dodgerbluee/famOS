package api

import (
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/sandershome/server/internal/frigate"
)

func StreamProxy(client *frigate.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cameraName := chi.URLParam(r, "name")

		base := client.BaseURL()
		if base == "" {
			http.Error(w, "frigate not configured", http.StatusBadGateway)
			return
		}

		if err := client.Login(r.Context()); err != nil {
			log.Printf("stream: login failed: %v", err)
		}

		frigateWS := strings.Replace(base, "https://", "wss://", 1)
		frigateWS = strings.Replace(frigateWS, "http://", "ws://", 1)
		frigateWS += "/api/go2rtc/api/ws?src=" + url.QueryEscape(cameraName)

		clientConn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("stream: upgrade failed: %v", err)
			return
		}
		defer clientConn.Close()

		jar := client.CookieJar()
		dialer := websocket.Dialer{Jar: jar}
		header := http.Header{}
		header.Set("X-CSRF-TOKEN", "1")

		backendConn, _, err := dialer.Dial(frigateWS, header)
		if err != nil {
			log.Printf("stream: dial frigate ws failed for %s: %v", cameraName, err)
			clientConn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "stream unavailable"))
			return
		}
		defer backendConn.Close()

		done := make(chan struct{})

		go func() {
			defer close(done)
			for {
				msgType, msg, err := backendConn.ReadMessage()
				if err != nil {
					return
				}
				if err := clientConn.WriteMessage(msgType, msg); err != nil {
					return
				}
			}
		}()

		go func() {
			for {
				msgType, msg, err := clientConn.ReadMessage()
				if err != nil {
					backendConn.Close()
					return
				}
				if err := backendConn.WriteMessage(msgType, msg); err != nil {
					return
				}
			}
		}()

		<-done
	}
}
