package auth

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/kspkr/QrForge/server/config"
)

// Mailer sends transactional email through any standard SMTP server
// (a self-hosted Postfix, Mailpit, or an existing mailbox). Optional.
type Mailer struct {
	cfg config.SMTP
}

// NewMailer returns nil when SMTP is not configured.
func NewMailer(cfg config.SMTP) *Mailer {
	if !cfg.Enabled() {
		return nil
	}
	return &Mailer{cfg: cfg}
}

func sanitizeHeader(v string) string {
	return strings.NewReplacer("\r", "", "\n", "").Replace(v)
}

// Send delivers a plain-text email.
func (m *Mailer) Send(to, subject, body string) error {
	addr := net.JoinHostPort(m.cfg.Host, strconv.Itoa(m.cfg.Port))
	msg := strings.Join([]string{
		"From: " + sanitizeHeader(m.cfg.From),
		"To: " + sanitizeHeader(to),
		"Subject: " + sanitizeHeader(subject),
		"Date: " + time.Now().UTC().Format(time.RFC1123Z),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		body,
	}, "\r\n")
	var auth smtp.Auth
	if m.cfg.Username != "" {
		auth = smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
	}
	if m.cfg.Port != 465 {
		// smtp.SendMail upgrades with STARTTLS when the server supports it.
		return smtp.SendMail(addr, auth, m.cfg.From, []string{to}, []byte(msg))
	}
	// Implicit TLS (SMTPS).
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 15 * time.Second}, "tcp", addr, &tls.Config{ServerName: m.cfg.Host, MinVersion: tls.VersionTLS12})
	if err != nil {
		return err
	}
	c, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		return err
	}
	defer c.Close()
	if auth != nil {
		if err := c.Auth(auth); err != nil {
			return err
		}
	}
	if err := c.Mail(m.cfg.From); err != nil {
		return err
	}
	if err := c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := fmt.Fprint(w, msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}
