SELECT username, salt, password_hash, created_at, last_login_at
FROM users
WHERE username = ?;

