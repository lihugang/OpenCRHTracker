import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';
const LEGACY_API_KEYS_TABLE = 'api_keys_legacy_pre_remove_daily_token_limit';
const LEGACY_API_KEY_SCOPES_TABLE =
    'api_key_scopes_legacy_pre_remove_daily_token_limit';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/migrate-users-api-keys-remove-daily-token-limit.mjs [options]

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

function getNowSeconds() {
    return Math.floor(Date.now() / 1000);
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
    const selectApiKeySummary = db.prepare(
        loadSql('assets/sql/users/migrations/selectApiKeySummary.sql')
    );

    const apiKeysTableExists = Boolean(selectTableExists.get('api_keys'));
    if (!apiKeysTableExists) {
        throw new Error(`Table api_keys does not exist in: ${usersDbPath}`);
    }

    const existingLegacyTables = [
        LEGACY_API_KEY_SCOPES_TABLE,
        LEGACY_API_KEYS_TABLE
    ].filter((tableName) => Boolean(selectTableExists.get(tableName)));

    if (existingLegacyTables.length > 0) {
        throw new Error(
            `Legacy backup tables already exist: ${existingLegacyTables.join(', ')}`
        );
    }

    const columns = selectApiKeysColumns
        .all()
        .map((row) => String(row.name ?? ''));
    const summary = selectApiKeySummary.get() ?? {
        total_count: 0,
        active_count: 0
    };
    const totalCount = Number(summary.total_count ?? 0);
    const activeCount = Number(summary.active_count ?? 0);
    const needsMigration = columns.includes('daily_token_limit');

    console.log(`Users DB: ${usersDbPath}`);
    console.log(`api_keys columns: ${columns.join(', ')}`);
    console.log(`total keys: ${formatCount(totalCount)}`);
    console.log(`active keys: ${formatCount(activeCount)}`);

    if (!needsMigration) {
        console.log('Migration not needed: api_keys.daily_token_limit is absent.');
        return;
    }

    console.log('Dry-run summary:');
    console.log(`- Would revoke ${formatCount(activeCount)} active key records.`);
    console.log('- Would rebuild api_keys without daily_token_limit.');
    console.log('- Would rebuild api_key_scopes and preserve all scope rows.');

    if (!options.apply) {
        console.log('No changes applied. Re-run with --apply to execute.');
        return;
    }

    const renameApiKeysToLegacy = loadSql(
        'assets/sql/users/migrations/renameApiKeysToLegacy.sql'
    );
    const renameApiKeyScopesToLegacy = loadSql(
        'assets/sql/users/migrations/renameApiKeyScopesToLegacy.sql'
    );
    const createApiKeysTable = loadSql(
        'assets/sql/users/schema/createApiKeysTable.sql'
    );
    const createApiKeyScopesTable = loadSql(
        'assets/sql/users/schema/createApiKeyScopesTable.sql'
    );
    const selectLegacyApiKeysRowsSql = loadSql(
        'assets/sql/users/migrations/selectLegacyApiKeysRows.sql'
    );
    const selectLegacyApiKeyScopesRowsSql = loadSql(
        'assets/sql/users/migrations/selectLegacyApiKeyScopesRows.sql'
    );
    const insertMigratedApiKeyRowSql = loadSql(
        'assets/sql/users/migrations/insertMigratedApiKeyRow.sql'
    );
    const insertMigratedApiKeyScopeRowSql = loadSql(
        'assets/sql/users/migrations/insertMigratedApiKeyScopeRow.sql'
    );
    const dropLegacyApiKeyScopesTable = loadSql(
        'assets/sql/users/migrations/dropLegacyApiKeyScopesTable.sql'
    );
    const dropLegacyApiKeysTable = loadSql(
        'assets/sql/users/migrations/dropLegacyApiKeysTable.sql'
    );

    const revokedAt = getNowSeconds();

    db.pragma('foreign_keys = OFF');

    try {
        const migrate = db.transaction(() => {
            db.exec(renameApiKeyScopesToLegacy);
            db.exec(renameApiKeysToLegacy);
            db.exec(createApiKeysTable);
            db.exec(createApiKeyScopesTable);

            const selectLegacyApiKeysRows = db.prepare(selectLegacyApiKeysRowsSql);
            const selectLegacyApiKeyScopesRows = db.prepare(
                selectLegacyApiKeyScopesRowsSql
            );
            const insertMigratedApiKeyRow = db.prepare(
                insertMigratedApiKeyRowSql
            );
            const insertMigratedApiKeyScopeRow = db.prepare(
                insertMigratedApiKeyScopeRowSql
            );

            const legacyRows = selectLegacyApiKeysRows.all();
            for (const row of legacyRows) {
                insertMigratedApiKeyRow.run(
                    row.key,
                    row.revoke_id,
                    row.user_id,
                    row.issuer,
                    row.name,
                    row.active_from,
                    row.revoked_at ?? revokedAt,
                    row.expires_at
                );
            }

            const legacyScopeRows = selectLegacyApiKeyScopesRows.all();
            for (const row of legacyScopeRows) {
                insertMigratedApiKeyScopeRow.run(row.key_id, row.scope);
            }

            db.exec(dropLegacyApiKeyScopesTable);
            db.exec(dropLegacyApiKeysTable);

            return {
                migratedKeyCount: legacyRows.length,
                migratedScopeCount: legacyScopeRows.length
            };
        });

        const result = migrate();
        db.pragma('foreign_keys = ON');
        const foreignKeyCheckRows = db.pragma('foreign_key_check');
        if (Array.isArray(foreignKeyCheckRows) && foreignKeyCheckRows.length > 0) {
            throw new Error('foreign_key_check failed after migration');
        }

        console.log('Migration applied successfully.');
        console.log(
            `- Revoked legacy keys at: ${revokedAt}`
        );
        console.log(
            `- Migrated api_keys rows: ${formatCount(result.migratedKeyCount)}`
        );
        console.log(
            `- Migrated api_key_scopes rows: ${formatCount(result.migratedScopeCount)}`
        );
    } finally {
        db.pragma('foreign_keys = ON');
        db.close();
    }
}

try {
    main();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
}
