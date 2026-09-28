-- QRForge initial schema. Portable across SQLite and PostgreSQL:
-- TEXT ids, BIGINT unix-second timestamps, BOOLEAN flags.

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    disabled BOOLEAN NOT NULL DEFAULT FALSE,
    max_qrcodes BIGINT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    last_login_at BIGINT NULL
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    csrf_token TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at BIGINT NULL
);
CREATE INDEX idx_password_resets_expires ON password_resets(expires_at);

CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    last_used_at BIGINT NULL,
    usage_count BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

CREATE TABLE campaigns (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX idx_campaigns_user ON campaigns(user_id, created_at);

CREATE TABLE domains (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hostname TEXT NOT NULL UNIQUE,
    verification_token TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at BIGINT NULL,
    created_at BIGINT NOT NULL
);
CREATE INDEX idx_domains_user ON domains(user_id);

CREATE TABLE qrcodes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    qr_type TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    destination TEXT NULL,
    slug TEXT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    disabled_reason TEXT NULL,
    admin_locked BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at BIGINT NULL,
    password_hash TEXT NULL,
    utm TEXT NULL,
    analytics_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    campaign_id TEXT NULL REFERENCES campaigns(id) ON DELETE SET NULL,
    domain_id TEXT NULL REFERENCES domains(id) ON DELETE SET NULL,
    design TEXT NULL,
    form_data TEXT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX idx_qrcodes_user ON qrcodes(user_id, created_at);
CREATE INDEX idx_qrcodes_campaign ON qrcodes(campaign_id);

CREATE TABLE qrcode_history (
    id TEXT PRIMARY KEY,
    qrcode_id TEXT NOT NULL REFERENCES qrcodes(id) ON DELETE CASCADE,
    destination TEXT NOT NULL,
    previous_destination TEXT NULL,
    changed_by TEXT NULL,
    changed_at BIGINT NOT NULL
);
CREATE INDEX idx_qrcode_history_qr ON qrcode_history(qrcode_id, changed_at);

CREATE TABLE scans (
    id TEXT PRIMARY KEY,
    qrcode_id TEXT NOT NULL REFERENCES qrcodes(id) ON DELETE CASCADE,
    scanned_at BIGINT NOT NULL,
    visitor_hash TEXT NOT NULL,
    browser TEXT NOT NULL DEFAULT '',
    os TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    referrer_host TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_scans_qr_time ON scans(qrcode_id, scanned_at);
CREATE INDEX idx_scans_time ON scans(scanned_at);

CREATE TABLE salts (
    day BIGINT PRIMARY KEY,
    salt TEXT NOT NULL
);

CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT NULL,
    actor_email TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at BIGINT NOT NULL
);
CREATE INDEX idx_audit_logs_time ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at);

CREATE TABLE abuse_reports (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    qrcode_id TEXT NULL REFERENCES qrcodes(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    reporter_email TEXT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at BIGINT NOT NULL,
    resolved_at BIGINT NULL
);
CREATE INDEX idx_abuse_reports_status ON abuse_reports(status, created_at);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
