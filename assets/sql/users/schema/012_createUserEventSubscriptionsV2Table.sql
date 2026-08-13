CREATE TABLE IF NOT EXISTS user_event_subscriptions_v2 (
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    emu_id INTEGER,
    topic_id INTEGER,
    train_prefix TEXT,
    train_number INTEGER,
    target_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, kind, target_key),
    FOREIGN KEY (user_id) REFERENCES users(username) ON DELETE CASCADE,
    CHECK (kind IN ('train', 'emu', 'feedback')),
    CHECK (
        (
            kind = 'train'
            AND train_prefix IS NOT NULL
            AND train_number IS NOT NULL
            AND emu_id IS NULL
            AND topic_id IS NULL
        )
        OR (
            kind = 'emu'
            AND emu_id IS NOT NULL
            AND train_prefix IS NULL
            AND train_number IS NULL
            AND topic_id IS NULL
        )
        OR (
            kind = 'feedback'
            AND topic_id IS NOT NULL
            AND emu_id IS NULL
            AND train_prefix IS NULL
            AND train_number IS NULL
        )
    )
);
