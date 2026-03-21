SELECT
    t.id,
    t.creator_user_id,
    t.creator_type,
    t.visibility,
    t.primary_type,
    t.secondary_type,
    t.status,
    t.title,
    t.title_mode,
    t.body,
    t.created_at,
    t.updated_at,
    t.last_replied_at,
    t.deleted_at,
    t.deleted_by_user_id,
    (
        SELECT COUNT(*)
        FROM feedback_messages m
        WHERE m.topic_id = t.id
          AND m.deleted_at IS NULL
    ) AS reply_count
FROM feedback_topics t
WHERE t.deleted_at IS NULL
  AND t.creator_user_id = ?
  AND (? = '' OR t.primary_type = ?)
  AND (? = '' OR t.secondary_type = ?)
  AND (? = '' OR t.status = ?)
  AND (
        ? <= 0
        OR t.last_replied_at < ?
        OR (t.last_replied_at = ? AND t.id < ?)
    )
ORDER BY t.last_replied_at DESC, t.id DESC
LIMIT ?;
