#!/usr/bin/env node

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/migrate-users-schema.mjs [options]

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
    const usersDbPath = parsed?.data?.databases?.users?.path;
    if (typeof usersDbPath !== 'string' || usersDbPath.length === 0) {
        throw new Error(`Config file is missing users DB path: ${configPath}`);
    }

    return resolve(repoRoot, usersDbPath);
}

function tableExists(db, tableName) {
    const row = db
        .prepare(loadSql('assets/sql/users/migrations/selectTableExists.sql'))
        .get(tableName);
    return Boolean(row);
}

function listColumns(db, tableName) {
    return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const usersDbPath =
        options.usersDbPath || loadUsersDbPath(options.configPath);

    if (!existsSync(usersDbPath)) {
        throw new Error(`Users DB does not exist: ${usersDbPath}`);
    }

    const db = new Database(usersDbPath);
    db.pragma('foreign_keys = ON');

    const needsUsersTable = !tableExists(db, 'users');
    const needsMembershipsTable = !tableExists(db, 'user_memberships');
    if (needsUsersTable) {
        throw new Error(`Table users does not exist in: ${usersDbPath}`);
    }

    const userColumns = listColumns(db, 'users');
    const hasIsBannedColumn = userColumns.some(
        (column) => column.name === 'is_banned'
    );

    let needsMembershipMigration = false;
    if (!needsMembershipsTable) {
        const membershipColumns = listColumns(db, 'user_memberships');
        const expiresAtColumn = membershipColumns.find(
            (column) => column.name === 'expires_at'
        );
        needsMembershipMigration = expiresAtColumn?.notnull !== 1;
    }

    if (hasIsBannedColumn && !needsMembershipMigration) {
        console.log('users schema is already migrated; nothing to do.');
        db.close();
        return;
    }

    if (needsMembershipMigration) {
        const nullExpiryCount = db
            .prepare(
                loadSql(
                    'assets/sql/users/migrations/selectNullUserMembershipExpiryCount.sql'
                )
            )
            .get() ?? { count: 0 };
        if (Number(nullExpiryCount.count) !== 0) {
            db.close();
            throw new Error(
                'Cannot require user membership expiry while legacy permanent memberships exist'
            );
        }
    }

    const actions = [];
    if (!hasIsBannedColumn) {
        actions.push('add users.is_banned column');
    }
    if (needsMembershipMigration) {
        actions.push('rebuild user_memberships with NOT NULL expires_at');
    }

    if (!options.apply) {
        console.log(
            `Dry run: would apply ${actions.length} step(s): ${actions.join('; ')}`
        );
        console.log('Re-run with --apply to execute the migration.');
        db.close();
        return;
    }

    const migrate = db.transaction(() => {
        if (!hasIsBannedColumn) {
            db.exec(
                loadSql('assets/sql/users/migrations/alterUsersAddIsBanned.sql')
            );
        }
        if (needsMembershipMigration) {
            db.exec(
                loadSql(
                    'assets/sql/users/migrations/dropRequiredExpiryUserMembershipsTable.sql'
                )
            );
            db.exec(
                loadSql(
                    'assets/sql/users/migrations/createRequiredExpiryUserMembershipsTable.sql'
                )
            );
            db.exec(
                loadSql(
                    'assets/sql/users/migrations/copyRequiredExpiryUserMemberships.sql'
                )
            );
            db.exec(
                loadSql(
                    'assets/sql/users/migrations/dropLegacyUserMembershipsTable.sql'
                )
            );
            db.exec(
                loadSql(
                    'assets/sql/users/migrations/renameRequiredExpiryUserMembershipsTable.sql'
                )
            );
            db.exec(
                loadSql(
                    'assets/sql/users/schema/004_createUserMembershipsIndexes.sql'
                )
            );
        }
    });

    migrate();
    console.log(`Applied: ${actions.join('; ')}`);
    db.close();
}

main();
