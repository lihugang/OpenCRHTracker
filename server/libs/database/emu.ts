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

export function useEmuDatabase() {
    return useDatabase('EMUTracked');
}
