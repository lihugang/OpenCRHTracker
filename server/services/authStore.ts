import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import useConfig from '~/server/config';
import { useUsersDatabase } from '~/server/libs/database/users';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import {
    createSignedApiKeyToken,
    parseSignedApiKeyToken,
    type ApiKeyIssuer
} from '~/server/utils/auth/signedApiKey';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type { AuthSession } from '~/types/auth';

export interface IssuedAuthSession extends AuthSession {
    apiKey: string;
}

export interface UserRecord {
    username: string;
    salt: string;
    password_hash: string;
    created_at: number;
    last_login_at: number | null;
}

interface ApiKeyScopeRecord {
    key_id: string;
    scope: string;
}

export interface ApiKeyRecord {
    key: string;
    user_id: string;
    issuer: ApiKeyIssuer;
    active_from: number;
    revoked_at: number | null;
    expires_at: number;
    daily_token_limit: number;
    scopes: string[];
}

export interface CreateApiKeyOptions {
    scopes?: string[];
    issuer?: ApiKeyIssuer;
    activeFrom?: number;
    expiresAt?: number;
}

type AuthSqlKey =
    | 'deleteRevokedApiKeysBefore'
    | 'insertUser'
    | 'insertApiKey'
    | 'insertApiKeyScope'
    | 'revokeApiKeyByUser'
    | 'selectApiKeysByUser'
    | 'selectApiKeyScopesByKey'
    | 'selectApiKeyScopesByUser'
    | 'selectUserByUsername'
    | 'selectValidApiKey'
    | 'updateUserLastLogin';

const authSql = importSqlBatch('users/queries') as Record<AuthSqlKey, string>;
const authStatements = createPreparedSqlStore<AuthSqlKey>({
    dbName: 'users',
    scope: 'users/queries',
    sql: authSql
});

const MISSING_USER_RECORD = Symbol('missing-user-record');
const MISSING_API_KEY_RECORD = Symbol('missing-api-key-record');

const userRecordCache = new LRUCache<
    string,
    UserRecord | typeof MISSING_USER_RECORD
>({
    max: useConfig().api.authCache.userRecord.maxEntries,
    ttl: useConfig().api.authCache.userRecord.defaultTtlSeconds * 1000,
    updateAgeOnGet: true
});

const apiKeyRecordCache = new LRUCache<
    string,
    ApiKeyRecord | typeof MISSING_API_KEY_RECORD
