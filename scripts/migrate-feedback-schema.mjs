#!/usr/bin/env node

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'data/config.json';
const COLUMN_MIGRATIONS = [
    {
        name: 'primary_type',
        sql: "ALTER TABLE feedback_topics ADD COLUMN primary_type TEXT NOT NULL DEFAULT 'other';"
    },
    {
        name: 'secondary_type',
        sql: "ALTER TABLE feedback_topics ADD COLUMN secondary_type TEXT NOT NULL DEFAULT '';"
    },
    {
        name: 'title_mode',
        sql: "ALTER TABLE feedback_topics ADD COLUMN title_mode TEXT NOT NULL DEFAULT 'auto';"
    }
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function printHelp() {
    console.log(`Usage: node scripts/migrate-feedback-schema.mjs [options]

Options:
    --apply                Apply the migration. Without this flag the script only
                           analyzes the feedback database and prints a dry-run summary.
    --config=<path>        Config JSON path. Default: ${DEFAULT_CONFIG_PATH}
    --feedback-db=<path>   Override the feedback SQLite database path.
    --help                 Show this message
`);
}

function parseArgs(argv) {
    const options = {
        apply: false,
        configPath: resolve(repoRoot, DEFAULT_CONFIG_PATH),
        feedbackDbPath: ''
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
        if (argument.startsWith('--feedback-db=')) {
            options.feedbackDbPath = resolve(
                repoRoot,
                argument.slice('--feedback-db='.length)
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

function loadFeedbackDbPath(configPath) {
    if (!existsSync(configPath)) {
        throw new Error(`Config file does not exist: ${configPath}`);
    }

    const parsed = JSON.parse(readUtf8File(configPath));
    const feedbackDbPath = parsed?.data?.databases?.feedback?.path;
    if (typeof feedbackDbPath !== 'string' || feedbackDbPath.length === 0) {
        throw new Error(
            `Config file is missing feedback DB path: ${configPath}`
        );
    }

    return resolve(repoRoot, feedbackDbPath);
}

function tableExists(db, tableName) {
    const row = db
        .prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?')
        .get('table', tableName);
    return Boolean(row);
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const feedbackDbPath =
        options.feedbackDbPath || loadFeedbackDbPath(options.configPath);

    if (!existsSync(feedbackDbPath)) {
        throw new Error(`Feedback DB does not exist: ${feedbackDbPath}`);
    }

    const db = new Database(feedbackDbPath);
    if (!tableExists(db, 'feedback_topics')) {
        db.close();
        throw new Error(
            `Table feedback_topics does not exist in: ${feedbackDbPath}`
        );
    }

    const columns = db.prepare('PRAGMA table_info(feedback_topics)').all();
    const existingNames = new Set(columns.map((column) => column.name));
    const pending = COLUMN_MIGRATIONS.filter(
        (migration) => !existingNames.has(migration.name)
    );

    if (pending.length === 0) {
        console.log('feedback schema is already migrated; nothing to do.');
        db.close();
        return;
    }

    const actionText = pending
        .map((migration) => `add feedback_topics.${migration.name} column`)
        .join('; ');
    if (!options.apply) {
        console.log(
            `Dry run: would apply ${pending.length} step(s): ${actionText}`
        );
        console.log('Re-run with --apply to execute the migration.');
        db.close();
        return;
    }

    const migrate = db.transaction(() => {
        for (const migration of pending) {
            db.exec(migration.sql);
        }
    });
    migrate();

    console.log(`Applied: ${actionText}`);
    db.close();
}

main();
