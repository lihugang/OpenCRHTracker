import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import useConfig from '~/server/config';
import { useUsersDatabase } from '~/server/libs/database/users';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { resolveUserMembershipEntitlements } from '~/server/services/membershipStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import {
    createSignedApiKeyToken,
    parseSignedApiKeyToken,
    type ApiKeyIssuer
} from '~/server/utils/auth/signedApiKey';
import { formatShanghaiDateTime } from '~/server/utils/date/shanghaiDateTime';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    normalizeApiKeyName,
    validateApiKeyName
} from '~/utils/auth/apiKeyName';

interface ApiKeyPayload {
    userId: string;
    keyId: string;
    issuer: ApiKeyIssuer;
    oauthClientId: string | null;
    activeFrom: number;
    expiresAt: number;
}

export interface IssuedAuthSession extends ApiKeyPayload {
    name: string;
    revokeId: string;
    maskedApiKey: string;
    apiKey: string;
    scopes: string[];
}

export interface UserRecord {
    username: string;
    salt: string;
    password_hash: string;
    created_at: number;
    last_login_at: number | null;
    is_banned: number;
}

interface ApiKeyScopeRecord {
    key_id: string;
    scope: string;
}

interface StoredApiKeyRecord {
    key: string;
    revoke_id: string;
    user_id: string;
    issuer: ApiKeyIssuer;
    oauth_client_id: string | null;
    name: string;
    active_from: number;
    revoked_at: number | null;
    expires_at: number;
}

export interface ApiKeyRecord {
    key: StoredApiKeyRecord['key'];
    revoke_id: StoredApiKeyRecord['revoke_id'];
    user_id: StoredApiKeyRecord['user_id'];
    issuer: StoredApiKeyRecord['issuer'];
    oauth_client_id: StoredApiKeyRecord['oauth_client_id'];
    name: StoredApiKeyRecord['name'];
    active_from: StoredApiKeyRecord['active_from'];
    revoked_at: StoredApiKeyRecord['revoked_at'];
    expires_at: StoredApiKeyRecord['expires_at'];
    scopes: string[];
}

export interface CreateApiKeyOptions {
    name?: string;
    scopes?: string[];
    issuer?: ApiKeyIssuer;
    oauthClientId?: string | null;
    activeFrom?: number;
    expiresAt?: number;
}

type AuthSqlKey =
    | 'deleteRevokedApiKeysBefore'
    | 'insertUser'
    | 'insertApiKey'
    | 'insertApiKeyScope'
    | 'revokeApiKeysByOauthClientId'
    | 'revokeApiKeysByUserAndOauthClientId'
    | 'revokeApiKeysByIssuer'
    | 'revokeApiKeysByUserAndIssuer'
    | 'revokeApiKeyByUser'
    | 'revokeApiKeyByRevokeId'
    | 'selectApiKeysByUser'
    | 'selectApiKeyScopesByKey'
    | 'selectApiKeyScopesByUser'
    | 'selectUserByUsername'
    | 'selectValidApiKey'
    | 'updateUserBanState'
    | 'updateUserPassword'
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

