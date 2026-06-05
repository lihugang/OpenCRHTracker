SELECT client_id, redirect_uri
FROM oauth_client_redirect_uris
WHERE client_id = ?
ORDER BY redirect_uri ASC;
