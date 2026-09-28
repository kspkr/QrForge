// Package web serves the built single-page application (apps/web/dist).
package web

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Handler serves static files from dir, falling back to index.html for
// client-side routes. Hashed assets under /assets/ are cached forever;
// index.html is always revalidated so deployments take effect immediately.
func Handler(dir string) http.Handler {
	root := http.Dir(dir)
	index := filepath.Join(dir, "index.html")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		clean := path.Clean("/" + r.URL.Path)
		if clean != "/" {
			if f, err := root.Open(clean); err == nil {
				st, statErr := f.Stat()
				f.Close()
				if statErr == nil && !st.IsDir() {
					if strings.HasPrefix(clean, "/assets/") {
						w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
					} else {
						w.Header().Set("Cache-Control", "public, max-age=3600")
					}
					http.ServeFile(w, r, filepath.Join(dir, filepath.FromSlash(clean)))
					return
				}
			}
			// Unknown file-like paths (with an extension) are real 404s, not SPA routes.
			if path.Ext(clean) != "" {
				http.NotFound(w, r)
				return
			}
		}
		if _, err := os.Stat(index); err != nil {
			http.Error(w, "web UI not built: run `npm run build` in apps/web", http.StatusNotFound)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, index)
	})
}

// Placeholder is used when no web directory is configured.
func Placeholder() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("QRForge API is running.\n\nAPI:     /api/v1/health\nOpenAPI: /api/v1/openapi.yaml\n\n" +
			"The web UI is not served by this process. Run it with `npm run dev` (apps/web),\n" +
			"or set QRFORGE_WEB_DIR to the built apps/web/dist directory.\n"))
	})
}
