CREATE INDEX IF NOT EXISTS idx_membership_code_batches_group_created
ON membership_code_batches (group_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_membership_codes_batch
ON membership_codes (batch_id, code DESC);

CREATE INDEX IF NOT EXISTS idx_membership_codes_usage
ON membership_codes (used_at, used_by);
