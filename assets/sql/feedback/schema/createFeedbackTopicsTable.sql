CREATE TABLE IF NOT EXISTS feedback_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_user_id TEXT,
    creator_type TEXT NOT NULL,
    visibility TEXT NOT NULL,
    primary_type TEXT NOT NULL DEFAULT 'other',
    secondary_type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    title_mode TEXT NOT NULL DEFAULT 'auto',
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_replied_at INTEGER NOT NULL,
    deleted_at INTEGER,
    deleted_by_user_id TEXT
);
