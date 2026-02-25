import crypto from 'crypto';
import useConfig from '~/server/config';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export interface UserRecord {
    username: string;
    salt: string;
    password_hash: string;
    created_at: number;
    last_login_at: number | null;
}

export interface ApiKeyRecord {
    key: string;
    user_id: string;
    created_at: number;
    revoked_at: number | null;
    expires_at: number;
    daily_token_limit: number;
}

type AuthSqlKey =
    | 'insertApiKey'
    | 'revokeApiKeyByUser'
    | 'selectApiKeysByUser'
    | 'selectUserByUsername'
    | 'selectValidApiKey'
    | 'updateUserLastLogin';

const authSql = importSqlBatch('users/queries') as Record<AuthSqlKey, string>;
const authStatements = createPreparedSqlStore<AuthSqlKey>({
    dbName: 'users',
    scope: 'users/queries',
    sql: authSql
});

function createPasswordHash(password: string, salt: string) {
    const config = useConfig();
    const scrypt = config.user.scrypt;
    const hashBuffer = crypto.scryptSync(password, salt, scrypt.keyLength, {
        N: scrypt.cost,
        r: scrypt.blockSize,
        p: scrypt.parallelization
    });
    return hashBuffer.toString('hex');
}

function equalsSafe(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function getUserByUsername(username: string) {
    return authStatements.get<UserRecord>('selectUserByUsername', username);
}

export function verifyUserPassword(user: UserRecord, password: string) {
    const hash = createPasswordHash(password, user.salt);
    return equalsSafe(hash, user.password_hash);
}

export function updateLastLoginAt(username: string) {
    const now = getNowSeconds();
    authStatements.run('updateUserLastLogin', now, username);
}

export function createApiKey(userId: string) {
    const config = useConfig();

    const key = `${config.user.apiKeyPrefix}${crypto.randomBytes(config.user.apiKeyBytes).toString('base64url')}`;
    const createdAt = getNowSeconds();
    const expiresAt = createdAt + config.user.apiKeyTtlSeconds;

    authStatements.run(
        'insertApiKey',
        key,
        userId,
        createdAt,
        expiresAt,
        config.quota.userMaxTokens
    );

    return {
        key,
        userId,
        createdAt,
        expiresAt,
        dailyTokenLimit: config.quota.userMaxTokens
    };
}

export function listApiKeysByUser(userId: string) {
    return authStatements.all<ApiKeyRecord>('selectApiKeysByUser', userId);
}

export function revokeApiKeyByUser(key: string, userId: string) {
    const now = getNowSeconds();
    const result = authStatements.run('revokeApiKeyByUser', now, key, userId);
    return result.changes > 0;
}

export function getValidApiKey(key: string) {
    const now = getNowSeconds();
    return authStatements.get<ApiKeyRecord>('selectValidApiKey', key, now);
}

export function maskApiKey(key: string) {
    if (key.length <= 10) {
        return `${key.slice(0, 3)}***`;
    }
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
