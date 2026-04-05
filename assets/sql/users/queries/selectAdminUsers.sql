SELECT username, created_at, last_login_at
FROM users
ORDER BY
    CASE WHEN last_login_at IS NULL THEN 1 ELSE 0 END ASC,
    last_login_at DESC,
    created_at DESC,
    username ASC;
