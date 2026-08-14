CREATE INDEX IF NOT EXISTS idx_user_event_subscriptions_v2_target
ON user_event_subscriptions_v2 (kind, target_key, user_id);

CREATE INDEX IF NOT EXISTS idx_user_event_subscriptions_v2_user_updated
ON user_event_subscriptions_v2 (user_id, updated_at DESC, kind, target_key);
