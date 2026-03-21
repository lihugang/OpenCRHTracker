UPDATE feedback_topics
SET primary_type = ?,
    secondary_type = ?,
    status = ?,
    title = ?,
    title_mode = ?,
    updated_at = ?,
    last_replied_at = ?
WHERE id = ?
  AND deleted_at IS NULL;
