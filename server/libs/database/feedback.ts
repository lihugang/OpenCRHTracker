import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

function ensureFeedbackSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('feedback/schema');
    const orderedKeys = [
        '001_createFeedbackTopicsTable',
        '002_createFeedbackMessagesTable'
    ];

    for (const key of orderedKeys) {
        const statement = schemaSql[key];
        if (statement) {
            db.exec(statement);
        }
    }

    const topicIndexes = schemaSql['003_createFeedbackTopicIndexes'];
    const messageIndexes = schemaSql['004_createFeedbackMessageIndexes'];

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
