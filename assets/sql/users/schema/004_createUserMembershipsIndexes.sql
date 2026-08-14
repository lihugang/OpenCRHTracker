CREATE INDEX IF NOT EXISTS idx_user_memberships_status_window
ON user_memberships (user_id, revoked_at, starts_at, expires_at);
