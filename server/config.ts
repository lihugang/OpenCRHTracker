import fs from 'fs';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';
import { parseDailyTimeHHmm } from '~/server/utils/date/shanghaiDateTime';

interface CostPerRecordRule {
    unitCost: number;
    rounding: 'ceil';
}

interface ScheduleProbePrefixRule {
    prefix: string;
    minNo: number;
    maxNo: number;
}

interface ScheduleProbeRefreshConfig {
    batchSize: number;
    ttlHours: number;
    generateIntervalHours: number;
}

interface ScheduleProbeProbeConfig {
    defaultRetry: number;
    overlapRetryDelaySeconds: number;
    latestExecutionTimeHHmm: string;
}

interface ScheduleProbeCouplingConfig {
    statusResetTimeHHmm: string;
    detectDelaySeconds: number;
    detectCooldownSeconds: number;
}

interface ApiPermissionConfig {
    anonymousScopes: string[];
    issuedKeyDefaultScopes: string[];
    creatableKeyMaxScopes: string[];
}

interface OAuthDiscoveryConfig {
    enabled: boolean;
    externalBaseUrl: string;
}

interface OAuthIdTokenSigningConfig {
    kid: string;
    privateKeyPem: string;
    alg: 'RS256';
}

interface OAuthConfig {
    issuer: string;
    authorizationCodeTtlSeconds: number;
    accessTokenTtlSeconds: number;
    idTokenTtlSeconds: number;
    loginContinuationTtlSeconds: number;
    subjectSalt: string;
    pkce: {
        allowedMethods: ['S256'];
    };
    discovery: OAuthDiscoveryConfig;
    idTokenSigning: OAuthIdTokenSigningConfig;
}

interface FeedbackValidationLengthConfig {
    minLength: number;
    maxLength: number;
}

interface ApiKeyNameLengthConfig {
    minLength: number;
    maxLength: number;
}

interface ApiFeedbackConfig {
    validation: {
        createBody: FeedbackValidationLengthConfig;
        replyBody: FeedbackValidationLengthConfig;
        title: FeedbackValidationLengthConfig;
    };
}

interface ApiKeyCleanupConfig {
    retentionDays: number;
    dailyTimeHHmm: string;
}

interface DailyExportTaskConfig {
    dailyTimeHHmm: string;
}

interface ReferenceModelTaskConfig {
    windowDays: number;
    batchSize: number;
    threshold: number;
    dailyTimesHHmm: string[];
}

interface CirculationTaskConfig {
    windowDays: number;
    batchSize: number;
    threshold: number;
    dailyTimesHHmm: string[];
    stationBoard: {
        maxAttempts: number;
        retryDelaySeconds: number;
    };
}

interface ScheduleReadinessTaskConfig {
    rescheduleDelaySeconds: number;
}

interface LoggingConfig {
    retentionDays: number;
}

interface TypstCompilerServiceConfig {
    baseUrl: string;
    apiKey: string;
}

interface ResendEmailConfig {
    fromName: string;
    fromAddress: string;
    replyToAddress: string;
}

interface ResendServiceConfig {
    apiKey: string;
    emailApiUrl: string;
    requestTimeoutMs: number;
    maxRecipients: number;
    email: ResendEmailConfig;
}

interface QqBindingConfig {
    enabled: boolean;
    codeTtlSeconds: number;
    sendIntervalSeconds: number;
    banCorrelationWindowSeconds: number;
}

function normalizeEscapedPem(value: string) {
    return value.replace(/\\n/g, '\n');
}

const DEFAULT_PUSH_SUBSCRIPTION_SYNC_TIMEOUT_SECONDS = 30;
const DEFAULT_CLIENT_IP_HEADERS = [
    'cf-connecting-ip',
    'x-forwarded-for',
    'x-real-ip'
] as const;

const ALLOWED_STARTUP_TASK_EXECUTORS = [
    'build_today_schedule',
    'generate_route_refresh_tasks',
    'dispatch_daily_probe_tasks',
    'clear_daily_probe_status',
    'cleanup_revoked_api_keys',
    'export_daily_records',
    'rebuild_reference_model_index',
    'rebuild_train_circulation_index'
] as const;

type StartupTaskExecutor = (typeof ALLOWED_STARTUP_TASK_EXECUTORS)[number];

interface RefreshableAssetConfig {
    file: string;
    provider?: string;
    refresh: {
        enabled: boolean;
        refreshAt: string[];
    };
}

interface LocalAssetConfig {
    file: string;
}

interface RuntimeAdminTrafficConfig {
    file: string;
    flushIntervalMinutes: number;
}

interface RuntimeAdminServerMetricsConfig {
    file: string;
    flushIntervalMinutes: number;
    sampleIntervalSeconds: number;
}

interface RuntimeTrainProvenanceConfig {
    enabled: boolean;
    retentionDays: number;
}

export interface Config {
    spider: {
        userAgent: string;
        params: {
            // 12306 api
            eKey: string;
            jsonpCallback: string;
            routeProbeCarCode: string;
            guangzhouDiningSigningKey: string;
            guangzhouDiningDesKey: string;
        };
        rateLimit: Record<
            'search' | 'query' | 'stationBoard',
            {
                minIntervalMs: number;
            }
        >;
        scheduleProbe: {
            dailyTimeHHmm: string;
            retryAttempts: number;
            maxBatchSize: number;
            checkpointFlushEvery: number;
            prefixRules: ScheduleProbePrefixRule[];
            refresh: ScheduleProbeRefreshConfig;
            probe: ScheduleProbeProbeConfig;
            coupling: ScheduleProbeCouplingConfig;
        };
    };
    data: {
        assets: {
            EMUList: RefreshableAssetConfig;
            QRCode: RefreshableAssetConfig;
            guangzhouDiningMapping: LocalAssetConfig;
            stationCoord: RefreshableAssetConfig;
            trainStyleMapping: RefreshableAssetConfig;
            qrcodeDetection: RefreshableAssetConfig;
        };
        databases: Record<
            | 'task'
            | 'EMUTracked'
            | 'users'
            | 'feedback'
            | 'trainProvenance'
            | 'timetableHistory'
            | 'schedule',
            string
        >;
        runtime: {
            adminTraffic: RuntimeAdminTrafficConfig;
            adminServerMetrics: RuntimeAdminServerMetricsConfig;
            trainProvenance: RuntimeTrainProvenanceConfig;
        };
    };
    user: {
        saltLength: number;
        apiKeyPrefixes: {
            webapp: string;
            api: string;
            oauth: string;
        };
        adminUserIds: string[];
        favorites: {
            maxEntries: number;
        };
        pushSubscriptions: {
            maxDevices: number;
            maxEventSubscriptions: number;
            syncTimeoutSeconds: number;
        };
        push: {
            vapidPublicKey: string;
            vapidPrivateKey: string;
            vapidEmail: string;
        };
        qqBinding: QqBindingConfig;
        apiKeyBytes: number;
        apiKeyTtlSeconds: number;
        apiKeyMaxLifetimeSeconds: number;
        apiKeyNameLength: ApiKeyNameLengthConfig;
        signKey: string;
        scrypt: {
            keyLength: number;
            cost: number;
            blockSize: number;
            parallelization: number;
        };
    };
    api: {
        versionPrefix: string;
        apiKeyHeader: string;
        authCookieName: string;
        clientIpHeaders: string[];
        authRateLimit: {
            login: {
                maxRequests: number;
                windowSeconds: number;
            };
            register: {
                maxRequests: number;
                windowSeconds: number;
            };
            oauthAuthorize: {
                maxRequests: number;
                windowSeconds: number;
            };
            oauthToken: {
                maxRequests: number;
                windowSeconds: number;
            };
            qqCode: {
                maxRequests: number;
                windowSeconds: number;
            };
        };
        authCache: {
            userRecord: {
                maxEntries: number;
                defaultTtlSeconds: number;
            };
            apiKeyRecord: {
                maxEntries: number;
                defaultTtlSeconds: number;
            };
            userProfile: {
                maxEntries: number;
                defaultTtlSeconds: number;
            };
        };
        payload: {
            maxStringLength: number;
        };
        feedback: ApiFeedbackConfig;
        headers: {
            remain: string;
            cost: string;
            retryAfter: string;
        };
        cache: {
            currentDayMaxAgeSeconds: number;
            historicalMaxAgeSeconds: number;
            searchIndexMaxAgeSeconds: number;
            sitemapMaxAgeSeconds: number;
            timetableMaxAgeSeconds: number;
        };
        pagination: {
            defaultLimit: number;
            maxLimit: number;
        };
        timestampUnit: 'seconds';
        debug: {
            enableEchoError: boolean;
        };
        permissions: ApiPermissionConfig;
    };
    oauth: OAuthConfig;
    services: {
        typstCompiler: TypstCompilerServiceConfig;
        resend: ResendServiceConfig;
    };
    task: {
        startup: {
            disabledExecutors: StartupTaskExecutor[];
        };
        apiKeyCleanup: ApiKeyCleanupConfig;
        dailyExport: DailyExportTaskConfig;
        referenceModel: ReferenceModelTaskConfig;
        circulation: CirculationTaskConfig;
        scheduleReadiness: ScheduleReadinessTaskConfig;
        scheduler: {
            pollIntervalMs: number;
            maxTasksPerQuery: number;
            idle: {
                maxTasksPerTick: number;
                emaAlpha: number;
            };
        };
    };
    logging: LoggingConfig;
    quota: {
        anonymousMaxTokens: number;
        userMaxTokens: number;
        refillAmount: number;
        refillIntervalSeconds: number;
        resetToMaxOnRestart: boolean;
        consumeTokens: boolean;
    };
    cost: {
        fixed: {
            health: number;
            authMe: number;
            authLogout: number;
            authChangePassword: number;
            authSendQqBindingCode: number;
            authVerifyQqBinding: number;
            authUnbindQqBinding: number;
            debugEchoError: number;
            authIssueApiKey: number;
            authCreateOauthClient: number;
            authDeleteOauthClient: number;
            authListApiKeys: number;
            authRevokeApiKey: number;
            authListAuthorizations: number;
            authRevokeAuthorization: number;
            authListSubscriptions: number;
            authUpsertSubscription: number;
            authUpdateSubscription: number;
            authDeleteSubscription: number;
            searchIndex: number;
            allocationEmu: number;
            timetableTrainCurrent: number;
            trainCirculationImageCacheHit: number;
            trainCirculationImage: number;
            trainCirculationImageFailure: number;
            timetableTrainHistory: number;
            exportDailyIndex: number;
            exportDaily: number;
        };
        perRecord: {
            historyEmu: CostPerRecordRule;
            historyTrain: CostPerRecordRule;
            recordsDaily: CostPerRecordRule;
            timetableTrainHistory: CostPerRecordRule;
            timetableStation: CostPerRecordRule;
        };
    };
}

