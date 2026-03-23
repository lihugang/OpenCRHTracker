UPDATE users
SET salt = ?, password_hash = ?
WHERE username = ?;
