CREATE TABLE IF NOT EXISTS user_event_subscriptions (
    user_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, target_type, target_id),
    FOREIGN KEY (user_id) REFERENCES users(username) ON DELETE CASCADE,
    CHECK (target_type IN ('train', 'emu', 'feedback'))
);