let config: Config | null = null;
const DEV_CONFIG_PATH = 'data/config.dev.json';
const PROD_CONFIG_PATH = 'data/config.prod.json';
const DEFAULT_CONFIG_PATH = 'data/config.json';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Invalid config: ${message}`);
    }
}

function asObject(value: unknown, name: string): Record<string, unknown> {
    assert(
        typeof value === 'object' && value !== null && !Array.isArray(value),
        `${name} must be an object`
    );
    return value as Record<string, unknown>;
}

function asArray(value: unknown, name: string): Array<unknown> {
    assert(Array.isArray(value), `${name} must be an array`);
    return value;
}

function asString(value: unknown, name: string): string {
    assert(
        typeof value === 'string' && value.length > 0,
        `${name} must be a non-empty string`
    );
    return value;
}

function asPlainString(value: unknown, name: string): string {
    assert(typeof value === 'string', `${name} must be a string`);
    return value;
}

function asNumber(value: unknown, name: string, min: number): number {
    assert(
        typeof value === 'number' && Number.isFinite(value),
        `${name} must be a finite number`
    );
    assert(value >= min, `${name} must be >= ${min}`);
    return value;
}

function asInteger(value: unknown, name: string, min: number): number {
    assert(
        typeof value === 'number' &&
            Number.isFinite(value) &&
            Number.isInteger(value),
        `${name} must be an integer`
    );
    assert(value >= min, `${name} must be >= ${min}`);
    return value;
}

function asBoolean(value: unknown, name: string): boolean {
    assert(typeof value === 'boolean', `${name} must be a boolean`);
    return value;
}

function asRounding(value: unknown, name: string): 'ceil' {
    assert(value === 'ceil', `${name} must be 'ceil'`);
    return 'ceil';
}

function asOptionalObject(
    value: unknown,
    name: string
): Record<string, unknown> | undefined {
    if (value === undefined) {
        return undefined;
    }
    return asObject(value, name);
}

function normalizeUniqueStringList(values: Iterable<string>) {
    const deduped = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const normalized = value.trim();
        if (normalized.length === 0 || deduped.has(normalized)) {
            continue;
        }

        deduped.add(normalized);
        result.push(normalized);
    }

    return result;
}

function parseNonEmptyStringList(value: unknown, name: string) {
    return normalizeUniqueStringList(
        asArray(value, name).map((item, index) =>
            asString(item, `${name}[${index}]`)
        )
    );
}

function parseUniqueNonEmptyStringArray(value: unknown, name: string) {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const [index, item] of asArray(value, name).entries()) {
        const normalized = asString(item, `${name}[${index}]`).trim();
        assert(
            normalized.length > 0,
            `${name}[${index}] must be a non-empty string`
        );
        assert(
            !seen.has(normalized),
            `${name}[${index}] is duplicated: ${normalized}`
        );
        seen.add(normalized);
        result.push(normalized);
    }

    assert(result.length > 0, `${name} must not be empty`);
    result.sort((left, right) => left.localeCompare(right));
    return result;
}

function parseClientIpHeaderList(value: unknown, name: string) {
    const headers = normalizeUniqueStringList(
        asArray(value, name).map((item, index) =>
            asPlainString(item, `${name}[${index}]`).trim().toLowerCase()
        )
    );
    assert(
        headers.length > 0,
        `${name} must contain at least one non-empty string`
    );
    return headers;
}

function parseEnvList(rawValue: string | undefined) {
    if (!rawValue) {
        return [];
    }

    return normalizeUniqueStringList(rawValue.split(','));
}

export function assertValidEmailAddress(value: string, name: string) {
    assert(
        !value.toLowerCase().startsWith('mailto:'),
        `${name} must be a plain email address without the mailto: prefix`
    );
    assert(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        `${name} must be a valid email address`
    );
}

function parseRefreshableAssetConfig(
    value: unknown,
    name: string
): RefreshableAssetConfig {
    const asset = asObject(value, name);
    const refresh = asOptionalObject(asset.refresh, `${name}.refresh`);

    return {
        file: asString(asset.file, `${name}.file`),
        provider: (() => {
            if (asset.provider === undefined) {
                return undefined;
            }
            return asString(asset.provider, `${name}.provider`);
        })(),
        refresh: {
            enabled:
                refresh?.enabled === undefined
                    ? true
                    : asBoolean(refresh.enabled, `${name}.refresh.enabled`),
            refreshAt:
                refresh?.refreshAt === undefined
                    ? ['0000']
                    : parseUniqueNonEmptyStringArray(
                          refresh.refreshAt,
                          `${name}.refresh.refreshAt`
                      )
        }
    };
}

function parseLocalAssetConfig(value: unknown, name: string): LocalAssetConfig {
    const asset = asObject(value, name);

    return {
        file: asString(asset.file, `${name}.file`)
    };
}

function parseScopeList(value: unknown, name: string) {
    const rawScopes = asArray(value, name).map((scope, index) =>
        asString(scope, `${name}[${index}]`)
    );

    return normalizeScopeList(rawScopes);
}

function parseDailyTimesHHmm(value: unknown, name: string) {
    const rawDailyTimesHHmm = asArray(value, name);
    assert(rawDailyTimesHHmm.length > 0, `${name} must not be empty`);

    const dedupedDailyTimesHHmm = new Set<string>();
    const dailyTimesHHmm = rawDailyTimesHHmm.map((item, index) => {
        const dailyTimeHHmm = asPlainString(item, `${name}[${index}]`).trim();
        assert(
            dailyTimeHHmm.length > 0,
            `${name}[${index}] must be a non-empty string`
        );
        try {
            parseDailyTimeHHmm(dailyTimeHHmm);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            assert(false, `${name}[${index}] is invalid: ${message}`);
        }
        assert(
            !dedupedDailyTimesHHmm.has(dailyTimeHHmm),
            `${name}[${index}] has duplicated time: ${dailyTimeHHmm}`
        );
        dedupedDailyTimesHHmm.add(dailyTimeHHmm);
        return dailyTimeHHmm;
    });

    dailyTimesHHmm.sort((left, right) => left.localeCompare(right));
    return dailyTimesHHmm;
}

function validateConfig(raw: unknown): Config {
    const root = asObject(raw, 'root');

    const spider = asObject(root.spider, 'spider');
    const spiderParams = asObject(spider.params, 'spider.params');
    const spiderRateLimit = asObject(spider.rateLimit, 'spider.rateLimit');
    const spiderRateLimitQuery = asObject(
        spiderRateLimit.query,
        'spider.rateLimit.query'
    );
    const spiderRateLimitSearch = asObject(
        spiderRateLimit.search,
        'spider.rateLimit.search'
    );
    const spiderRateLimitStationBoard = asObject(
        spiderRateLimit.stationBoard,
        'spider.rateLimit.stationBoard'
    );
    const spiderScheduleProbe = asObject(
        spider.scheduleProbe,
        'spider.scheduleProbe'
    );
    const spiderScheduleProbeRefresh = asObject(
        spiderScheduleProbe.refresh,
        'spider.scheduleProbe.refresh'
    );
    const spiderScheduleProbeProbe = asObject(
        spiderScheduleProbe.probe,
        'spider.scheduleProbe.probe'
    );
    const spiderScheduleProbeCoupling = asObject(
        spiderScheduleProbe.coupling,
        'spider.scheduleProbe.coupling'
    );
    const spiderScheduleProbePrefixRules = asArray(
        spiderScheduleProbe.prefixRules,
        'spider.scheduleProbe.prefixRules'
    );

    const data = asObject(root.data, 'data');
    const assets = asObject(data.assets, 'data.assets');
    const databases = asObject(data.databases, 'data.databases');
    const runtime = asObject(data.runtime, 'data.runtime');
    const runtimeAdminTraffic = asObject(
        runtime.adminTraffic,
        'data.runtime.adminTraffic'
    );
    const runtimeAdminServerMetrics = asObject(
        runtime.adminServerMetrics,
        'data.runtime.adminServerMetrics'
    );
    const runtimeTrainProvenance = asOptionalObject(
        runtime.trainProvenance,
        'data.runtime.trainProvenance'
    );

    const user = asObject(root.user, 'user');
    const userScrypt = asObject(user.scrypt, 'user.scrypt');
    const userPushSubscriptions = asObject(
        user.pushSubscriptions,
        'user.pushSubscriptions'
    );
    const userQqBinding =
        user.qqBinding === undefined
            ? {
                  enabled: false,
                  codeTtlSeconds: 1800,
                  sendIntervalSeconds: 120,
                  banCorrelationWindowSeconds: 72 * 60 * 60
              }
            : asObject(user.qqBinding, 'user.qqBinding');
    const userApiKeyPrefixes = asOptionalObject(
        user.apiKeyPrefixes,
        'user.apiKeyPrefixes'
    );
    const userApiKeyNameLength =
        user.apiKeyNameLength === undefined
            ? {
                  minLength: 1,
                  maxLength: 64
              }
            : asObject(user.apiKeyNameLength, 'user.apiKeyNameLength');
    const legacyApiKeyPrefix =
        user.apiKeyPrefix === undefined
            ? undefined
            : asString(user.apiKeyPrefix, 'user.apiKeyPrefix');
    const configAdminUserIds =
        user.adminUserIds === undefined
            ? []
            : parseNonEmptyStringList(user.adminUserIds, 'user.adminUserIds');
    const envAdminUserIdsRaw = process.env.OCRH_ADMIN_USERS?.trim();
    const envAdminUserIds = parseEnvList(envAdminUserIdsRaw);
    const envSignKey = process.env.OCRH_SIGN_KEY?.trim();
    const envOauthIdTokenSigningKid =
        process.env.OCRH_OAUTH_ID_TOKEN_SIGNING_KID?.trim();
    const envOauthIdTokenSigningPrivateKeyRaw =
        process.env.OCRH_OAUTH_ID_TOKEN_SIGNING_PRIVATE_KEY?.trim();
    const envOauthIdTokenSigningPrivateKey =
        envOauthIdTokenSigningPrivateKeyRaw &&
        envOauthIdTokenSigningPrivateKeyRaw.length > 0
            ? normalizeEscapedPem(envOauthIdTokenSigningPrivateKeyRaw)
            : undefined;
    const userPush =
        user.push === undefined ? undefined : asObject(user.push, 'user.push');
    const envVapidPublicKey = process.env.OCRH_VAPID_PUBLIC_KEY?.trim();
    const envVapidPrivateKey = process.env.OCRH_VAPID_PRIVATE_KEY?.trim();
    const envVapidEmail = process.env.OCRH_VAPID_EMAIL?.trim();
    const configSignKey =
        user.signKey === undefined
            ? ''
            : asString(user.signKey, 'user.signKey');
    const configVapidPublicKey =
        userPush?.vapidPublicKey === undefined
            ? ''
            : asPlainString(
                  userPush.vapidPublicKey,
                  'user.push.vapidPublicKey'
              ).trim();
    const configVapidPrivateKey =
        userPush?.vapidPrivateKey === undefined
            ? ''
            : asPlainString(
                  userPush.vapidPrivateKey,
                  'user.push.vapidPrivateKey'
              ).trim();
    const configVapidEmail =
        userPush?.vapidEmail === undefined
            ? ''
            : asPlainString(userPush.vapidEmail, 'user.push.vapidEmail').trim();
    const oauth = asObject(root.oauth, 'oauth');
    const oauthIdTokenSigning = asObject(
        oauth.idTokenSigning,
        'oauth.idTokenSigning'
    );
    const configOauthIdTokenSigningKid =
        oauthIdTokenSigning.kid === undefined
            ? ''
            : asString(oauthIdTokenSigning.kid, 'oauth.idTokenSigning.kid');
    const configOauthIdTokenSigningPrivateKey =
        oauthIdTokenSigning.privateKeyPem === undefined
            ? ''
            : asPlainString(
                  oauthIdTokenSigning.privateKeyPem,
                  'oauth.idTokenSigning.privateKeyPem'
              ).trim();
    const signKey =
        envSignKey && envSignKey.length > 0 ? envSignKey : configSignKey;
    const vapidPublicKey =
        envVapidPublicKey && envVapidPublicKey.length > 0
            ? envVapidPublicKey
            : configVapidPublicKey;
    const vapidPrivateKey =
        envVapidPrivateKey && envVapidPrivateKey.length > 0
            ? envVapidPrivateKey
            : configVapidPrivateKey;
    const vapidEmail =
        envVapidEmail && envVapidEmail.length > 0
            ? envVapidEmail
            : configVapidEmail;
    const oauthIdTokenSigningKid =
        envOauthIdTokenSigningKid && envOauthIdTokenSigningKid.length > 0
            ? envOauthIdTokenSigningKid
            : configOauthIdTokenSigningKid;
    const oauthIdTokenSigningPrivateKey =
        envOauthIdTokenSigningPrivateKey &&
        envOauthIdTokenSigningPrivateKey.length > 0
            ? envOauthIdTokenSigningPrivateKey
            : configOauthIdTokenSigningPrivateKey;
    const adminUserIds =
        envAdminUserIdsRaw && envAdminUserIdsRaw.length > 0
            ? envAdminUserIds
            : configAdminUserIds;

    if (configVapidEmail.length > 0) {
        assertValidEmailAddress(configVapidEmail, 'user.push.vapidEmail');
    }
    if (envVapidEmail && envVapidEmail.length > 0) {
        assertValidEmailAddress(envVapidEmail, 'process.env.OCRH_VAPID_EMAIL');
    }

    assert(signKey.length > 0, 'user.signKey must be configured');
    if (
        !import.meta.dev &&
        (!envAdminUserIdsRaw || envAdminUserIdsRaw.length === 0) &&
        configAdminUserIds.length > 0
    ) {
        console.warn(
            '[config] WARNING: OCRH admin users were loaded from config instead of process.env.OCRH_ADMIN_USERS'
        );
    }
    if (!import.meta.dev && (!envSignKey || envSignKey.length === 0)) {
        console.warn(
            '[config] WARNING: OCRH signing key was loaded from config instead of process.env.OCRH_SIGN_KEY'
        );
    }
    if (
        !import.meta.dev &&
        (!envOauthIdTokenSigningKid ||
            envOauthIdTokenSigningKid.length === 0) &&
        configOauthIdTokenSigningKid.length > 0
    ) {
        console.warn(
            '[config] WARNING: OAuth id_token signing kid was loaded from config instead of process.env.OCRH_OAUTH_ID_TOKEN_SIGNING_KID'
        );
    }
    if (
        !import.meta.dev &&
        (!envOauthIdTokenSigningPrivateKeyRaw ||
            envOauthIdTokenSigningPrivateKeyRaw.length === 0) &&
        configOauthIdTokenSigningPrivateKey.length > 0
    ) {
        console.warn(
            '[config] WARNING: OAuth id_token signing private key was loaded from config instead of process.env.OCRH_OAUTH_ID_TOKEN_SIGNING_PRIVATE_KEY'
        );
    }
    if (
        !import.meta.dev &&
        (!envVapidPublicKey || envVapidPublicKey.length === 0) &&
        configVapidPublicKey.length > 0
    ) {
        console.warn(
            '[config] WARNING: OCRH VAPID public key was loaded from config instead of process.env.OCRH_VAPID_PUBLIC_KEY'
        );
    }
    if (
        !import.meta.dev &&
        (!envVapidPrivateKey || envVapidPrivateKey.length === 0) &&
        configVapidPrivateKey.length > 0
    ) {
        console.warn(
            '[config] WARNING: OCRH VAPID private key was loaded from config instead of process.env.OCRH_VAPID_PRIVATE_KEY'
        );
    }
    if (
        !import.meta.dev &&
        (!envVapidEmail || envVapidEmail.length === 0) &&
        configVapidEmail.length > 0
    ) {
        console.warn(
            '[config] WARNING: OCRH VAPID email was loaded from config instead of process.env.OCRH_VAPID_EMAIL'
        );
    }

    const api = asObject(root.api, 'api');
    const apiClientIpHeaders =
        api.clientIpHeaders === undefined
            ? [...DEFAULT_CLIENT_IP_HEADERS]
            : parseClientIpHeaderList(
                  api.clientIpHeaders,
                  'api.clientIpHeaders'
              );
    const apiAuthRateLimit = asObject(api.authRateLimit, 'api.authRateLimit');
    const apiAuthRateLimitLogin = asObject(
        apiAuthRateLimit.login,
        'api.authRateLimit.login'
    );
    const apiAuthRateLimitRegister = asObject(
        apiAuthRateLimit.register,
        'api.authRateLimit.register'
    );
    const apiAuthRateLimitOauthAuthorize = asObject(
        apiAuthRateLimit.oauthAuthorize,
        'api.authRateLimit.oauthAuthorize'
    );
    const apiAuthRateLimitOauthToken = asObject(
        apiAuthRateLimit.oauthToken,
        'api.authRateLimit.oauthToken'
    );
    const apiAuthRateLimitQqCode =
        apiAuthRateLimit.qqCode === undefined
            ? { maxRequests: 5, windowSeconds: 3600 }
            : asObject(apiAuthRateLimit.qqCode, 'api.authRateLimit.qqCode');
    const apiAuthCache = asObject(api.authCache, 'api.authCache');
    const apiAuthCacheUserRecord = asObject(
        apiAuthCache.userRecord,
        'api.authCache.userRecord'
    );
    const apiAuthCacheApiKeyRecord = asObject(
        apiAuthCache.apiKeyRecord,
        'api.authCache.apiKeyRecord'
    );
    const apiAuthCacheUserProfile = asObject(
        apiAuthCache.userProfile,
        'api.authCache.userProfile'
    );
    const apiPayload = asObject(api.payload, 'api.payload');
    const apiFeedback = asObject(api.feedback, 'api.feedback');
    const apiFeedbackValidation = asObject(
        apiFeedback.validation,
        'api.feedback.validation'
    );
    const apiFeedbackValidationCreateBody = asObject(
        apiFeedbackValidation.createBody,
        'api.feedback.validation.createBody'
    );
    const apiFeedbackValidationReplyBody = asObject(
        apiFeedbackValidation.replyBody,
        'api.feedback.validation.replyBody'
    );
    const apiFeedbackValidationTitle = asObject(
        apiFeedbackValidation.title,
        'api.feedback.validation.title'
    );
    const apiHeaders = asObject(api.headers, 'api.headers');
    const apiCache = asObject(api.cache, 'api.cache');
    const apiPagination = asObject(api.pagination, 'api.pagination');
    const apiDebug = asObject(api.debug, 'api.debug');
    const apiPermissions = asObject(api.permissions, 'api.permissions');
    const oauthPkce = asObject(oauth.pkce, 'oauth.pkce');
    const oauthDiscovery = asObject(oauth.discovery, 'oauth.discovery');
    const services = asObject(root.services, 'services');
    const typstCompiler = asObject(
        services.typstCompiler,
        'services.typstCompiler'
    );
    const envTypstCompilerApiKey =
        process.env.OCRH_TYPST_COMPILER_API_KEY?.trim();
    const configTypstCompilerApiKey =
        typstCompiler.apiKey === undefined
            ? ''
            : asString(
                  typstCompiler.apiKey,
                  'services.typstCompiler.apiKey'
              ).trim();
    const typstCompilerApiKey =
        envTypstCompilerApiKey && envTypstCompilerApiKey.length > 0
            ? envTypstCompilerApiKey
            : configTypstCompilerApiKey;
    if (
        !import.meta.dev &&
        (!envTypstCompilerApiKey || envTypstCompilerApiKey.length === 0) &&
        configTypstCompilerApiKey.length > 0
    ) {
        console.warn(
            '[config] WARNING: Typst compiler API key was loaded from config instead of process.env.OCRH_TYPST_COMPILER_API_KEY'
        );
    }
    const resend = asOptionalObject(services.resend, 'services.resend');
    const resendEmail = asOptionalObject(
        resend?.email,
        'services.resend.email'
    );
    const envResendApiKey = process.env.OCRH_RESEND_API_KEY?.trim();
    const configResendApiKey =
        resend?.apiKey === undefined
            ? ''
            : asPlainString(resend.apiKey, 'services.resend.apiKey').trim();
    const resendApiKey =
        envResendApiKey && envResendApiKey.length > 0
            ? envResendApiKey
            : configResendApiKey;
    if (resendApiKey.length > 0) {
        assert(
            /^\S+$/.test(resendApiKey) && !/^Bearer\s/i.test(resendApiKey),
            'services.resend.apiKey must be a raw Resend API key without the Bearer prefix'
        );
    }
    const resendEmailFromAddress =
        resendEmail?.fromAddress === undefined
            ? ''
            : asPlainString(
                  resendEmail.fromAddress,
                  'services.resend.email.fromAddress'
              ).trim();
    const resendEmailReplyToAddress =
        resendEmail?.replyToAddress === undefined
            ? ''
            : asPlainString(
                  resendEmail.replyToAddress,
                  'services.resend.email.replyToAddress'
              ).trim();
    if (resendEmailFromAddress.length > 0) {
        assertValidEmailAddress(
            resendEmailFromAddress,
            'services.resend.email.fromAddress'
        );
    }
    if (resendEmailReplyToAddress.length > 0) {
        assertValidEmailAddress(
            resendEmailReplyToAddress,
            'services.resend.email.replyToAddress'
        );
    }
    const resendEmailApiUrl =
        resend?.emailApiUrl === undefined
            ? ''
            : asPlainString(resend.emailApiUrl, 'services.resend.emailApiUrl')
                  .trim()
                  .replace(/\/+$/, '');
    const resendRequestTimeoutMs =
        resend?.requestTimeoutMs === undefined
            ? 0
            : asInteger(
                  resend.requestTimeoutMs,
                  'services.resend.requestTimeoutMs',
                  1
              );
    const resendMaxRecipients =
        resend?.maxRecipients === undefined
            ? 0
            : asInteger(
                  resend.maxRecipients,
                  'services.resend.maxRecipients',
                  1
              );
    assert(
        resendMaxRecipients <= 50,
        'services.resend.maxRecipients must be <= 50'
    );
    const qqBindingEnabled = asBoolean(
        userQqBinding.enabled,
        'user.qqBinding.enabled'
    );
    const qqBindingCodeTtlSeconds = asInteger(
        userQqBinding.codeTtlSeconds,
        'user.qqBinding.codeTtlSeconds',
        1
    );
    const qqBindingSendIntervalSeconds = asInteger(
        userQqBinding.sendIntervalSeconds,
        'user.qqBinding.sendIntervalSeconds',
        1
    );
    const qqBindingBanCorrelationWindowSeconds =
        userQqBinding.banCorrelationWindowSeconds === undefined
            ? 72 * 60 * 60
            : asInteger(
                  userQqBinding.banCorrelationWindowSeconds,
                  'user.qqBinding.banCorrelationWindowSeconds',
                  1
              );
    if (resendEmailApiUrl.length > 0) {
        let parsedResendEmailApiUrl: URL;
        try {
            parsedResendEmailApiUrl = new URL(resendEmailApiUrl);
        } catch {
            throw new Error(
                'Invalid config: services.resend.emailApiUrl must be a valid URL'
            );
        }
        assert(
            parsedResendEmailApiUrl.protocol === 'https:',
            'services.resend.emailApiUrl must use https'
        );
    }
    if (qqBindingEnabled) {
        assert(
            resendApiKey.length > 0,
            'services.resend.apiKey is required when user.qqBinding.enabled is true'
        );
        assert(
            resendEmailApiUrl.length > 0,
            'services.resend.emailApiUrl is required when user.qqBinding.enabled is true'
        );
        assert(
            resendRequestTimeoutMs > 0,
            'services.resend.requestTimeoutMs is required when user.qqBinding.enabled is true'
        );
        assert(
            resendMaxRecipients > 0,
            'services.resend.maxRecipients is required when user.qqBinding.enabled is true'
        );
        assert(
            resendEmailFromAddress.length > 0,
            'services.resend.email.fromAddress is required when user.qqBinding.enabled is true'
        );
    }
    if (
        !import.meta.dev &&
        (!envResendApiKey || envResendApiKey.length === 0) &&
        configResendApiKey.length > 0
    ) {
        console.warn(
            '[config] WARNING: Resend API key was loaded from config instead of process.env.OCRH_RESEND_API_KEY'
        );
    }
    const task = asObject(root.task, 'task');
    const taskStartup =
        task.startup === undefined
            ? {}
            : asObject(task.startup, 'task.startup');
    const taskStartupDisabledExecutors =
        taskStartup.disabledExecutors === undefined
            ? []
            : asArray(
                  taskStartup.disabledExecutors,
                  'task.startup.disabledExecutors'
              );
    const taskApiKeyCleanup = asObject(
        task.apiKeyCleanup,
        'task.apiKeyCleanup'
    );
    const taskDailyExport = asObject(task.dailyExport, 'task.dailyExport');
    const taskReferenceModel = asObject(
        task.referenceModel,
        'task.referenceModel'
    );
    const taskCirculation = asObject(task.circulation, 'task.circulation');
    const taskCirculationStationBoard = asObject(
        taskCirculation.stationBoard === undefined
            ? {}
            : taskCirculation.stationBoard,
        'task.circulation.stationBoard'
    );
    const taskScheduleReadiness = asObject(
        task.scheduleReadiness === undefined ? {} : task.scheduleReadiness,
        'task.scheduleReadiness'
    );
    const taskScheduler = asObject(task.scheduler, 'task.scheduler');
    const taskSchedulerIdle = asObject(
        taskScheduler.idle,
        'task.scheduler.idle'
    );
    const logging = asObject(root.logging, 'logging');

    const quota = asObject(root.quota, 'quota');

    const cost = asObject(root.cost, 'cost');
    const costFixed = asObject(cost.fixed, 'cost.fixed');
    const costPerRecord = asObject(cost.perRecord, 'cost.perRecord');
    const historyEmu = asObject(
        costPerRecord.historyEmu,
        'cost.perRecord.historyEmu'
    );
    const historyTrain = asObject(
        costPerRecord.historyTrain,
        'cost.perRecord.historyTrain'
    );
    const recordsDaily = asObject(
        costPerRecord.recordsDaily,
        'cost.perRecord.recordsDaily'
    );
    const timetableTrainHistory = asObject(
        costPerRecord.timetableTrainHistory,
        'cost.perRecord.timetableTrainHistory'
    );
    const timetableStation = asObject(
        costPerRecord.timetableStation,
        'cost.perRecord.timetableStation'
    );

    const configResult: Config = {
        spider: {
            userAgent: asString(spider.userAgent, 'spider.userAgent'),
            params: {
                eKey: asString(spiderParams.eKey, 'spider.params.eKey'),
                jsonpCallback: asString(
                    spiderParams.jsonpCallback,
                    'spider.params.jsonpCallback'
                ),
                routeProbeCarCode: asString(
                    spiderParams.routeProbeCarCode,
                    'spider.params.routeProbeCarCode'
                ),
                guangzhouDiningSigningKey: asString(
                    spiderParams.guangzhouDiningSigningKey,
                    'spider.params.guangzhouDiningSigningKey'
                ),
                guangzhouDiningDesKey: asString(
                    spiderParams.guangzhouDiningDesKey,
                    'spider.params.guangzhouDiningDesKey'
                )
            },
            rateLimit: {
                query: {
                    minIntervalMs: asNumber(
                        spiderRateLimitQuery.minIntervalMs,
                        'spider.rateLimit.query.minIntervalMs',
                        0
                    )
                },
                search: {
                    minIntervalMs: asNumber(
                        spiderRateLimitSearch.minIntervalMs,
                        'spider.rateLimit.search.minIntervalMs',
                        0
                    )
                },
                stationBoard: {
                    minIntervalMs: asNumber(
                        spiderRateLimitStationBoard.minIntervalMs,
                        'spider.rateLimit.stationBoard.minIntervalMs',
                        0
                    )
                }
            },
            scheduleProbe: {
                dailyTimeHHmm: asString(
                    spiderScheduleProbe.dailyTimeHHmm,
                    'spider.scheduleProbe.dailyTimeHHmm'
                ),
                retryAttempts: asInteger(
                    spiderScheduleProbe.retryAttempts,
                    'spider.scheduleProbe.retryAttempts',
                    1
                ),
                maxBatchSize: asInteger(
                    spiderScheduleProbe.maxBatchSize,
                    'spider.scheduleProbe.maxBatchSize',
                    1
                ),
                checkpointFlushEvery: asInteger(
                    spiderScheduleProbe.checkpointFlushEvery,
                    'spider.scheduleProbe.checkpointFlushEvery',
                    1
                ),
                refresh: {
                    batchSize: asInteger(
                        spiderScheduleProbeRefresh.batchSize,
                        'spider.scheduleProbe.refresh.batchSize',
                        1
                    ),
                    ttlHours: asInteger(
                        spiderScheduleProbeRefresh.ttlHours,
                        'spider.scheduleProbe.refresh.ttlHours',
                        1
                    ),
                    generateIntervalHours: asInteger(
                        spiderScheduleProbeRefresh.generateIntervalHours,
                        'spider.scheduleProbe.refresh.generateIntervalHours',
                        1
                    )
                },
                probe: {
                    defaultRetry: asInteger(
                        spiderScheduleProbeProbe.defaultRetry,
                        'spider.scheduleProbe.probe.defaultRetry',
                        0
                    ),
                    overlapRetryDelaySeconds: asInteger(
                        spiderScheduleProbeProbe.overlapRetryDelaySeconds,
                        'spider.scheduleProbe.probe.overlapRetryDelaySeconds',
                        0
                    ),
                    latestExecutionTimeHHmm: asPlainString(
                        spiderScheduleProbeProbe.latestExecutionTimeHHmm ===
                            undefined
                            ? '2350'
                            : spiderScheduleProbeProbe.latestExecutionTimeHHmm,
                        'spider.scheduleProbe.probe.latestExecutionTimeHHmm'
                    )
                },
                coupling: {
                    statusResetTimeHHmm: asString(
                        spiderScheduleProbeCoupling.statusResetTimeHHmm,
                        'spider.scheduleProbe.coupling.statusResetTimeHHmm'
                    ),
                    detectDelaySeconds: asInteger(
                        spiderScheduleProbeCoupling.detectDelaySeconds,
                        'spider.scheduleProbe.coupling.detectDelaySeconds',
                        0
                    ),
                    detectCooldownSeconds: asInteger(
                        spiderScheduleProbeCoupling.detectCooldownSeconds,
                        'spider.scheduleProbe.coupling.detectCooldownSeconds',
                        0
                    )
                },
                prefixRules: spiderScheduleProbePrefixRules.map(
                    (ruleRaw, index) => {
                        const rule = asObject(
                            ruleRaw,
                            `spider.scheduleProbe.prefixRules[${index}]`
                        );
                        const prefix = asString(
                            rule.prefix,
                            `spider.scheduleProbe.prefixRules[${index}].prefix`
                        )
                            .trim()
                            .toUpperCase();
                        assert(
                            /^[A-Z]+$/.test(prefix),
                            `spider.scheduleProbe.prefixRules[${index}].prefix must contain only uppercase letters`
                        );

                        const minNo = asInteger(
                            rule.minNo,
                            `spider.scheduleProbe.prefixRules[${index}].minNo`,
                            1
                        );
                        const maxNo = asInteger(
                            rule.maxNo,
                            `spider.scheduleProbe.prefixRules[${index}].maxNo`,
                            1
                        );
                        assert(
                            maxNo >= minNo,
                            `spider.scheduleProbe.prefixRules[${index}].maxNo must be >= minNo`
                        );

                        return {
                            prefix,
                            minNo,
                            maxNo
                        };
                    }
                )
            }
        },
        data: {
            assets: {
                EMUList: parseRefreshableAssetConfig(
                    assets.EMUList,
                    'data.assets.EMUList'
                ),
                QRCode: parseRefreshableAssetConfig(
                    assets.QRCode,
                    'data.assets.QRCode'
                ),
                guangzhouDiningMapping: parseLocalAssetConfig(
                    assets.guangzhouDiningMapping,
                    'data.assets.guangzhouDiningMapping'
                ),
                stationCoord: parseRefreshableAssetConfig(
                    assets.stationCoord,
                    'data.assets.stationCoord'
                ),
                trainStyleMapping: parseRefreshableAssetConfig(
                    assets.trainStyleMapping,
                    'data.assets.trainStyleMapping'
                ),
                qrcodeDetection: parseRefreshableAssetConfig(
                    assets.qrcodeDetection,
                    'data.assets.qrcodeDetection'
                )
            },
            databases: {
                task: asString(databases.task, 'data.databases.task'),
                EMUTracked: asString(
                    databases.EMUTracked,
                    'data.databases.EMUTracked'
                ),
                users: asString(databases.users, 'data.databases.users'),
                feedback: asString(
                    databases.feedback,
                    'data.databases.feedback'
                ),
                trainProvenance:
                    databases.trainProvenance === undefined
                        ? 'data/train-provenance.db'
                        : asString(
                              databases.trainProvenance,
                              'data.databases.trainProvenance'
                          ),
                timetableHistory:
                    databases.timetableHistory === undefined
                        ? 'data/timetable-history.db'
                        : asString(
                              databases.timetableHistory,
                              'data.databases.timetableHistory'
                          ),
                schedule:
                    databases.schedule === undefined
                        ? 'data/schedule.db'
                        : asString(
                              databases.schedule,
                              'data.databases.schedule'
                          )
            },
            runtime: {
                adminTraffic: {
                    file: asString(
                        runtimeAdminTraffic.file,
                        'data.runtime.adminTraffic.file'
                    ),
                    flushIntervalMinutes: asInteger(
                        runtimeAdminTraffic.flushIntervalMinutes,
                        'data.runtime.adminTraffic.flushIntervalMinutes',
                        1
                    )
                },
                adminServerMetrics: {
                    file: asString(
                        runtimeAdminServerMetrics.file,
                        'data.runtime.adminServerMetrics.file'
                    ),
                    flushIntervalMinutes: asInteger(
                        runtimeAdminServerMetrics.flushIntervalMinutes,
                        'data.runtime.adminServerMetrics.flushIntervalMinutes',
                        1
                    ),
                    sampleIntervalSeconds: asInteger(
                        runtimeAdminServerMetrics.sampleIntervalSeconds,
                        'data.runtime.adminServerMetrics.sampleIntervalSeconds',
                        1
                    )
                },
                trainProvenance: {
                    enabled:
                        runtimeTrainProvenance === undefined
                            ? true
                            : asBoolean(
                                  runtimeTrainProvenance.enabled,
                                  'data.runtime.trainProvenance.enabled'
                              ),
                    retentionDays:
                        runtimeTrainProvenance === undefined
                            ? 7
                            : asInteger(
                                  runtimeTrainProvenance.retentionDays,
                                  'data.runtime.trainProvenance.retentionDays',
                                  1
                              )
                }
            }
        },
        user: {
            saltLength: asNumber(user.saltLength, 'user.saltLength', 8),
            apiKeyPrefixes: {
                webapp:
                    userApiKeyPrefixes === undefined
                        ? asString(legacyApiKeyPrefix, 'user.apiKeyPrefix')
                        : asString(
                              userApiKeyPrefixes.webapp,
                              'user.apiKeyPrefixes.webapp'
                          ),
                api:
                    userApiKeyPrefixes === undefined
                        ? asString(legacyApiKeyPrefix, 'user.apiKeyPrefix')
                        : asString(
                              userApiKeyPrefixes.api,
                              'user.apiKeyPrefixes.api'
                          ),
                oauth:
                    userApiKeyPrefixes === undefined
                        ? asString(legacyApiKeyPrefix, 'user.apiKeyPrefix')
                        : asString(
                              userApiKeyPrefixes.oauth,
                              'user.apiKeyPrefixes.oauth'
                          )
            },
            adminUserIds,
            favorites: {
                maxEntries: asInteger(
                    asObject(user.favorites, 'user.favorites').maxEntries,
                    'user.favorites.maxEntries',
                    1
                )
            },
            pushSubscriptions: {
                maxDevices: asInteger(
                    userPushSubscriptions.maxDevices,
                    'user.pushSubscriptions.maxDevices',
                    1
                ),
                maxEventSubscriptions: asInteger(
                    userPushSubscriptions.maxEventSubscriptions,
                    'user.pushSubscriptions.maxEventSubscriptions',
                    1
                ),
                syncTimeoutSeconds:
                    userPushSubscriptions.syncTimeoutSeconds === undefined
                        ? DEFAULT_PUSH_SUBSCRIPTION_SYNC_TIMEOUT_SECONDS
                        : asInteger(
                              userPushSubscriptions.syncTimeoutSeconds,
                              'user.pushSubscriptions.syncTimeoutSeconds',
                              1
                          )
            },
            push: {
                vapidPublicKey,
                vapidPrivateKey,
                vapidEmail
            },
            qqBinding: {
                enabled: qqBindingEnabled,
                codeTtlSeconds: qqBindingCodeTtlSeconds,
                sendIntervalSeconds: qqBindingSendIntervalSeconds,
                banCorrelationWindowSeconds:
                    qqBindingBanCorrelationWindowSeconds
            },
            apiKeyBytes: asNumber(user.apiKeyBytes, 'user.apiKeyBytes', 16),
            apiKeyTtlSeconds: asNumber(
                user.apiKeyTtlSeconds,
                'user.apiKeyTtlSeconds',
                60
            ),
            apiKeyMaxLifetimeSeconds:
                user.apiKeyMaxLifetimeSeconds === undefined
                    ? 157680000
                    : asNumber(
                          user.apiKeyMaxLifetimeSeconds,
                          'user.apiKeyMaxLifetimeSeconds',
                          60
                      ),
            apiKeyNameLength: {
                minLength: asInteger(
                    userApiKeyNameLength.minLength,
                    'user.apiKeyNameLength.minLength',
                    1
                ),
                maxLength: asInteger(
                    userApiKeyNameLength.maxLength,
                    'user.apiKeyNameLength.maxLength',
                    1
                )
            },
            signKey,
            scrypt: {
                keyLength: asNumber(
                    userScrypt.keyLength,
                    'user.scrypt.keyLength',
                    16
                ),
                cost: asNumber(userScrypt.cost, 'user.scrypt.cost', 2),
                blockSize: asNumber(
                    userScrypt.blockSize,
                    'user.scrypt.blockSize',
                    1
                ),
                parallelization: asNumber(
                    userScrypt.parallelization,
                    'user.scrypt.parallelization',
                    1
                )
            }
        },
        api: {
            versionPrefix: asString(api.versionPrefix, 'api.versionPrefix'),
            apiKeyHeader: asString(api.apiKeyHeader, 'api.apiKeyHeader'),
            authCookieName: asString(api.authCookieName, 'api.authCookieName'),
            clientIpHeaders: apiClientIpHeaders,
            authRateLimit: {
                login: {
                    maxRequests: asInteger(
                        apiAuthRateLimitLogin.maxRequests,
                        'api.authRateLimit.login.maxRequests',
                        1
                    ),
                    windowSeconds: asInteger(
                        apiAuthRateLimitLogin.windowSeconds,
                        'api.authRateLimit.login.windowSeconds',
                        1
                    )
                },
                register: {
                    maxRequests: asInteger(
                        apiAuthRateLimitRegister.maxRequests,
                        'api.authRateLimit.register.maxRequests',
                        1
                    ),
                    windowSeconds: asInteger(
                        apiAuthRateLimitRegister.windowSeconds,
                        'api.authRateLimit.register.windowSeconds',
                        1
                    )
                },
                oauthAuthorize: {
                    maxRequests: asInteger(
                        apiAuthRateLimitOauthAuthorize.maxRequests,
                        'api.authRateLimit.oauthAuthorize.maxRequests',
                        1
                    ),
                    windowSeconds: asInteger(
                        apiAuthRateLimitOauthAuthorize.windowSeconds,
                        'api.authRateLimit.oauthAuthorize.windowSeconds',
                        1
                    )
                },
                oauthToken: {
                    maxRequests: asInteger(
                        apiAuthRateLimitOauthToken.maxRequests,
                        'api.authRateLimit.oauthToken.maxRequests',
                        1
                    ),
                    windowSeconds: asInteger(
                        apiAuthRateLimitOauthToken.windowSeconds,
                        'api.authRateLimit.oauthToken.windowSeconds',
                        1
                    )
                },
                qqCode: {
                    maxRequests: asInteger(
                        apiAuthRateLimitQqCode.maxRequests,
                        'api.authRateLimit.qqCode.maxRequests',
                        1
                    ),
                    windowSeconds: asInteger(
                        apiAuthRateLimitQqCode.windowSeconds,
                        'api.authRateLimit.qqCode.windowSeconds',
                        1
                    )
                }
            },
            authCache: {
                userRecord: {
                    maxEntries: asInteger(
                        apiAuthCacheUserRecord.maxEntries,
                        'api.authCache.userRecord.maxEntries',
                        1
                    ),
                    defaultTtlSeconds: asInteger(
                        apiAuthCacheUserRecord.defaultTtlSeconds,
                        'api.authCache.userRecord.defaultTtlSeconds',
                        1
                    )
                },
                apiKeyRecord: {
                    maxEntries: asInteger(
                        apiAuthCacheApiKeyRecord.maxEntries,
                        'api.authCache.apiKeyRecord.maxEntries',
                        1
                    ),
                    defaultTtlSeconds: asInteger(
                        apiAuthCacheApiKeyRecord.defaultTtlSeconds,
                        'api.authCache.apiKeyRecord.defaultTtlSeconds',
                        1
                    )
                },
                userProfile: {
                    maxEntries: asInteger(
                        apiAuthCacheUserProfile.maxEntries,
                        'api.authCache.userProfile.maxEntries',
                        1
                    ),
                    defaultTtlSeconds: asInteger(
                        apiAuthCacheUserProfile.defaultTtlSeconds,
                        'api.authCache.userProfile.defaultTtlSeconds',
                        1
                    )
                }
            },
            payload: {
                maxStringLength: asInteger(
                    apiPayload.maxStringLength,
                    'api.payload.maxStringLength',
                    1
                )
            },
            feedback: {
                validation: {
                    createBody: {
                        minLength: asInteger(
                            apiFeedbackValidationCreateBody.minLength,
                            'api.feedback.validation.createBody.minLength',
                            0
                        ),
                        maxLength: asInteger(
                            apiFeedbackValidationCreateBody.maxLength,
                            'api.feedback.validation.createBody.maxLength',
                            1
                        )
                    },
                    replyBody: {
                        minLength: asInteger(
                            apiFeedbackValidationReplyBody.minLength,
                            'api.feedback.validation.replyBody.minLength',
                            0
                        ),
                        maxLength: asInteger(
                            apiFeedbackValidationReplyBody.maxLength,
                            'api.feedback.validation.replyBody.maxLength',
                            1
                        )
                    },
                    title: {
                        minLength: asInteger(
                            apiFeedbackValidationTitle.minLength,
                            'api.feedback.validation.title.minLength',
                            0
                        ),
                        maxLength: asInteger(
                            apiFeedbackValidationTitle.maxLength,
                            'api.feedback.validation.title.maxLength',
                            1
                        )
                    }
                }
            },
            headers: {
                remain: asString(apiHeaders.remain, 'api.headers.remain'),
                cost: asString(apiHeaders.cost, 'api.headers.cost'),
                retryAfter: asString(
                    apiHeaders.retryAfter,
                    'api.headers.retryAfter'
                )
            },
            cache: {
                currentDayMaxAgeSeconds: asInteger(
                    apiCache.currentDayMaxAgeSeconds,
                    'api.cache.currentDayMaxAgeSeconds',
                    0
                ),
                historicalMaxAgeSeconds: asInteger(
                    apiCache.historicalMaxAgeSeconds,
                    'api.cache.historicalMaxAgeSeconds',
                    0
                ),
                searchIndexMaxAgeSeconds: asInteger(
                    apiCache.searchIndexMaxAgeSeconds,
                    'api.cache.searchIndexMaxAgeSeconds',
                    0
                ),
                sitemapMaxAgeSeconds: asInteger(
                    apiCache.sitemapMaxAgeSeconds,
                    'api.cache.sitemapMaxAgeSeconds',
                    0
                ),
                timetableMaxAgeSeconds: asInteger(
                    apiCache.timetableMaxAgeSeconds,
                    'api.cache.timetableMaxAgeSeconds',
                    0
                )
            },
            pagination: {
                defaultLimit: asNumber(
                    apiPagination.defaultLimit,
                    'api.pagination.defaultLimit',
                    1
                ),
                maxLimit: asNumber(
                    apiPagination.maxLimit,
                    'api.pagination.maxLimit',
                    1
                )
            },
            timestampUnit: (() => {
                const unit = asString(api.timestampUnit, 'api.timestampUnit');
                assert(
                    unit === 'seconds',
                    'api.timestampUnit must be "seconds"'
                );
                return unit;
            })() as 'seconds',
            debug: {
                enableEchoError: asBoolean(
                    apiDebug.enableEchoError,
                    'api.debug.enableEchoError'
                )
            },
            permissions: {
                anonymousScopes: parseScopeList(
                    apiPermissions.anonymousScopes,
                    'api.permissions.anonymousScopes'
                ),
                issuedKeyDefaultScopes: parseScopeList(
                    apiPermissions.issuedKeyDefaultScopes,
                    'api.permissions.issuedKeyDefaultScopes'
                ),
                creatableKeyMaxScopes: parseScopeList(
                    apiPermissions.creatableKeyMaxScopes,
                    'api.permissions.creatableKeyMaxScopes'
                )
            }
        },
        oauth: {
            issuer: asString(oauth.issuer, 'oauth.issuer'),
            authorizationCodeTtlSeconds: asInteger(
                oauth.authorizationCodeTtlSeconds,
                'oauth.authorizationCodeTtlSeconds',
                1
            ),
            accessTokenTtlSeconds: asInteger(
                oauth.accessTokenTtlSeconds,
                'oauth.accessTokenTtlSeconds',
                1
            ),
            idTokenTtlSeconds: asInteger(
                oauth.idTokenTtlSeconds,
                'oauth.idTokenTtlSeconds',
                1
            ),
            loginContinuationTtlSeconds: asInteger(
                oauth.loginContinuationTtlSeconds,
                'oauth.loginContinuationTtlSeconds',
                1
            ),
            subjectSalt: asString(oauth.subjectSalt, 'oauth.subjectSalt'),
            pkce: {
                allowedMethods: (() => {
                    const methods = asArray(
                        oauthPkce.allowedMethods,
                        'oauth.pkce.allowedMethods'
                    ).map((method, index) =>
                        asString(method, `oauth.pkce.allowedMethods[${index}]`)
                    );
                    assert(
                        methods.length === 1 && methods[0] === 'S256',
                        'oauth.pkce.allowedMethods must be exactly ["S256"]'
                    );
                    return ['S256'] as ['S256'];
                })()
            },
            discovery: {
                enabled: asBoolean(
                    oauthDiscovery.enabled,
                    'oauth.discovery.enabled'
                ),
                externalBaseUrl: asString(
                    oauthDiscovery.externalBaseUrl,
                    'oauth.discovery.externalBaseUrl'
                ).replace(/\/+$/, '')
            },
            idTokenSigning: {
                kid: oauthIdTokenSigningKid,
                privateKeyPem: oauthIdTokenSigningPrivateKey,
                alg: (() => {
                    const alg = asString(
                        oauthIdTokenSigning.alg,
                        'oauth.idTokenSigning.alg'
                    );
                    assert(
                        alg === 'RS256',
                        'oauth.idTokenSigning.alg must be "RS256"'
                    );
                    return 'RS256' as const;
                })()
            }
        },
        services: {
            typstCompiler: {
                baseUrl: asString(
                    typstCompiler.baseUrl,
                    'services.typstCompiler.baseUrl'
                )
                    .trim()
                    .replace(/\/+$/, ''),
                apiKey: typstCompilerApiKey
            },
            resend: {
                apiKey: resendApiKey,
                emailApiUrl: resendEmailApiUrl,
                requestTimeoutMs: resendRequestTimeoutMs,
                maxRecipients: resendMaxRecipients,
                email: {
                    fromName:
                        resendEmail?.fromName === undefined
                            ? ''
                            : asPlainString(
                                  resendEmail.fromName,
                                  'services.resend.email.fromName'
                              ).trim(),
                    fromAddress: resendEmailFromAddress,
                    replyToAddress: resendEmailReplyToAddress
                }
            }
        },
        task: {
            startup: {
                disabledExecutors: taskStartupDisabledExecutors.map(
                    (executorRaw, index) => {
                        const executor = asString(
                            executorRaw,
                            `task.startup.disabledExecutors[${index}]`
                        ) as StartupTaskExecutor;
                        assert(
                            ALLOWED_STARTUP_TASK_EXECUTORS.includes(executor),
                            `task.startup.disabledExecutors[${index}] must be one of ${ALLOWED_STARTUP_TASK_EXECUTORS.join(', ')}`
                        );
                        return executor;
                    }
                )
            },
            apiKeyCleanup: {
                retentionDays: asInteger(
                    taskApiKeyCleanup.retentionDays,
                    'task.apiKeyCleanup.retentionDays',
                    1
                ),
                dailyTimeHHmm: asString(
                    taskApiKeyCleanup.dailyTimeHHmm,
                    'task.apiKeyCleanup.dailyTimeHHmm'
                )
            },
            dailyExport: {
                dailyTimeHHmm: asString(
                    taskDailyExport.dailyTimeHHmm,
                    'task.dailyExport.dailyTimeHHmm'
                )
            },
            referenceModel: {
                windowDays: asInteger(
                    taskReferenceModel.windowDays,
                    'task.referenceModel.windowDays',
                    1
                ),
                batchSize: asInteger(
                    taskReferenceModel.batchSize,
                    'task.referenceModel.batchSize',
                    1
                ),
                threshold: asNumber(
                    taskReferenceModel.threshold,
                    'task.referenceModel.threshold',
                    0
                ),
                dailyTimesHHmm: parseDailyTimesHHmm(
                    taskReferenceModel.dailyTimesHHmm,
                    'task.referenceModel.dailyTimesHHmm'
                )
            },
            circulation: {
                windowDays: asInteger(
                    taskCirculation.windowDays,
                    'task.circulation.windowDays',
                    1
                ),
                batchSize: asInteger(
                    taskCirculation.batchSize,
                    'task.circulation.batchSize',
                    1
                ),
                threshold: asNumber(
                    taskCirculation.threshold,
                    'task.circulation.threshold',
                    0
                ),
                dailyTimesHHmm: parseDailyTimesHHmm(
                    taskCirculation.dailyTimesHHmm,
                    'task.circulation.dailyTimesHHmm'
                ),
                stationBoard: {
                    maxAttempts: asInteger(
                        taskCirculationStationBoard.maxAttempts === undefined
                            ? 5
                            : taskCirculationStationBoard.maxAttempts,
                        'task.circulation.stationBoard.maxAttempts',
                        1
                    ),
                    retryDelaySeconds: asInteger(
                        taskCirculationStationBoard.retryDelaySeconds ===
                            undefined
                            ? 30 * 60
                            : taskCirculationStationBoard.retryDelaySeconds,
                        'task.circulation.stationBoard.retryDelaySeconds',
                        0
                    )
                }
            },
            scheduleReadiness: {
                rescheduleDelaySeconds: asInteger(
                    taskScheduleReadiness.rescheduleDelaySeconds === undefined
                        ? 30 * 60
                        : taskScheduleReadiness.rescheduleDelaySeconds,
                    'task.scheduleReadiness.rescheduleDelaySeconds',
                    0
                )
            },
            scheduler: {
                pollIntervalMs: asInteger(
                    taskScheduler.pollIntervalMs,
                    'task.scheduler.pollIntervalMs',
                    1000
                ),
                maxTasksPerQuery: asInteger(
                    taskScheduler.maxTasksPerQuery,
                    'task.scheduler.maxTasksPerQuery',
                    1
                ),
                idle: {
                    maxTasksPerTick: asInteger(
                        taskSchedulerIdle.maxTasksPerTick,
                        'task.scheduler.idle.maxTasksPerTick',
                        1
                    ),
                    emaAlpha: asNumber(
                        taskSchedulerIdle.emaAlpha,
                        'task.scheduler.idle.emaAlpha',
                        0
                    )
                }
            }
        },
        logging: {
            retentionDays: asInteger(
                logging.retentionDays,
                'logging.retentionDays',
                1
            )
        },
        quota: {
            anonymousMaxTokens: asNumber(
                quota.anonymousMaxTokens,
                'quota.anonymousMaxTokens',
                1
            ),
            userMaxTokens: asNumber(
                quota.userMaxTokens,
                'quota.userMaxTokens',
                1
            ),
            refillAmount: asNumber(quota.refillAmount, 'quota.refillAmount', 1),
            refillIntervalSeconds: asNumber(
                quota.refillIntervalSeconds,
                'quota.refillIntervalSeconds',
                1
            ),
            resetToMaxOnRestart: asBoolean(
                quota.resetToMaxOnRestart,
                'quota.resetToMaxOnRestart'
            ),
            consumeTokens: asBoolean(quota.consumeTokens, 'quota.consumeTokens')
        },
        cost: {
            fixed: {
                health: asNumber(costFixed.health, 'cost.fixed.health', 0),
                authMe: asNumber(costFixed.authMe, 'cost.fixed.authMe', 0),
                authLogout: asNumber(
                    costFixed.authLogout,
                    'cost.fixed.authLogout',
                    0
                ),
                authChangePassword: asNumber(
                    costFixed.authChangePassword,
                    'cost.fixed.authChangePassword',
                    0
                ),
                authSendQqBindingCode: asNumber(
                    costFixed.authSendQqBindingCode === undefined
                        ? 5
                        : costFixed.authSendQqBindingCode,
                    'cost.fixed.authSendQqBindingCode',
                    0
                ),
                authVerifyQqBinding: asNumber(
                    costFixed.authVerifyQqBinding === undefined
                        ? 5
                        : costFixed.authVerifyQqBinding,
                    'cost.fixed.authVerifyQqBinding',
                    0
                ),
                authUnbindQqBinding: asNumber(
                    costFixed.authUnbindQqBinding === undefined
                        ? 5
                        : costFixed.authUnbindQqBinding,
                    'cost.fixed.authUnbindQqBinding',
                    0
                ),
                debugEchoError: asNumber(
                    costFixed.debugEchoError,
                    'cost.fixed.debugEchoError',
                    0
                ),
                authIssueApiKey: asNumber(
                    costFixed.authIssueApiKey,
                    'cost.fixed.authIssueApiKey',
                    0
                ),
                authCreateOauthClient: asNumber(
                    costFixed.authCreateOauthClient,
                    'cost.fixed.authCreateOauthClient',
                    0
                ),
                authDeleteOauthClient: asNumber(
                    costFixed.authDeleteOauthClient,
                    'cost.fixed.authDeleteOauthClient',
                    0
                ),
                authListApiKeys: asNumber(
                    costFixed.authListApiKeys,
                    'cost.fixed.authListApiKeys',
                    0
                ),
                authRevokeApiKey: asNumber(
                    costFixed.authRevokeApiKey,
                    'cost.fixed.authRevokeApiKey',
                    0
                ),
                authListAuthorizations: asNumber(
                    costFixed.authListAuthorizations,
                    'cost.fixed.authListAuthorizations',
                    0
                ),
                authRevokeAuthorization: asNumber(
                    costFixed.authRevokeAuthorization,
                    'cost.fixed.authRevokeAuthorization',
                    0
                ),
                authListSubscriptions: asNumber(
                    costFixed.authListSubscriptions,
                    'cost.fixed.authListSubscriptions',
                    0
                ),
                authUpsertSubscription: asNumber(
                    costFixed.authUpsertSubscription,
                    'cost.fixed.authUpsertSubscription',
                    0
                ),
                authUpdateSubscription: asNumber(
                    costFixed.authUpdateSubscription,
                    'cost.fixed.authUpdateSubscription',
                    0
                ),
                authDeleteSubscription: asNumber(
                    costFixed.authDeleteSubscription,
                    'cost.fixed.authDeleteSubscription',
                    0
                ),
                searchIndex: asNumber(
                    costFixed.searchIndex,
                    'cost.fixed.searchIndex',
                    0
                ),
                allocationEmu: asNumber(
                    costFixed.allocationEmu,
                    'cost.fixed.allocationEmu',
                    1
                ),
                timetableTrainCurrent: asNumber(
                    costFixed.timetableTrainCurrent,
                    'cost.fixed.timetableTrainCurrent',
                    0
                ),
                trainCirculationImageCacheHit: asNumber(
                    costFixed.trainCirculationImageCacheHit,
                    'cost.fixed.trainCirculationImageCacheHit',
                    0
                ),
                trainCirculationImage: asNumber(
                    costFixed.trainCirculationImage,
                    'cost.fixed.trainCirculationImage',
                    0
                ),
                trainCirculationImageFailure: asNumber(
                    costFixed.trainCirculationImageFailure,
                    'cost.fixed.trainCirculationImageFailure',
                    0
                ),
                timetableTrainHistory: asNumber(
                    costFixed.timetableTrainHistory,
                    'cost.fixed.timetableTrainHistory',
                    0
                ),
                exportDailyIndex: asNumber(
                    costFixed.exportDailyIndex,
                    'cost.fixed.exportDailyIndex',
                    0
                ),
                exportDaily: asNumber(
                    costFixed.exportDaily,
                    'cost.fixed.exportDaily',
                    0
                )
            },
            perRecord: {
                historyEmu: {
                    unitCost: asNumber(
                        historyEmu.unitCost,
                        'cost.perRecord.historyEmu.unitCost',
                        0
                    ),
                    rounding: asRounding(
                        historyEmu.rounding,
                        'cost.perRecord.historyEmu.rounding'
                    )
                },
                historyTrain: {
                    unitCost: asNumber(
                        historyTrain.unitCost,
                        'cost.perRecord.historyTrain.unitCost',
                        0
                    ),
                    rounding: asRounding(
                        historyTrain.rounding,
                        'cost.perRecord.historyTrain.rounding'
                    )
                },
                recordsDaily: {
                    unitCost: asNumber(
                        recordsDaily.unitCost,
                        'cost.perRecord.recordsDaily.unitCost',
                        0
                    ),
                    rounding: asRounding(
                        recordsDaily.rounding,
                        'cost.perRecord.recordsDaily.rounding'
                    )
                },
                timetableTrainHistory: {
                    unitCost: asNumber(
                        timetableTrainHistory.unitCost,
                        'cost.perRecord.timetableTrainHistory.unitCost',
                        0
                    ),
                    rounding: asRounding(
                        timetableTrainHistory.rounding,
                        'cost.perRecord.timetableTrainHistory.rounding'
                    )
                },
                timetableStation: {
                    unitCost: asNumber(
                        timetableStation.unitCost,
                        'cost.perRecord.timetableStation.unitCost',
                        0
                    ),
                    rounding: asRounding(
                        timetableStation.rounding,
                        'cost.perRecord.timetableStation.rounding'
                    )
                }
            }
        }
    };

    assert(
        configResult.api.pagination.maxLimit >=
            configResult.api.pagination.defaultLimit,
        'api.pagination.maxLimit must be >= defaultLimit'
    );
    assert(
        configResult.api.feedback.validation.createBody.maxLength >=
            configResult.api.feedback.validation.createBody.minLength,
        'api.feedback.validation.createBody.maxLength must be >= minLength'
    );
    assert(
        configResult.api.feedback.validation.replyBody.maxLength >=
            configResult.api.feedback.validation.replyBody.minLength,
        'api.feedback.validation.replyBody.maxLength must be >= minLength'
    );
    assert(
        configResult.api.feedback.validation.title.maxLength >=
            configResult.api.feedback.validation.title.minLength,
        'api.feedback.validation.title.maxLength must be >= minLength'
    );
    assert(
        configResult.user.apiKeyNameLength.maxLength >=
            configResult.user.apiKeyNameLength.minLength,
        'user.apiKeyNameLength.maxLength must be >= minLength'
    );
    assert(
        configResult.spider.scheduleProbe.prefixRules.length > 0,
        'spider.scheduleProbe.prefixRules must not be empty'
    );
    try {
        parseDailyTimeHHmm(configResult.spider.scheduleProbe.dailyTimeHHmm);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(
            false,
            `spider.scheduleProbe.dailyTimeHHmm is invalid: ${message}`
        );
    }
    try {
        parseDailyTimeHHmm(
            configResult.spider.scheduleProbe.probe.latestExecutionTimeHHmm
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(
            false,
            `spider.scheduleProbe.probe.latestExecutionTimeHHmm is invalid: ${message}`
        );
    }
    try {
        parseDailyTimeHHmm(
            configResult.spider.scheduleProbe.coupling.statusResetTimeHHmm
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(
            false,
            `spider.scheduleProbe.coupling.statusResetTimeHHmm is invalid: ${message}`
        );
    }
    try {
        parseDailyTimeHHmm(configResult.task.apiKeyCleanup.dailyTimeHHmm);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(
            false,
            `task.apiKeyCleanup.dailyTimeHHmm is invalid: ${message}`
        );
    }
    try {
        parseDailyTimeHHmm(configResult.task.dailyExport.dailyTimeHHmm);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(false, `task.dailyExport.dailyTimeHHmm is invalid: ${message}`);
    }
    assert(
        configResult.task.referenceModel.threshold > 0 &&
            configResult.task.referenceModel.threshold <= 1,
        'task.referenceModel.threshold must be > 0 and <= 1'
    );
    assert(
        configResult.task.circulation.threshold > 0 &&
            configResult.task.circulation.threshold <= 1,
        'task.circulation.threshold must be > 0 and <= 1'
    );
    assert(
        configResult.task.circulation.stationBoard.maxAttempts >= 1,
        'task.circulation.stationBoard.maxAttempts must be >= 1'
    );
    assert(
        configResult.cost.fixed.trainCirculationImage >=
            configResult.cost.fixed.trainCirculationImageCacheHit,
        'cost.fixed.trainCirculationImage must be >= cost.fixed.trainCirculationImageCacheHit'
    );
    for (const key of [
        'EMUList',
        'QRCode',
        'stationCoord',
        'trainStyleMapping',
        'qrcodeDetection'
    ] as const) {
        const asset = configResult.data.assets[key];
        assert(
            asset.refresh.refreshAt.length > 0,
            `data.assets.${key}.refresh.refreshAt must not be empty`
        );
        const refreshAtSet = new Set<string>();
        for (const [index, refreshAt] of asset.refresh.refreshAt.entries()) {
            try {
                parseDailyTimeHHmm(refreshAt);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                assert(
                    false,
                    `data.assets.${key}.refresh.refreshAt[${index}] is invalid: ${message}`
                );
            }
            assert(
                !refreshAtSet.has(refreshAt),
                `data.assets.${key}.refresh.refreshAt[${index}] is duplicated: ${refreshAt}`
            );
            refreshAtSet.add(refreshAt);
        }
        if (asset.refresh.enabled) {
            assert(
                typeof asset.provider === 'string' && asset.provider.length > 0,
                `data.assets.${key}.provider must be configured when refresh.enabled is true`
            );
        }
    }
    const groupedPrefixRules = new Map<string, ScheduleProbePrefixRule[]>();
    for (const rule of configResult.spider.scheduleProbe.prefixRules) {
        const rules = groupedPrefixRules.get(rule.prefix) ?? [];
        rules.push(rule);
        groupedPrefixRules.set(rule.prefix, rules);
    }
    for (const [prefix, rules] of groupedPrefixRules) {
        const sortedRules = [...rules].sort((left, right) => {
            if (left.minNo !== right.minNo) {
                return left.minNo - right.minNo;
            }
            return left.maxNo - right.maxNo;
        });
        for (let index = 1; index < sortedRules.length; index += 1) {
            const previous = sortedRules[index - 1]!;
            const current = sortedRules[index]!;
            assert(
                current.minNo > previous.maxNo,
                `spider.scheduleProbe.prefixRules has overlapping ranges for prefix ${prefix}: ${previous.minNo}-${previous.maxNo} and ${current.minNo}-${current.maxNo}`
            );
        }
    }
    assert(
        configResult.task.scheduler.idle.emaAlpha > 0 &&
            configResult.task.scheduler.idle.emaAlpha <= 1,
        'task.scheduler.idle.emaAlpha must be > 0 and <= 1'
    );
    const apiKeyPrefixes = Object.values(configResult.user.apiKeyPrefixes);
    assert(
        new Set(apiKeyPrefixes).size === apiKeyPrefixes.length,
        'user.apiKeyPrefixes must not contain duplicated values'
    );
    assert(
        configResult.user.apiKeyTtlSeconds <=
            configResult.user.apiKeyMaxLifetimeSeconds,
        'user.apiKeyTtlSeconds must be <= user.apiKeyMaxLifetimeSeconds'
    );
    assert(
        /^https?:\/\//.test(configResult.oauth.issuer),
        'oauth.issuer must start with http:// or https://'
    );
    assert(
        /^https?:\/\//.test(configResult.oauth.discovery.externalBaseUrl),
        'oauth.discovery.externalBaseUrl must start with http:// or https://'
    );
    assert(
        configResult.oauth.subjectSalt.length > 0,
        'oauth.subjectSalt must be configured'
    );
    assert(
        configResult.oauth.idTokenSigning.privateKeyPem.includes('BEGIN'),
        'oauth.idTokenSigning.privateKeyPem must be a PEM private key'
    );
    assert(
        configResult.services.typstCompiler.baseUrl.length > 0,
        'services.typstCompiler.baseUrl must be configured'
    );
    assert(
        /^https?:\/\//.test(configResult.services.typstCompiler.baseUrl),
        'services.typstCompiler.baseUrl must start with http:// or https://'
    );
    assert(
        configResult.services.typstCompiler.apiKey.length > 0,
        'services.typstCompiler.apiKey must be configured'
    );
    const disabledStartupExecutors = new Set<string>();
    for (const executor of configResult.task.startup.disabledExecutors) {
        assert(
            !disabledStartupExecutors.has(executor),
            `task.startup.disabledExecutors has duplicated executor: ${executor}`
        );
        disabledStartupExecutors.add(executor);
    }
    return configResult;
}

function resolveConfigPath(): string {
    const candidates = import.meta.dev
        ? [DEV_CONFIG_PATH, DEFAULT_CONFIG_PATH]
        : [PROD_CONFIG_PATH, DEFAULT_CONFIG_PATH];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Config file not found. Tried: ${candidates.join(', ')}`);
}

export function getResolvedConfigPath(): string {
    return resolveConfigPath();
}

export function invalidateConfigCache(): void {
    config = null;
}

export function reloadConfig(): Config {
    const configPath = resolveConfigPath();
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const nextConfig = validateConfig(raw);
    config = nextConfig;
    return nextConfig;
}

export default function useConfig() {
    if (!config) {
        reloadConfig();
    }
    return config!;
}
