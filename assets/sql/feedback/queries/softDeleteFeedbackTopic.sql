UPDATE feedback_topics
SET visibility = 'private',
    updated_at = ?
WHERE id = ?
  AND deleted_at IS NULL
  AND visibility <> 'private';
