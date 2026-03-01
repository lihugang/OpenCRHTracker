import type Database from 'better-sqlite3';
import useDatabase, { type DatabaseKey } from '~/server/libs/database/common';

type PreparedStatementCacheKey = `${DatabaseKey}|${string}|${string}`;

const preparedStatements = new Map<
    PreparedStatementCacheKey,
    Database.Statement<unknown[]>
>();

export interface CreatePreparedSqlStoreOptions<SqlKey extends string> {
    dbName: DatabaseKey;
    scope: string;
    sql: Record<SqlKey, string>;
}

function buildPreparedStatementCacheKey(
    dbName: DatabaseKey,
    scope: string,
    sqlKey: string
): PreparedStatementCacheKey {
    return `${dbName}|${scope}|${sqlKey}`;
}

export function createPreparedSqlStore<SqlKey extends string>(
    options: CreatePreparedSqlStoreOptions<SqlKey>
) {
    function getStatement(key: SqlKey): Database.Statement<unknown[]> {
        const sql = options.sql[key];
        if (!sql) {
            throw new Error(
                `[prepared-sql] sql_not_found db=${options.dbName} scope=${options.scope} key=${key}`
            );
        }

        const cacheKey = buildPreparedStatementCacheKey(
            options.dbName,
            options.scope,
            key
        );
        const cached = preparedStatements.get(cacheKey);
        if (cached) {
            return cached;
        }

        const statement = useDatabase(options.dbName).prepare(
            sql
        ) as Database.Statement<unknown[]>;
        preparedStatements.set(cacheKey, statement);
        return statement;
    }

    return {
        getStatement,
        run(key: SqlKey, ...params: unknown[]) {
            return getStatement(key).run(...params);
        },
        get<Result>(key: SqlKey, ...params: unknown[]) {
            return getStatement(key).get(...params) as Result | undefined;
        },
        all<Result>(key: SqlKey, ...params: unknown[]) {
            return getStatement(key).all(...params) as Result[];
        }
    };
}
