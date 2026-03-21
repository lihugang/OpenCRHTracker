import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureColumn(
    db: Database.Database,
    tableName: string,
    columnName: string,
    sql: string
) {
    const columns = db
        .prepare(`PRAGMA table_info(${tableName})`)
        .all() as Array<{ name?: unknown }>;
    const hasColumn = columns.some((column) => column.name === columnName);

    if (!hasColumn) {
        db.exec(sql);
    }
}

function ensureFeedbackSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('feedback/schema');
    const orderedKeys = [
        'createFeedbackTopicsTable',
        'createFeedbackMessagesTable'
    ];

    for (const key of orderedKeys) {
        const statement = schemaSql[key];
        if (statement) {
            db.exec(statement);
        }
    }

    ensureColumn(
        db,
        'feedback_topics',
        'primary_type',
        "ALTER TABLE feedback_topics ADD COLUMN primary_type TEXT NOT NULL DEFAULT 'other';"
    );
    ensureColumn(
        db,
        'feedback_topics',
        'secondary_type',
        "ALTER TABLE feedback_topics ADD COLUMN secondary_type TEXT NOT NULL DEFAULT '';"
    );
    ensureColumn(
        db,
        'feedback_topics',
        'title_mode',
        "ALTER TABLE feedback_topics ADD COLUMN title_mode TEXT NOT NULL DEFAULT 'auto';"
    );
    const topicIndexes = schemaSql.createFeedbackTopicIndexes;
    const messageIndexes = schemaSql.createFeedbackMessageIndexes;

    if (topicIndexes) {
        db.exec(topicIndexes);
    }
    if (messageIndexes) {
        db.exec(messageIndexes);
    }
}

registerDatabaseInitializer('feedback', ensureFeedbackSchema);

export function useFeedbackDatabase() {
    return useDatabase('feedback');
}
