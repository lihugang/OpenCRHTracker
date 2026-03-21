INSERT INTO feedback_messages (
    topic_id,
    author_user_id,
    author_type,
    body,
    meta_json,
    created_at
) VALUES (?, ?, ?, ?, ?, ?);
