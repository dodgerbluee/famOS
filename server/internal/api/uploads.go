package api

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

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

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" && ext != ".heic" {
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
