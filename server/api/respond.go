package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Error is a structured API error rendered as
// {"error": {"code": ..., "message": ..., "fields": {...}}}.
type Error struct {
	Status  int               `json:"-"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
	retry   time.Duration
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func errorf(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

func validation(fields map[string]string) *Error {
	msg := "The request contains invalid fields."
	if len(fields) == 1 {
		for k, v := range fields {
			msg = k + " " + v
		}
	}
	return &Error{Status: http.StatusUnprocessableEntity, Code: "validation_failed", Message: msg, Fields: fields}
}

func fieldError(field, message string) *Error {
	return validation(map[string]string{field: message})
}

var (
	errUnauthorized = errorf(http.StatusUnauthorized, "unauthorized", "Authentication required.")
	errForbidden    = errorf(http.StatusForbidden, "forbidden", "You do not have access to this resource.")
	errNotFound     = errorf(http.StatusNotFound, "not_found", "Resource not found.")
	errCSRF         = errorf(http.StatusForbidden, "csrf_failed", "Missing or invalid CSRF token.")
	errInternal     = errorf(http.StatusInternalServerError, "internal", "An internal error occurred.")
)

func rateLimited(wait time.Duration) *Error {
	return &Error{Status: http.StatusTooManyRequests, Code: "rate_limited", Message: "Too many requests. Please slow down.", retry: wait}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(true)
	_ = enc.Encode(v)
}

func writeError(w http.ResponseWriter, e *Error) {
	if e.retry > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(int(e.retry.Seconds())+1))
	}
	writeJSON(w, e.Status, map[string]any{"error": e})
}

func noContent(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

// decodeJSON reads a JSON body into v, mapping size and syntax errors.
func decodeJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		var maxErr *http.MaxBytesError
		switch {
		case errors.As(err, &maxErr):
			return errorf(http.StatusRequestEntityTooLarge, "payload_too_large", "Request body is too large.")
		case errors.Is(err, io.EOF):
			return errorf(http.StatusBadRequest, "invalid_json", "Request body must be a JSON object.")
		default:
			var typeErr *json.UnmarshalTypeError
			if errors.As(err, &typeErr) && typeErr.Field != "" {
				return fieldError(typeErr.Field, "has the wrong type")
			}
			return errorf(http.StatusBadRequest, "invalid_json", "Request body is not valid JSON.")
		}
	}
	// Reject trailing garbage, and drain the rest to detect oversize bodies.
	if _, err := io.Copy(io.Discard, r.Body); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return errorf(http.StatusRequestEntityTooLarge, "payload_too_large", "Request body is too large.")
		}
	}
	return nil
}

// decodeObject reads a JSON object as raw fields (for PATCH semantics
// where absent and null differ).
func decodeObject(r *http.Request) (map[string]json.RawMessage, error) {
	var m map[string]json.RawMessage
	if err := decodeJSON(r, &m); err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errorf(http.StatusBadRequest, "invalid_json", "Request body must be a JSON object.")
	}
	return m, nil
}

func isNull(raw json.RawMessage) bool {
	return strings.TrimSpace(string(raw)) == "null"
}

// Pagination parameters.
type page struct {
	Page    int
	PerPage int
}

func (p page) offset() int { return (p.Page - 1) * p.PerPage }

func parsePage(r *http.Request) page {
	p := page{Page: 1, PerPage: 20}
	if v, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && v > 0 && v < 1_000_000 {
		p.Page = v
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("per_page")); err == nil && v > 0 {
		p.PerPage = min(v, 100)
	}
	return p
}

func paginated(data any, p page, total int64) map[string]any {
	return map[string]any{
		"data":       data,
		"pagination": map[string]any{"page": p.Page, "per_page": p.PerPage, "total": total},
	}
}

func ts(unix int64) string { return time.Unix(unix, 0).UTC().Format(time.RFC3339) }

func tsPtr(unix *int64) *string {
	if unix == nil {
		return nil
	}
	s := ts(*unix)
	return &s
}
