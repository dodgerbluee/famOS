package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

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

		backendConn, resp, err := dialGo2rtc(client, frigateWS)
		if err != nil {
			status := 0
			if resp != nil {
				status = resp.StatusCode
			}
			log.Printf("stream: dial frigate ws failed for %s: %v (status=%d url=%s)", cameraName, err, status, frigateWS)
			clientConn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseInternalServerErr, dialFailureReason(status, err)))
			return
		}
		defer backendConn.Close()

		log.Printf("stream: connected to go2rtc for %s", cameraName)

		done := make(chan struct{})

		go func() {
			defer close(done)
			for {
				msgType, msg, err := backendConn.ReadMessage()
				if err != nil {
					log.Printf("stream: go2rtc read closed for %s: %v", cameraName, err)
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
		log.Printf("stream: session ended for %s", cameraName)
	}
}

// dialGo2rtc opens the go2rtc websocket, re-authenticating once if Frigate
// rejects the session cookie.
func dialGo2rtc(client *frigate.Client, wsURL string) (*websocket.Conn, *http.Response, error) {
	dialer := websocket.Dialer{
		Jar:              client.CookieJar(),
		HandshakeTimeout: 10 * time.Second,
	}
	header := http.Header{}
	header.Set("X-CSRF-TOKEN", "1")

	conn, resp, err := dialer.Dial(wsURL, header)
	if err == nil || resp == nil || resp.StatusCode != http.StatusUnauthorized {
		return conn, resp, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if loginErr := client.Login(ctx); loginErr != nil {
		return nil, resp, fmt.Errorf("re-login after 401: %w (dial: %w)", loginErr, err)
	}
	return dialer.Dial(wsURL, header)
}

// dialFailureReason explains a failed dial in the close frame so the reason is
// visible in the browser console, not only in server logs. Close reasons are
// limited to 123 bytes.
func dialFailureReason(status int, err error) string {
	msg := fmt.Sprintf("frigate dial failed: status=%d err=%v", status, err)
	if runes := []rune(msg); len(runes) > 120 {
		msg = string(runes[:120])
	}
	return msg
}
