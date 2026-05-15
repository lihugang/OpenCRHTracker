import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Config } from '~/server/config';
import useConfig from '~/server/config';
import { measureServerTimingPhase } from '~/server/utils/timing/serverTiming';

export type DatabaseKey = keyof Config['data']['databases'];
type DatabaseInitializer = (db: Database.Database) => void;

const databases = new Map<DatabaseKey, Database.Database>();
const initialized = new Set<DatabaseKey>();
const initializers = new Map<DatabaseKey, DatabaseInitializer>();
const INSTRUMENTED_DATABASE = Symbol('instrumentedDatabase');
const INSTRUMENTED_STATEMENT = Symbol('instrumentedStatement');

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
    if (!initializer) {
        return;
    }

    initializer(db);
    initialized.add(name);
}

function instrumentStatement<TStatement extends Database.Statement<unknown[]>>(
    statement: TStatement
) {
    const mutableStatement = statement as TStatement & {
        [INSTRUMENTED_STATEMENT]?: boolean;
    };
    if (mutableStatement[INSTRUMENTED_STATEMENT]) {
        return statement;
    }

    for (const methodName of ['run', 'get', 'all'] as const) {
        const originalMethod = statement[methodName].bind(statement);
        Object.defineProperty(statement, methodName, {
            value: (...args: unknown[]) => {
                return measureServerTimingPhase('db', () =>
                    originalMethod(...args)
                );
            },
            configurable: true,
            writable: true
        });
    }

    mutableStatement[INSTRUMENTED_STATEMENT] = true;
    return statement;
}

function instrumentDatabase(db: Database.Database) {
    const mutableDatabase = db as Database.Database & {
        [INSTRUMENTED_DATABASE]?: boolean;
    };
    if (mutableDatabase[INSTRUMENTED_DATABASE]) {
        return db;
    }

    const originalExec = db.exec.bind(db);
    Object.defineProperty(db, 'exec', {
        value: (sql: string) => {
            return measureServerTimingPhase('db', () => originalExec(sql));
        },
        configurable: true,
        writable: true
    });

    const originalPrepare = db.prepare.bind(db);
    Object.defineProperty(db, 'prepare', {
        value: (sql: string) => {
            const statement = measureServerTimingPhase('db', () =>
                originalPrepare(sql)
            ) as Database.Statement<unknown[]>;
            return instrumentStatement(statement);
        },
        configurable: true,
        writable: true
    });

    mutableDatabase[INSTRUMENTED_DATABASE] = true;
    return db;
}

export default function useDatabase(name: DatabaseKey) {
    const existing = databases.get(name);
    if (existing) {
        initializeDatabase(name, existing);
        return instrumentDatabase(existing);
    }

    const dbFilePath = getDatabaseFilePath(name);
    ensureDbDirectory(dbFilePath);

    const db = new Database(dbFilePath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    initializeDatabase(name, db);
    instrumentDatabase(db);

    databases.set(name, db);
    return db;
}
