SELECT username, salt, password_hash, created_at, last_login_at, is_banned
FROM users
WHERE username = ?;
