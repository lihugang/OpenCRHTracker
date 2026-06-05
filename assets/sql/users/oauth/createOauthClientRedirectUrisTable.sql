CREATE TABLE IF NOT EXISTS oauth_client_redirect_uris (
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    PRIMARY KEY (client_id, redirect_uri),
    FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE
);
