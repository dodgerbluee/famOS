package api

import (
	"encoding/binary"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// isHEIF reports whether buf starts with an HEIC/HEIF ftyp box.
// Android camera/gallery often labels these as image/jpeg or image.jpg;
// Go's DetectContentType does not recognize them, so they would otherwise
// be stored as .jpg and show as broken images in every browser that
// trusts Content-Type (including the kiosk).
func isHEIF(buf []byte) bool {
	if len(buf) < 12 || string(buf[4:8]) != "ftyp" {
		return false
	}
	boxSize := int(binary.BigEndian.Uint32(buf[0:4]))
	if boxSize < 16 {
		return false
	}
	if boxSize > len(buf) {
		boxSize = len(buf)
	}
	payload := buf[8:boxSize]
	if len(payload) >= 4 && string(payload[:4]) == "avif" {
		return false
	}
	heifBrands := map[string]bool{
		"heic": true, "heix": true, "hevc": true, "hevx": true,
		"heim": true, "heis": true, "hevm": true, "hevs": true,
		"mif1": true, "msf1": true, "heif": true,
	}
	for i := 0; i+4 <= len(payload); i += 4 {
		if heifBrands[string(payload[i:i+4])] {
			return true
		}
	}
	return false
}

type UploadsHandler struct {
	dir string
}

func NewUploadsHandler(dataDir string) *UploadsHandler {
	dir := filepath.Join(dataDir, "uploads")
	os.MkdirAll(dir, 0755)
	return &UploadsHandler{dir: dir}
}

func (h *UploadsHandler) Upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20) // 10MB

	file, header, err := r.FormFile("photo")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing photo field")
		return
	}
	defer file.Close()

	// Read first 512 bytes to detect content type
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	head := buf[:n]
	if isHEIF(head) {
		writeError(w, http.StatusBadRequest, "HEIC photos aren't supported — the app converts them to JPEG before upload")
		return
	}
	detected := http.DetectContentType(head)

	// Seek back to start
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to process file")
		return
	}

	// Determine extension from detected content type, fall back to filename extension
	ext := ""
	switch {
	case strings.HasPrefix(detected, "image/jpeg"):
		ext = ".jpg"
	case strings.HasPrefix(detected, "image/png"):
		ext = ".png"
	case strings.HasPrefix(detected, "image/webp"):
		ext = ".webp"
	case strings.HasPrefix(detected, "image/gif"):
		ext = ".gif"
	default:
		// Fall back to file extension
		ext = strings.ToLower(filepath.Ext(header.Filename))
	}

	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
	if !allowed[ext] {
		writeError(w, http.StatusBadRequest, "unsupported image format")
		return
	}

	filename := uuid.New().String() + ext
	dst, err := os.Create(filepath.Join(h.dir, filename))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to write file")
		return
	}

	url := fmt.Sprintf("/api/uploads/%s", filename)
	writeJSON(w, http.StatusCreated, map[string]string{"url": url})
}

func (h *UploadsHandler) Serve(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		http.NotFound(w, r)
		return
	}

	path := filepath.Join(h.dir, filename)
	http.ServeFile(w, r, path)
}
