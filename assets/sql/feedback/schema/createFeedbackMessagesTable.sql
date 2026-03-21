CREATE TABLE IF NOT EXISTS feedback_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    author_user_id TEXT,
    author_type TEXT NOT NULL,
    body TEXT NOT NULL,
    meta_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (topic_id) REFERENCES feedback_topics(id) ON DELETE CASCADE
);