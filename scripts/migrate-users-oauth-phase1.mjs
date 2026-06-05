import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/migrate-users-oauth-phase1.mjs [options]

Options:
    --apply               Apply the migration. Without this flag the script only
                          analyzes the users database and prints a dry-run summary.
    --config=<path>       Config JSON path. Default: ${DEFAULT_CONFIG_PATH}
    --users-db=<path>     Override the users SQLite database path.
    --help                Show this message
`);
}

function parseArgs(argv) {
    const options = {
        apply: false,
        configPath: resolve(repoRoot, DEFAULT_CONFIG_PATH),
        usersDbPath: ''
    };

    for (const argument of argv) {
        if (argument === '--apply') {
            options.apply = true;
            continue;
        }

        if (argument.startsWith('--config=')) {
            options.configPath = resolve(
                repoRoot,
                argument.slice('--config='.length)
            );
            continue;
        }

        if (argument.startsWith('--users-db=')) {
            options.usersDbPath = resolve(
                repoRoot,
                argument.slice('--users-db='.length)
            );
            continue;
        }

        if (argument === '--help') {
            printHelp();
            process.exit(0);
        }

        throw new Error(`Unknown argument: ${argument}`);
    }

    return options;
}

function readUtf8File(filePath) {
    let text = readFileSync(filePath, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
    }
    return text;
}

function loadSql(relativePath) {
    return readUtf8File(resolve(repoRoot, relativePath));
}

function loadUsersDbPath(configPath) {
    if (!existsSync(configPath)) {
        throw new Error(`Config file does not exist: ${configPath}`);
    }

    const parsed = JSON.parse(readUtf8File(configPath));
    const usersDbPath = parsed?.data?.databases?.users;
    if (typeof usersDbPath !== 'string' || usersDbPath.length === 0) {
        throw new Error(`Config file is missing users DB path: ${configPath}`);
    }

    return resolve(repoRoot, usersDbPath);
}

function formatCount(value) {
    return new Intl.NumberFormat('zh-CN').format(value);
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const usersDbPath =
        options.usersDbPath || loadUsersDbPath(options.configPath);

    if (!existsSync(usersDbPath)) {
        throw new Error(`Users DB does not exist: ${usersDbPath}`);
    }

    const db = new Database(usersDbPath);
    const selectTableExists = db.prepare(
        loadSql('assets/sql/users/migrations/selectTableExists.sql')
    );
    const selectApiKeysColumns = db.prepare(
        loadSql('assets/sql/users/migrations/selectApiKeysColumns.sql')
    );

    const apiKeysColumns = selectApiKeysColumns
        .all()
        .map((row) => String(row.name ?? ''));
    const hasOauthClientId = apiKeysColumns.includes('oauth_client_id');
    const oauthTables = [
        'oauth_clients',
        'oauth_client_redirect_uris',
        'oauth_client_scope_requests',
        'oauth_authorization_codes',
        'oauth_consents',
        'oauth_login_continuations'
    ];
    const existingOauthTables = oauthTables.filter((tableName) =>
        Boolean(selectTableExists.get(tableName))
    );

    console.log(`Users DB: ${usersDbPath}`);
    console.log(`api_keys columns: ${apiKeysColumns.join(', ')}`);
    console.log(
        `oauth tables existing: ${existingOauthTables.length}/${oauthTables.length}`
    );

    const missingSteps = [];
    if (!hasOauthClientId) {
        missingSteps.push('ALTER TABLE api_keys ADD COLUMN oauth_client_id TEXT');
    }
    for (const tableName of oauthTables) {
        if (!existingOauthTables.includes(tableName)) {
            missingSteps.push(`CREATE TABLE ${tableName}`);
        }
    }

    if (missingSteps.length === 0) {
        console.log('Migration not needed: OAuth schema already present.');
        return;
    }

    console.log('Dry-run summary:');
    for (const step of missingSteps) {
        console.log(`- Would execute: ${step}`);
    }

    if (!options.apply) {
        console.log('No changes applied. Re-run with --apply to execute.');
        return;
    }

    const statements = [
        !hasOauthClientId
            ? 'ALTER TABLE api_keys ADD COLUMN oauth_client_id TEXT;'
            : null,
        loadSql('assets/sql/users/oauth/createOauthClientsTable.sql'),
        loadSql('assets/sql/users/oauth/createOauthClientRedirectUrisTable.sql'),
        loadSql('assets/sql/users/oauth/createOauthClientScopeRequestsTable.sql'),
        loadSql('assets/sql/users/oauth/createOauthAuthorizationCodesTable.sql'),
        loadSql('assets/sql/users/oauth/createOauthConsentsTable.sql'),
        loadSql('assets/sql/users/oauth/createOauthLoginContinuationsTable.sql')
    ].filter(Boolean);

    db.pragma('foreign_keys = OFF');

    try {
        const migrate = db.transaction(() => {
            for (const statement of statements) {
                db.exec(statement);
            }
        });

        migrate();
    } finally {
        db.pragma('foreign_keys = ON');
        db.close();
    }

    console.log(
        `Applied OAuth phase 1 migration steps: ${formatCount(missingSteps.length)}`
    );
}

main();
