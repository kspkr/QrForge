package api

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/kspkr/QrForge/server/auth"
	"github.com/kspkr/QrForge/server/config"
	"github.com/kspkr/QrForge/server/storage"
)

type userJSON struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	CreatedAt string `json:"created_at"`
}

func toUserJSON(u *storage.User) userJSON {
	return userJSON{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role, CreatedAt: ts(u.CreatedAt)}
}

func validEmail(email string) bool {
	if len(email) > 254 || strings.ContainsAny(email, " \t\r\n<>") {
		return false
	}
	a, err := mail.ParseAddress(email)
	if err != nil || a.Address != email {
		return false
	}
	_, domain, ok := strings.Cut(email, "@")
	return ok && strings.Contains(domain, ".") && !strings.HasSuffix(domain, ".")
}

func (s *Server) health(w http.ResponseWriter, r *http.Request, _ *principal) error {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.DB.PingContext(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "degraded", "version": config.Version, "database": "error"})
		return nil
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": config.Version, "database": "ok"})
	return nil
}

func (s *Server) publicConfig(w http.ResponseWriter, r *http.Request, _ *principal) error {
	users, err := s.DB.CountUsers(r.Context())
	if err != nil {
		return err
	}
	st := s.Settings.Get()
	writeJSON(w, http.StatusOK, map[string]any{
		"version":              config.Version,
		"base_url":             s.Cfg.BaseURLString(),
		"registration_enabled": st.RegistrationEnabled || users == 0,
		"setup_required":       users == 0,
		"features": map[string]bool{
			"analytics":            true,
			"custom_domains":       true,
			"password_reset_email": s.Mailer != nil,
		},
		"limits": map[string]int{"max_redirect_length": st.MaxRedirectLength},
	})
	return nil
}

func (s *Server) authLimited(r *http.Request) error {
	if ok, wait := s.authLimit.Allow(s.rateKey(r)); !ok {
		return rateLimited(wait)
	}
	return nil
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.Cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(s.Cfg.SessionTTL.Seconds()),
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: auth.SessionCookie, Value: "", Path: "/", HttpOnly: true,
		Secure: s.Cfg.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, u *storage.User, status int) error {
	sess, token, err := s.Auth.NewSession(r.Context(), u.ID)
	if err != nil {
		return err
	}
	s.setSessionCookie(w, token)
	writeJSON(w, status, map[string]any{"user": toUserJSON(u), "csrf_token": sess.CSRFToken})
	return nil
}

func (s *Server) register(w http.ResponseWriter, r *http.Request, _ *principal) error {
	if err := s.authLimited(r); err != nil {
		return err
	}
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	fields := map[string]string{}
	email := storage.NormalizeEmail(in.Email)
	if !validEmail(email) {
		fields["email"] = "must be a valid email address"
	}
	if msg := auth.ValidatePassword(in.Password); msg != "" {
		fields["password"] = msg
	}
	name := strings.TrimSpace(in.Name)
	if utf8.RuneCountInString(name) > 100 {
		fields["name"] = "must be at most 100 characters"
	}
	if len(fields) > 0 {
		return validation(fields)
	}

	users, err := s.DB.CountUsers(r.Context())
	if err != nil {
		return err
	}
	first := users == 0
	if !first && !s.Settings.Get().RegistrationEnabled {
		return errorf(http.StatusForbidden, "registration_closed", "Registration is closed on this server. Ask an administrator for an account.")
	}
	hash, err := s.Auth.HashPassword(in.Password)
	if err != nil {
		return err
	}
	u := &storage.User{Email: email, Name: name, PasswordHash: hash, Role: "user"}
	if first {
		u.Role = "admin"
	}
	if err := s.DB.CreateUser(r.Context(), u); err != nil {
		if errors.Is(err, storage.ErrConflict) {
			return errorf(http.StatusConflict, "conflict", "An account with this email already exists.")
		}
		return err
	}
	_ = s.DB.TouchLogin(r.Context(), u.ID)
	s.audit(r.Context(), &principal{User: u}, "auth.register", "user", u.ID, map[string]any{"first_user": first})
	return s.startSession(w, r, u, http.StatusCreated)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request, _ *principal) error {
	if err := s.authLimited(r); err != nil {
		return err
	}
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	email := storage.NormalizeEmail(in.Email)
	if email == "" || in.Password == "" || len(in.Password) > auth.MaxPasswordLength {
		return errorf(http.StatusUnauthorized, "invalid_credentials", "Invalid email or password.")
	}
	if ok, wait := s.emailLimit.Allow(email); !ok {
		return rateLimited(wait)
	}
	u, err := s.Auth.Authenticate(r.Context(), email, in.Password)
	switch {
	case errors.Is(err, auth.ErrInvalidCredentials):
		s.audit(r.Context(), nil, "auth.login_failed", "user", "", map[string]any{"email": email})
		return errorf(http.StatusUnauthorized, "invalid_credentials", "Invalid email or password.")
	case errors.Is(err, auth.ErrDisabled):
		return errorf(http.StatusForbidden, "account_disabled", "This account has been disabled.")
	case err != nil:
		return err
	}
	_ = s.DB.TouchLogin(r.Context(), u.ID)
	s.audit(r.Context(), &principal{User: u}, "auth.login", "user", u.ID, nil)
	return s.startSession(w, r, u, http.StatusOK)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request, p *principal) error {
	if p != nil && p.Session != nil {
		if err := s.DB.DeleteSession(r.Context(), p.Session.ID); err != nil {
			return err
		}
		s.audit(r.Context(), p, "auth.logout", "user", p.User.ID, nil)
	}
	s.clearSessionCookie(w)
	noContent(w)
	return nil
}

