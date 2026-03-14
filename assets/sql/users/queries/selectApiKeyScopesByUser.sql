SELECT api_keys.key AS key_id, api_key_scopes.scope AS scope
FROM api_keys
JOIN api_key_scopes ON api_key_scopes.key_id = api_keys.key
WHERE api_keys.user_id = ?
ORDER BY api_keys.created_at DESC, api_key_scopes.scope ASC;
