INSERT INTO feedback_topics (
    creator_user_id,
    creator_type,
    visibility,
    primary_type,
    secondary_type,
    status,
    title,
    title_mode,
    body,
    created_at,
    updated_at,
    last_replied_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
