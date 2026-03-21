CREATE INDEX IF NOT EXISTS idx_feedback_topics_public_timeline
ON feedback_topics (visibility, deleted_at, last_replied_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_topics_creator_timeline
ON feedback_topics (creator_user_id, deleted_at, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_topics_status_timeline
ON feedback_topics (status, primary_type, secondary_type, deleted_at, updated_at DESC, id DESC);
