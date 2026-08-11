CREATE INDEX IF NOT EXISTS idx_feedback_messages_topic_timeline
ON feedback_messages (topic_id, deleted_at, created_at ASC, id ASC);
