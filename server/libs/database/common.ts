import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Config } from '~/server/config';
import useConfig from '~/server/config';

export type DatabaseKey = keyof Config['data']['databases'];
type DatabaseInitializer = (db: Database.Database) => void;

const databases = new Map<DatabaseKey, Database.Database>();
const initialized = new Set<DatabaseKey>();
const initializers = new Map<DatabaseKey, DatabaseInitializer>();

function getDatabaseFilePath(name: DatabaseKey) {
    const config = useConfig();
    return config.data.databases[name];
}

function ensureDbDirectory(filePath: string) {
    const dbDir = path.dirname(filePath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
}

export function registerDatabaseInitializer(
    name: DatabaseKey,
    initializer: DatabaseInitializer
) {
    initializers.set(name, initializer);
}

function initializeDatabase(name: DatabaseKey, db: Database.Database) {
    if (initialized.has(name)) {
        return;
    }

    const initializer = initializers.get(name);
    if (initializer) {
        initializer(db);
    }

    initialized.add(name);
}

export default function useDatabase(name: DatabaseKey) {
    const existing = databases.get(name);
    if (existing) {
        return existing;
    }

    const dbFilePath = getDatabaseFilePath(name);
    ensureDbDirectory(dbFilePath);

    const db = new Database(dbFilePath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    initializeDatabase(name, db);

    databases.set(name, db);
    return db;
}