func (s *Server) me(w http.ResponseWriter, r *http.Request, p *principal) error {
	var csrf any
	if p.Session != nil {
		csrf = p.Session.CSRFToken
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": toUserJSON(p.User), "csrf_token": csrf})
	return nil
}

func (s *Server) updateMe(w http.ResponseWriter, r *http.Request, p *principal) error {
	var in struct {
		Name            *string `json:"name"`
		Email           *string `json:"email"`
		CurrentPassword string  `json:"current_password"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	u := p.User
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if utf8.RuneCountInString(name) > 100 {
			return fieldError("name", "must be at most 100 characters")
		}
		u.Name = name
	}
	if in.Email != nil {
		email := storage.NormalizeEmail(*in.Email)
		if !validEmail(email) {
			return fieldError("email", "must be a valid email address")
		}
		// Changing the sign-in email is a takeover vector (it redirects password
		// resets), so it requires the current password, not just a session.
		if email != u.Email {
			if err := s.authLimited(r); err != nil {
				return err
			}
			if !auth.CheckPassword(u.PasswordHash, in.CurrentPassword) {
				return fieldError("current_password", "is required to change your email")
			}
		}
		u.Email = email
	}
	if err := s.DB.UpdateUser(r.Context(), u); err != nil {
		if errors.Is(err, storage.ErrConflict) {
			return errorf(http.StatusConflict, "conflict", "An account with this email already exists.")
		}
		return err
	}
	s.audit(r.Context(), p, "auth.profile_update", "user", u.ID, nil)
	writeJSON(w, http.StatusOK, map[string]any{"user": toUserJSON(u)})
	return nil
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request, p *principal) error {
	if err := s.authLimited(r); err != nil {
		return err
	}
	var in struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	if !auth.CheckPassword(p.User.PasswordHash, in.Current) {
		return fieldError("current_password", "is incorrect")
	}
	if msg := auth.ValidatePassword(in.New); msg != "" {
		return fieldError("new_password", msg)
	}
	hash, err := s.Auth.HashPassword(in.New)
	if err != nil {
		return err
	}
	p.User.PasswordHash = hash
	if err := s.DB.UpdateUser(r.Context(), p.User); err != nil {
		return err
	}
	if err := s.DB.DeleteUserSessions(r.Context(), p.User.ID, p.Session.ID); err != nil {
		return err
	}
	s.audit(r.Context(), p, "auth.password_change", "user", p.User.ID, nil)
	noContent(w)
	return nil
}

func (s *Server) forgotPassword(w http.ResponseWriter, r *http.Request, _ *principal) error {
	if err := s.authLimited(r); err != nil {
		return err
	}
	var in struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	email := storage.NormalizeEmail(in.Email)
	accepted := func() error {
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
		return nil
	}
	if !validEmail(email) {
		return accepted()
	}
	if ok, _ := s.emailLimit.Allow("reset:" + email); !ok {
		return accepted()
	}
	u, err := s.DB.GetUserByEmail(r.Context(), email)
	if errors.Is(err, storage.ErrNotFound) || (err == nil && u.Disabled) {
		return accepted() // Never reveal whether an account exists.
	}
	if err != nil {
		return err
	}
	token, err := s.Auth.NewPasswordReset(r.Context(), u.ID)
	if err != nil {
		return err
	}
	link := s.Cfg.BaseURLString() + "/reset-password?token=" + url.QueryEscape(token)
	s.audit(r.Context(), &principal{User: u}, "auth.password_reset_request", "user", u.ID, nil)
	if s.Mailer != nil {
		body := "Someone requested a password reset for your QRForge account.\n\n" +
			"Reset your password (valid for 1 hour):\n" + link + "\n\n" +
			"If you did not request this, you can ignore this email.\n"
		go func() {
			if err := s.Mailer.Send(u.Email, "Reset your QRForge password", body); err != nil {
				s.Log.Error("failed to send password reset email", "err", err)
			}
		}()
	} else {
		// Documented behaviour for self-hosters without SMTP.
		s.Log.Warn("password reset requested (SMTP not configured; deliver this link manually)", "email", u.Email, "link", link)
	}
	return accepted()
}

func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request, _ *principal) error {
	if err := s.authLimited(r); err != nil {
		return err
	}
	var in struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &in); err != nil {
		return err
	}
	if msg := auth.ValidatePassword(in.Password); msg != "" {
		return fieldError("password", msg)
	}
	u, err := s.Auth.ResetPassword(r.Context(), in.Token, in.Password)
	if errors.Is(err, storage.ErrNotFound) {
		return fieldError("token", "is invalid or has expired")
	}
	if err != nil {
		return err
	}
	s.audit(r.Context(), &principal{User: u}, "auth.password_reset", "user", u.ID, nil)
	noContent(w)
	return nil
}
