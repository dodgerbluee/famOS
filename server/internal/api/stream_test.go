package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/sandershome/server/internal/frigate"
)

// fakeFrigate serves the two endpoints the stream proxy depends on: the login
// endpoint that issues the session cookie, and the go2rtc websocket that only
// accepts requests carrying the current session cookie. Each login rotates the
// cookie so tests can tell a fresh session from a stale one.
type fakeFrigate struct {
	mu     sync.Mutex
	token  string
	logins int
	srv    *httptest.Server
}

func newFakeFrigate(t *testing.T) *fakeFrigate {
	t.Helper()
	f := &fakeFrigate{}
	upgrader := websocket.Upgrader{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/login":
			f.mu.Lock()
			f.logins++
			f.token = fmt.Sprintf("session-%d", f.logins)
			token := f.token
			f.mu.Unlock()
			http.SetCookie(w, &http.Cookie{Name: "nginxaccess", Value: token, Path: "/"})
			w.WriteHeader(http.StatusOK)
		case "/api/go2rtc/api/ws":
			if !f.cookieIsValid(r) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			conn, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				return
			}
			defer conn.Close()
			conn.WriteMessage(websocket.BinaryMessage, []byte("fmp4-chunk"))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeFrigate) cookieIsValid(r *http.Request) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.token == "" {
		return false
	}
	for _, c := range r.Cookies() {
		if c.Name == "nginxaccess" && c.Value == f.token {
			return true
		}
	}
	return false
}

func (f *fakeFrigate) wsURL() string {
	return strings.Replace(f.srv.URL, "http://", "ws://", 1) + "/api/go2rtc/api/ws?src=boys"
}

func readChunk(t *testing.T, conn *websocket.Conn) {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	msgType, msg, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("no stream data received: %v", err)
	}
	if msgType != websocket.BinaryMessage || string(msg) != "fmp4-chunk" {
		t.Fatalf("got message type %d, body %q; want binary fmp4-chunk", msgType, msg)
	}
}

// End to end: browser websocket to the proxy, proxy websocket to go2rtc.
func TestStreamProxyRelaysGo2rtcData(t *testing.T) {
	frigateSrv := newFakeFrigate(t)
	client := frigate.NewClient(frigateSrv.srv.URL)
	client.Configure(frigateSrv.srv.URL, "admin", "password")

	router := chi.NewRouter()
	router.Get("/api/cameras/{name}/stream", StreamProxy(client))
	appSrv := httptest.NewServer(router)
	t.Cleanup(appSrv.Close)

	wsURL := "ws" + strings.TrimPrefix(appSrv.URL, "http") + "/api/cameras/boys/stream"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial stream endpoint: %v", err)
	}
	defer conn.Close()

	readChunk(t, conn)
}

// Frigate rejects the go2rtc websocket with 401 when its session cookie is
// missing or expired; the dial must re-authenticate and retry instead of
// failing the stream.
func TestDialGo2rtcReauthenticatesOn401(t *testing.T) {
	frigateSrv := newFakeFrigate(t)
	client := frigate.NewClient(frigateSrv.srv.URL)
	client.Configure(frigateSrv.srv.URL, "admin", "password")

	conn, resp, err := dialGo2rtc(client, frigateSrv.wsURL())
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("dial go2rtc: %v (status=%d)", err, status)
	}
	defer conn.Close()

	readChunk(t, conn)
}