const bannedUserCache = new LRUCache<string, boolean>({
    max: useConfig().api.authCache.userRecord.maxEntries,
    ttl: useConfig().api.authCache.userRecord.defaultTtlSeconds * 1000,
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

function createRevokeId() {
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

function resolveApiKeyName(
    name: string | undefined,
    issuer: ApiKeyIssuer,
    activeFrom: number
) {
    const config = useConfig();
    const fallbackName =
        issuer === 'webapp'
            ? `网页端会话 ${formatShanghaiDateTime(activeFrom)}`
            : '';
    const normalizedName = normalizeApiKeyName(name ?? fallbackName);
    const validationError = validateApiKeyName(
        normalizedName,
        config.user.apiKeyNameLength
    );

    if (validationError) {
        throw new Error(validationError);
    }

    return normalizedName;
}

function buildApiKeySession(
    userId: string,
    keyId: string,
    revokeId: string,
    name: string | undefined,
    scopes: string[],
    issuer: ApiKeyIssuer,
    oauthClientId: string | null,
    activeFrom = getNowSeconds(),
    expiresAt = activeFrom + useConfig().user.apiKeyTtlSeconds
): IssuedAuthSession {
    const normalizedScopes = normalizeScopeList(scopes);
    const resolvedWindow = resolveApiKeyWindow(activeFrom, expiresAt);
    const resolvedName = resolveApiKeyName(
        name,
        issuer,
        resolvedWindow.activeFrom
    );
    const apiKey = createSignedApiKeyToken(
        {
            kid: keyId,
            sub: userId,
            nbf: resolvedWindow.activeFrom,
            exp: resolvedWindow.expiresAt
        },
        issuer
    );

    return {
        userId,
        keyId,
        revokeId,
        issuer,
        oauthClientId,
        name: resolvedName,
        apiKey,
        maskedApiKey: maskApiKey(apiKey),
        scopes: normalizedScopes,
        activeFrom: resolvedWindow.activeFrom,
        expiresAt: resolvedWindow.expiresAt
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

function cacheIssuedApiKey(apiKey: IssuedAuthSession) {
    apiKeyRecordCache.set(apiKey.keyId, {
        key: apiKey.keyId,
        revoke_id: apiKey.revokeId,
        user_id: apiKey.userId,
        issuer: apiKey.issuer,
        oauth_client_id: apiKey.oauthClientId,
        name: apiKey.name,
        active_from: apiKey.activeFrom,
        revoked_at: null,
        expires_at: apiKey.expiresAt,
        scopes: apiKey.scopes
    });
}

function matchesPayload(record: StoredApiKeyRecord, payload: ApiKeyPayload) {
    return (
        record.key === payload.keyId &&
        record.user_id === payload.userId &&
        record.issuer === payload.issuer &&
        record.oauth_client_id === payload.oauthClientId &&
        record.active_from === payload.activeFrom &&
        record.expires_at === payload.expiresAt
    );
}

function resolveDefaultSessionScopes(userId: string, issuer: ApiKeyIssuer) {
    if (issuer === 'webapp') {
        return resolveUserMembershipEntitlements(userId).accountScopes;
    }

    return normalizeScopeList(
        useConfig().api.permissions.issuedKeyDefaultScopes
    );
}

function buildAuthSessionFromRecord(
    apiKey: string,
    record: ApiKeyRecord
): IssuedAuthSession {
    return {
        userId: record.user_id,
        keyId: record.key,
        revokeId: record.revoke_id,
        issuer: record.issuer,
        oauthClientId: record.oauth_client_id,
        name: record.name,
        apiKey,
        maskedApiKey: maskApiKey(apiKey),
        scopes: record.scopes,
        activeFrom: record.active_from,
        expiresAt: record.expires_at
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

    const storedRecord = authStatements.get<StoredApiKeyRecord>(
        'selectValidApiKey',
        keyId,
        now,
        now
    );
    if (!storedRecord) {
        apiKeyRecordCache.set(keyId, MISSING_API_KEY_RECORD, {
            ttl: 5 * 1000
        });
        return undefined;
    }

    const scopes = normalizeScopeList(
        authStatements
            .all<ApiKeyScopeRecord>('selectApiKeyScopesByKey', keyId)
            .map((row) => row.scope)
    );
    const record: ApiKeyRecord = {
        ...storedRecord,
        scopes
    };
    apiKeyRecordCache.set(keyId, record);
    return record;
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
    bannedUserCache.set(username, user?.is_banned === 1);
    return user;
}

export function isUserBanned(username: string) {
    const cached = bannedUserCache.get(username);
    if (cached !== undefined) {
        return cached;
    }

    const user = getUserByUsername(username);
    const isBanned = user?.is_banned === 1;
    bannedUserCache.set(username, isBanned);
    return isBanned;
}

export function assertUserNotBanned(username: string) {
    if (isUserBanned(username)) {
        throw new ApiRequestError(403, 'account_banned', '账号已被封禁');
    }
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
    assertUserNotBanned(userId);

    const issuer = options.issuer ?? 'webapp';
    const scopes =
        options.scopes ?? resolveDefaultSessionScopes(userId, issuer);
    const oauthClientId = options.oauthClientId ?? null;
    const keyId = createKeyId();
    const revokeId = createRevokeId();
    const apiKey = buildApiKeySession(
        userId,
        keyId,
        revokeId,
        options.name,
        scopes,
        issuer,
        oauthClientId,
        options.activeFrom,
        options.expiresAt
    );
    const insert = useUsersDatabase().transaction(() => {
        authStatements.run(
            'insertApiKey',
            apiKey.keyId,
            apiKey.revokeId,
            userId,
            apiKey.issuer,
            apiKey.oauthClientId,
            apiKey.name,
            apiKey.activeFrom,
            apiKey.expiresAt
        );
        insertApiKeyScopes(apiKey.keyId, apiKey.scopes);
    });

    insert();
    cacheIssuedApiKey(apiKey);

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
    const revokeId = createRevokeId();
    const issuer = options.issuer ?? 'webapp';
    const scopes =
        options.scopes ?? resolveDefaultSessionScopes(username, issuer);
    const oauthClientId = options.oauthClientId ?? null;
    const apiKey = buildApiKeySession(
        username,
        keyId,
        revokeId,
        options.name,
        scopes,
        issuer,
        oauthClientId,
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
            apiKey.revokeId,
            username,
            apiKey.issuer,
            apiKey.oauthClientId,
            apiKey.name,
            apiKey.activeFrom,
            apiKey.expiresAt
        );
        insertApiKeyScopes(apiKey.keyId, apiKey.scopes);
    });

    insert();
    userRecordCache.set(username, {
        username,
        salt,
        password_hash: passwordHash,
        created_at: createdAt,
        last_login_at: createdAt,
        is_banned: 0
    });
    bannedUserCache.set(username, false);
    cacheIssuedApiKey(apiKey);
    return apiKey;
}

export function changeUserPasswordWithApiKey(
    username: string,
    currentPassword: string,
    nextPassword: string
) {
    const user = getUserByUsername(username);
    if (!user || !verifyUserPassword(user, currentPassword)) {
        return undefined;
    }

    const nextSalt = createSalt();
    const nextPasswordHash = createPasswordHash(nextPassword, nextSalt);
    const issuer: ApiKeyIssuer = 'webapp';
    const scopes = resolveDefaultSessionScopes(username, issuer);
    const keyId = createKeyId();
    const revokeId = createRevokeId();
    const apiKey = buildApiKeySession(
        username,
        keyId,
        revokeId,
        undefined,
        scopes,
        issuer,
        null
    );
    const now = getNowSeconds();
    const update = useUsersDatabase().transaction(() => {
        authStatements.run(
            'updateUserPassword',
            nextSalt,
            nextPasswordHash,
            username
        );
        authStatements.run(
            'revokeApiKeysByUserAndIssuer',
            now,
            username,
            issuer
        );
        authStatements.run(
            'insertApiKey',
            apiKey.keyId,
            apiKey.revokeId,
            username,
            apiKey.issuer,
            apiKey.oauthClientId,
            apiKey.name,
            apiKey.activeFrom,
            apiKey.expiresAt
        );
        insertApiKeyScopes(apiKey.keyId, apiKey.scopes);
    });

    update();
    userRecordCache.set(username, {
        ...user,
        salt: nextSalt,
        password_hash: nextPasswordHash
    });
    apiKeyRecordCache.clear();
    cacheIssuedApiKey(apiKey);
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

export function revokeApiKeyByRevokeIdAndUser(
    revokeId: string,
    userId: string
) {
    const now = getNowSeconds();
    const result = authStatements.run(
        'revokeApiKeyByRevokeId',
        now,
        revokeId,
        userId
    );

    if (result.changes > 0) {
        apiKeyRecordCache.clear();
    }

    return result.changes > 0;
}

export function revokeApiKeysByIssuer(issuer: ApiKeyIssuer) {
    const now = getNowSeconds();
    const result = authStatements.run('revokeApiKeysByIssuer', now, issuer);

    if (result.changes > 0) {
        apiKeyRecordCache.clear();
    }

    return {
        revokedAt: now,
        revokedCount: result.changes
    };
}

export function revokeApiKeysByOauthClientId(oauthClientId: string) {
    const now = getNowSeconds();
    const result = authStatements.run(
        'revokeApiKeysByOauthClientId',
        now,
        oauthClientId
    );

    if (result.changes > 0) {
        apiKeyRecordCache.clear();
    }

    return {
        revokedAt: now,
        revokedCount: result.changes
    };
}

export function revokeApiKeysByUserAndOauthClientId(
    userId: string,
    oauthClientId: string
) {
    const now = getNowSeconds();
    const result = authStatements.run(
        'revokeApiKeysByUserAndOauthClientId',
        now,
        userId,
        oauthClientId
    );

    if (result.changes > 0) {
        apiKeyRecordCache.clear();
    }

    return {
        revokedAt: now,
        revokedCount: result.changes
    };
}

export function updateUserBanState(userId: string, isBanned: boolean) {
    const now = getNowSeconds();
    const nextValue = isBanned ? 1 : 0;
    const update = useUsersDatabase().transaction(() => {
        const user = authStatements.get<UserRecord>(
            'selectUserByUsername',
            userId
        );
        if (!user) {
            return undefined;
        }

        if (user.is_banned === nextValue) {
            const revokeResult = isBanned
                ? authStatements.run(
                      'revokeApiKeysByUserAndIssuer',
                      now,
                      userId,
                      'webapp'
                  )
                : null;

            return {
                user,
                changed: false,
                revokedWebappApiKeyCount: revokeResult?.changes ?? 0
            };
        }

        authStatements.run('updateUserBanState', nextValue, userId);
        const revokeResult = isBanned
            ? authStatements.run(
                  'revokeApiKeysByUserAndIssuer',
                  now,
                  userId,
                  'webapp'
              )
            : null;

        return {
            user: {
                ...user,
                is_banned: nextValue
            },
            changed: true,
            revokedWebappApiKeyCount: revokeResult?.changes ?? 0
        };
    });

    const result = update();
    if (!result) {
        return undefined;
    }

    userRecordCache.set(userId, result.user);
    bannedUserCache.set(userId, isBanned);
    if (result.revokedWebappApiKeyCount > 0) {
        apiKeyRecordCache.clear();
    }

    return {
        userId,
        isBanned,
        changed: result.changed,
        revokedWebappApiKeyCount: result.revokedWebappApiKeyCount,
        updatedAt: now
    };
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

    const hydratedPayload: ApiKeyPayload = {
        userId: payload.sub,
        keyId: payload.kid,
        issuer: payload.issuer,
        oauthClientId: storedRecord.oauth_client_id,
        activeFrom: payload.nbf,
        expiresAt: payload.exp
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
