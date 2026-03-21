UPDATE feedback_topics
SET updated_at = ?,
    last_replied_at = ?
WHERE id = ?
  AND deleted_at IS NULL;