>({
    max: useConfig().api.authCache.apiKeyRecord.maxEntries,
    ttl: useConfig().api.authCache.apiKeyRecord.defaultTtlSeconds * 1000,
    updateAgeOnGet: true
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

function createSalt() {
    return crypto.randomBytes(useConfig().user.saltLength).toString('hex');
}

function createKeyId() {
    return crypto
        .randomBytes(useConfig().user.apiKeyBytes)
        .toString('base64url');
}

function resolveApiKeyWindow(
    activeFrom = getNowSeconds(),
    expiresAt = activeFrom + useConfig().user.apiKeyTtlSeconds
) {
    const config = useConfig();

    if (!Number.isInteger(activeFrom) || activeFrom <= 0) {
        throw new Error('activeFrom must be a positive integer unix timestamp');
    }

    if (!Number.isInteger(expiresAt) || expiresAt <= 0) {
        throw new Error('expiresAt must be a positive integer unix timestamp');
    }

    const lifetimeSeconds = expiresAt - activeFrom;
    if (lifetimeSeconds <= 0) {
        throw new Error('expiresAt must be greater than activeFrom');
    }

    if (lifetimeSeconds > config.user.apiKeyMaxLifetimeSeconds) {
        throw new Error('api key lifetime exceeds configured maximum');
    }

    return {
        activeFrom,
        expiresAt
    };
}

function buildApiKeySession(
    userId: string,
    keyId: string,
    scopes: string[],
    issuer: ApiKeyIssuer,
    activeFrom = getNowSeconds(),
    expiresAt = activeFrom + useConfig().user.apiKeyTtlSeconds
): IssuedAuthSession {
    const config = useConfig();
    const normalizedScopes = normalizeScopeList(scopes);
    const resolvedWindow = resolveApiKeyWindow(activeFrom, expiresAt);
    const dailyTokenLimit = config.quota.userMaxTokens;
    const apiKey = createSignedApiKeyToken(
        {
            kid: keyId,
            sub: userId,
            scopes: normalizedScopes,
            nbf: resolvedWindow.activeFrom,
            exp: resolvedWindow.expiresAt,
            limit: dailyTokenLimit
        },
        issuer
    );

    return {
        userId,
        keyId,
        issuer,
        apiKey,
        maskedApiKey: maskApiKey(apiKey),
        scopes: normalizedScopes,
        activeFrom: resolvedWindow.activeFrom,
        expiresAt: resolvedWindow.expiresAt,
        dailyTokenLimit
    };
}

function equalsSafe(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function insertApiKeyScopes(keyId: string, scopes: string[]) {
    for (const scope of scopes) {
        authStatements.run('insertApiKeyScope', keyId, scope);
    }
}

function hydrateApiKeyScopesByKey(keyId: string) {
    return authStatements
        .all<ApiKeyScopeRecord>('selectApiKeyScopesByKey', keyId)
        .map((record) => record.scope);
}

function sameScopeSet(left: string[], right: string[]) {
    const normalizedLeft = [...normalizeScopeList(left)].sort();
    const normalizedRight = [...normalizeScopeList(right)].sort();

    if (normalizedLeft.length !== normalizedRight.length) {
        return false;
    }

    return normalizedLeft.every(
        (scope, index) => scope === normalizedRight[index]
    );
}

function matchesPayload(record: ApiKeyRecord, payload: AuthSession) {
    return (
        record.key === payload.keyId &&
        record.user_id === payload.userId &&
        record.issuer === payload.issuer &&
        record.active_from === payload.activeFrom &&
        record.expires_at === payload.expiresAt &&
        record.daily_token_limit === payload.dailyTokenLimit &&
        sameScopeSet(record.scopes, payload.scopes)
    );
}

function buildAuthSessionFromRecord(
    apiKey: string,
    record: ApiKeyRecord
): IssuedAuthSession {
    return {
        userId: record.user_id,
        keyId: record.key,
        issuer: record.issuer,
        apiKey,
        maskedApiKey: maskApiKey(apiKey),
        scopes: record.scopes,
        activeFrom: record.active_from,
        expiresAt: record.expires_at,
        dailyTokenLimit: record.daily_token_limit
    };
}

function getStoredApiKeyRecord(keyId: string, now: number) {
    const cached = apiKeyRecordCache.get(keyId);
    if (cached !== undefined) {
        if (
            cached !== MISSING_API_KEY_RECORD &&
            (cached.revoked_at !== null ||
                cached.active_from > now ||
                cached.expires_at <= now)
        ) {
            apiKeyRecordCache.set(keyId, MISSING_API_KEY_RECORD, {
                ttl: 5 * 1000
            });
            return undefined;
        }

        return cached === MISSING_API_KEY_RECORD ? undefined : cached;
    }

    const record = authStatements.get<Omit<ApiKeyRecord, 'scopes'>>(
        'selectValidApiKey',
        keyId,
        now,
        now
    );
    if (!record) {
        apiKeyRecordCache.set(keyId, MISSING_API_KEY_RECORD, {
            ttl: 5 * 1000
        });
        return undefined;
    }

    const hydratedRecord: ApiKeyRecord = {
        ...record,
        scopes: hydrateApiKeyScopesByKey(keyId)
    };
    apiKeyRecordCache.set(keyId, hydratedRecord);
    return hydratedRecord;
}

export function getUserByUsername(username: string) {
    const cached = userRecordCache.get(username);
    if (cached !== undefined) {
        return cached === MISSING_USER_RECORD ? undefined : cached;
    }

    const user = authStatements.get<UserRecord>(
        'selectUserByUsername',
        username
    );
    userRecordCache.set(username, user ?? MISSING_USER_RECORD);
    return user;
}

export function verifyUserPassword(user: UserRecord, password: string) {
    const hash = createPasswordHash(password, user.salt);
    return equalsSafe(hash, user.password_hash);
}

export function updateLastLoginAt(username: string) {
    const now = getNowSeconds();
    authStatements.run('updateUserLastLogin', now, username);

    const cached = userRecordCache.get(username);
    if (cached && cached !== MISSING_USER_RECORD) {
        userRecordCache.set(username, {
            ...cached,
            last_login_at: now
        });
    }
}

export function createApiKey(
    userId: string,
    options: CreateApiKeyOptions = {}
) {
    const issuer = options.issuer ?? 'webapp';
    const scopes =
        options.scopes ?? useConfig().api.permissions.issuedKeyDefaultScopes;
    const keyId = createKeyId();
    const apiKey = buildApiKeySession(
        userId,
        keyId,
        scopes,
        issuer,
        options.activeFrom,
        options.expiresAt
    );
    const insert = useUsersDatabase().transaction(() => {
        authStatements.run(
            'insertApiKey',
            apiKey.keyId,
            userId,
            apiKey.issuer,
            apiKey.activeFrom,
            apiKey.expiresAt,
            apiKey.dailyTokenLimit
        );
        insertApiKeyScopes(apiKey.keyId, apiKey.scopes);
    });

    insert();
    apiKeyRecordCache.set(apiKey.keyId, {
        key: apiKey.keyId,
        user_id: userId,
        issuer: apiKey.issuer,
        active_from: apiKey.activeFrom,
        revoked_at: null,
        expires_at: apiKey.expiresAt,
        daily_token_limit: apiKey.dailyTokenLimit,
        scopes: apiKey.scopes
    });

    return apiKey;
}

export function createUserWithApiKey(
    username: string,
    password: string,
    options: CreateApiKeyOptions = {}
) {
    const createdAt = getNowSeconds();
    const salt = createSalt();
    const passwordHash = createPasswordHash(password, salt);
    const keyId = createKeyId();
    const issuer = options.issuer ?? 'webapp';
    const scopes =
        options.scopes ?? useConfig().api.permissions.issuedKeyDefaultScopes;
    const apiKey = buildApiKeySession(
        username,
        keyId,
        scopes,
        issuer,
        options.activeFrom,
        options.expiresAt
    );
    const insert = useUsersDatabase().transaction(() => {
        authStatements.run(
            'insertUser',
            username,
            salt,
            passwordHash,
            createdAt,
            createdAt
        );
        authStatements.run(
            'insertApiKey',
            apiKey.keyId,
            username,
            apiKey.issuer,
            apiKey.activeFrom,
            apiKey.expiresAt,
            apiKey.dailyTokenLimit
        );
        insertApiKeyScopes(apiKey.keyId, apiKey.scopes);
    });

    insert();
    userRecordCache.set(username, {
        username,
        salt,
        password_hash: passwordHash,
        created_at: createdAt,
        last_login_at: createdAt
    });
    apiKeyRecordCache.set(apiKey.keyId, {
        key: apiKey.keyId,
        user_id: username,
        issuer: apiKey.issuer,
        active_from: apiKey.activeFrom,
        revoked_at: null,
        expires_at: apiKey.expiresAt,
        daily_token_limit: apiKey.dailyTokenLimit,
        scopes: apiKey.scopes
    });
    return apiKey;
}

export function listApiKeysByUser(userId: string) {
    const records = authStatements.all<Omit<ApiKeyRecord, 'scopes'>>(
        'selectApiKeysByUser',
        userId
    );
    const scopeRows = authStatements.all<ApiKeyScopeRecord>(
        'selectApiKeyScopesByUser',
        userId
    );
    const scopesByKeyId = new Map<string, string[]>();

    for (const row of scopeRows) {
        const scopes = scopesByKeyId.get(row.key_id) ?? [];
        scopes.push(row.scope);
        scopesByKeyId.set(row.key_id, scopes);
    }

    return records.map<ApiKeyRecord>((record) => ({
        ...record,
        scopes: scopesByKeyId.get(record.key) ?? []
    }));
}

export function revokeApiKeyByUser(keyId: string, userId: string) {
    const now = getNowSeconds();
    const result = authStatements.run('revokeApiKeyByUser', now, keyId, userId);
    if (result.changes > 0) {
        apiKeyRecordCache.set(keyId, MISSING_API_KEY_RECORD, {
            ttl: 5 * 1000
        });
    }
    return result.changes > 0;
}

export function deleteRevokedApiKeysBefore(cutoffTimestamp: number) {
    const result = authStatements.run(
        'deleteRevokedApiKeysBefore',
        cutoffTimestamp
    );
    return result.changes;
}

export function getValidApiKey(apiKey: string) {
    const payload = parseSignedApiKeyToken(apiKey);
    if (!payload) {
        return undefined;
    }

    const now = getNowSeconds();
    if (
        payload.kid.length === 0 ||
        payload.sub.length === 0 ||
        payload.exp <= now ||
        payload.nbf > payload.exp
    ) {
        return undefined;
    }

    const storedRecord = getStoredApiKeyRecord(payload.kid, now);
    if (!storedRecord) {
        return undefined;
    }

    const hydratedPayload: AuthSession = {
        userId: payload.sub,
        keyId: payload.kid,
        issuer: payload.issuer,
        maskedApiKey: maskApiKey(apiKey),
        scopes: payload.scopes,
        activeFrom: payload.nbf,
        expiresAt: payload.exp,
        dailyTokenLimit: payload.limit
    };

    if (!matchesPayload(storedRecord, hydratedPayload)) {
        return undefined;
    }

    return buildAuthSessionFromRecord(apiKey, storedRecord);
}

export function maskApiKey(key: string) {
    if (key.length <= 24) {
        return `${key.slice(0, 6)}********`;
    }
    return `${key.slice(0, 16)}********${key.slice(-8)}`;
}
