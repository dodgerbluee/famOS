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

// fakeFrigate serves the endpoints the stream proxy depends on: the login
// endpoint that issues the session cookie, and the go2rtc websockets that only
// accept requests carrying the current session cookie. Each login rotates the
// cookie so tests can tell a fresh session from a stale one. newPathStatus and
// legacyPathStatus simulate Frigate releases that only serve one of the two
// websocket paths; 0 means the path is served.
type fakeFrigate struct {
	mu               sync.Mutex
	token            string
	logins           int
	newPathStatus    int
	legacyPathStatus int
	upgrader         websocket.Upgrader
	srv              *httptest.Server
}

func newFakeFrigate(t *testing.T) *fakeFrigate {
	t.Helper()
	f := &fakeFrigate{}
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
		case "/live/mse/api/ws":
			f.serveWS(w, r, f.newPathStatus)
		case "/api/go2rtc/api/ws":
			f.serveWS(w, r, f.legacyPathStatus)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeFrigate) serveWS(w http.ResponseWriter, r *http.Request, denyStatus int) {
	if denyStatus != 0 {
		http.Error(w, "denied", denyStatus)
		return
	}
	if !f.cookieIsValid(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := f.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.WriteMessage(websocket.BinaryMessage, []byte("fmp4-chunk"))
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

func (f *fakeFrigate) wsBase() string {
	return strings.Replace(f.srv.URL, "http://", "ws://", 1)
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

// openStream runs the full proxy path: browser websocket in, go2rtc websocket out.
func openStream(t *testing.T, client *frigate.Client) {
	t.Helper()
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

func TestStreamProxyRelaysGo2rtcData(t *testing.T) {
	frigateSrv := newFakeFrigate(t)
	client := frigate.NewClient(frigateSrv.srv.URL)
	client.Configure(frigateSrv.srv.URL, "admin", "password")

	openStream(t, client)
}

// Frigate >= 0.17 restricts the legacy /api/go2rtc proxy (403 for normal
// sessions); the proxy must use /live/mse/api/ws instead.
func TestStreamProxyUsesNewLiveMSEPathWhenLegacyIsRestricted(t *testing.T) {
	frigateSrv := newFakeFrigate(t)
	frigateSrv.legacyPathStatus = http.StatusForbidden
	client := frigate.NewClient(frigateSrv.srv.URL)
	client.Configure(frigateSrv.srv.URL, "admin", "password")

	openStream(t, client)
}

// Older Frigate releases have no /live/mse/api/ws; the proxy must fall back to
// the legacy go2rtc path.
func TestStreamProxyFallsBackToLegacyGo2rtcPath(t *testing.T) {
	frigateSrv := newFakeFrigate(t)
	frigateSrv.newPathStatus = http.StatusNotFound
	client := frigate.NewClient(frigateSrv.srv.URL)
	client.Configure(frigateSrv.srv.URL, "admin", "password")

	openStream(t, client)
}

// Frigate rejects the go2rtc websocket with 401 when its session cookie is
// missing or expired; the dial must re-authenticate and retry instead of
// failing the stream.
func TestDialGo2rtcReauthenticatesOn401(t *testing.T) {
	frigateSrv := newFakeFrigate(t)
	client := frigate.NewClient(frigateSrv.srv.URL)
	client.Configure(frigateSrv.srv.URL, "admin", "password")

	conn, resp, err := dialGo2rtc(client, frigateSrv.wsBase(), "boys")
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
