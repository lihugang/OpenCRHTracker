UPDATE membership_codes
SET
    used_at = ?,
    used_by = ?
WHERE code = ?
  AND used_at IS NULL
  AND used_by IS NULL;
