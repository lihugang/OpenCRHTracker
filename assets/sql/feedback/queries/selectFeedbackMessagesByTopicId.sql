SELECT
    id,
    topic_id,
    author_user_id,
    author_type,
    body,
    meta_json,
    created_at,
    deleted_at
FROM feedback_messages
WHERE topic_id = ?
  AND deleted_at IS NULL
ORDER BY created_at ASC, id ASC;
