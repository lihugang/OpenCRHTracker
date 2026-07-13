CREATE TABLE IF NOT EXISTS user_ban_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('ban', 'unban')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'skipped')),
    source TEXT NOT NULL CHECK (source IN ('admin_manual', 'qq_ban_list', 'fingerprint_match')),
    reason TEXT NOT NULL,
    actor_user_id TEXT,
    qq_number TEXT,
    ip_address TEXT,
    user_agent TEXT,
    matched_action_id INTEGER,
    changed INTEGER CHECK (changed IS NULL OR changed IN (0, 1)),
    requested_at INTEGER NOT NULL,
    completed_at INTEGER,
    error_message TEXT,
    FOREIGN KEY (matched_action_id) REFERENCES user_ban_actions(id)
);

CREATE INDEX IF NOT EXISTS userBanActionsRequestedAtIndex
ON user_ban_actions(requested_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS userBanActionsUserRequestedAtIndex
ON user_ban_actions(user_id, requested_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS userBanActionsPendingUserBanIndex
ON user_ban_actions(user_id)
WHERE action = 'ban'
  AND status = 'pending'
  AND source IN ('qq_ban_list', 'fingerprint_match');
