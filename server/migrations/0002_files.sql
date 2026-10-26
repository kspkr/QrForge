-- Uploaded files served by dynamic codes (only used when file uploads are enabled).

CREATE TABLE files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    sha256 TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    created_at BIGINT NOT NULL
);
CREATE INDEX idx_files_user ON files(user_id, created_at);

ALTER TABLE qrcodes ADD COLUMN file_id TEXT NULL REFERENCES files(id) ON DELETE SET NULL;
CREATE INDEX idx_qrcodes_file ON qrcodes(file_id);
