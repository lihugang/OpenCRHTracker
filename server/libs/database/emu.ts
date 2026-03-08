import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureEmuTrackedSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('emu/schema');
    for (const statement of Object.values(schemaSql)) {
        db.exec(statement);
    }
}

registerDatabaseInitializer('EMUTracked', ensureEmuTrackedSchema);

let ensured = false;

export function ensureEmuDatabaseSchema() {
    if (ensured) {
        return;
    }
    const db = useDatabase('EMUTracked');
    ensureEmuTrackedSchema(db);
    ensured = true;
}

export function useEmuDatabase() {
    return useDatabase('EMUTracked');
}
