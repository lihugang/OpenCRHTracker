CREATE INDEX IF NOT EXISTS idx_user_event_subscriptions_target
ON user_event_subscriptions (target_type, target_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_event_subscriptions_user_updated
ON user_event_subscriptions (user_id, updated_at DESC, target_type, target_id);
