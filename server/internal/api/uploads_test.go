package api

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// Minimal ISO-BMFF HEIC header (ftyp heic). Android gallery/camera often
// sends this payload with filename image.jpg and type image/jpeg.
var heicNamedJPEG = []byte{
	0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p',
	'h', 'e', 'i', 'c', 0x00, 0x00, 0x00, 0x00,
	'm', 'i', 'f', '1', 'h', 'e', 'i', 'c',
}

// 1×1 JPEG so we can confirm real JPEGs still upload.
var onePixelJPEG = []byte{
	0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01,
	0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
	0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
	0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
	0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
	0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
	0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
	0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
	0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x03, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
	0x37, 0xff, 0xd9,
}

func setupUploads(t *testing.T) http.Handler {
	t.Helper()
	h := NewUploadsHandler(t.TempDir())
	r := chi.NewRouter()
	r.Post("/api/uploads", h.Upload)
	r.Get("/api/uploads/{filename}", h.Serve)
	return r
}

func postPhoto(t *testing.T, handler http.Handler, filename string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("photo", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fw.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "/api/uploads", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestUploadJPEG_ServesDecodableImage(t *testing.T) {
	handler := setupUploads(t)
	w := postPhoto(t, handler, "photo.jpg", onePixelJPEG)
	if w.Code != http.StatusCreated {
		t.Fatalf("upload status %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	url := resp["url"]
	if !strings.HasSuffix(url, ".jpg") && !strings.HasSuffix(url, ".jpeg") {
		t.Fatalf("expected jpeg url, got %s", url)
	}

	get := httptest.NewRequest("GET", url, nil)
	out := httptest.NewRecorder()
	handler.ServeHTTP(out, get)
	if out.Code != http.StatusOK {
		t.Fatalf("serve status %d", out.Code)
	}
	served, _ := io.ReadAll(out.Result().Body)
	if len(served) < 2 || served[0] != 0xff || served[1] != 0xd8 {
		t.Fatalf("served file is not JPEG magic")
	}
	ct := out.Result().Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "image/jpeg") {
		t.Fatalf("Content-Type = %q, want image/jpeg", ct)
	}
}

func TestUploadHEICNamedJPEG_DoesNotServeBrokenImage(t *testing.T) {
	handler := setupUploads(t)
	w := postPhoto(t, handler, "image.jpg", heicNamedJPEG)

	// Either reject HEIC, or convert it to a real JPEG. Never store HEIC
	// bytes under a .jpg URL — browsers treat Content-Type image/jpeg as
	// a JPEG and show a broken-image icon (Android preview via blob URL
	// still works, which is why this looks fine until save).
	if w.Code == http.StatusCreated {
		var resp map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		url := resp["url"]
		get := httptest.NewRequest("GET", url, nil)
		out := httptest.NewRecorder()
		handler.ServeHTTP(out, get)
		served, _ := io.ReadAll(out.Result().Body)
		ct := out.Result().Header.Get("Content-Type")
		looksJPEG := len(served) >= 2 && served[0] == 0xff && served[1] == 0xd8
		looksPNG := len(served) >= 8 && string(served[:8]) == "\x89PNG\r\n\x1a\n"
		looksWebP := len(served) >= 12 && string(served[8:12]) == "WEBP"
		if strings.HasPrefix(ct, "image/") && !looksJPEG && !looksPNG && !looksWebP {
			t.Fatalf("served %s as %s but payload is not a browser-decodable raster (first bytes %x) — this is the Android broken-image bug", url, ct, served[:min(16, len(served))])
		}
		return
	}
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 reject or converted 201, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUploadHEICExtension_Rejected(t *testing.T) {
	handler := setupUploads(t)
	w := postPhoto(t, handler, "IMG_0001.HEIC", heicNamedJPEG)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}
