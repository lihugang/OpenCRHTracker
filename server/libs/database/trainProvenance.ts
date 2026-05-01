import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureTrainProvenanceSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('train-provenance/schema');
    for (const statement of Object.values(schemaSql)) {
        db.exec(statement);
    }
}

registerDatabaseInitializer('trainProvenance', ensureTrainProvenanceSchema);

let ensured = false;

export function ensureTrainProvenanceDatabaseSchema() {
    if (ensured) {
        return;
    }

    const db = useDatabase('trainProvenance');
    ensureTrainProvenanceSchema(db);
    ensured = true;
}

export function useTrainProvenanceDatabase() {
    return useDatabase('trainProvenance');
}
