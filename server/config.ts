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
}

interface LoggingConfig {
    retentionDays: number;
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
        refreshAt: string;
    };
}

interface AssetConfig {
    file: string;
    provider?: string;
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

export interface Config {
    spider: {
        userAgent: string;
        params: {
            // 12306 api
            eKey: string;
            jsonpCallback: string;
            routeProbeCarCode: string;
        };
        rateLimit: Record<
            'search' | 'query',
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
            schedule: AssetConfig;
        };
        databases: Record<'task' | 'EMUTracked' | 'users' | 'feedback', string>;
        runtime: {
            adminTraffic: RuntimeAdminTrafficConfig;
            adminServerMetrics: RuntimeAdminServerMetricsConfig;
        };
    };
    user: {
        saltLength: number;
        apiKeyPrefixes: {
            webapp: string;
            api: string;
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
    task: {
        startup: {
            disabledExecutors: StartupTaskExecutor[];
        };
        apiKeyCleanup: ApiKeyCleanupConfig;
        dailyExport: DailyExportTaskConfig;
        referenceModel: ReferenceModelTaskConfig;
        circulation: CirculationTaskConfig;
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
            debugEchoError: number;
            authIssueApiKey: number;
            authListApiKeys: number;
            authRevokeApiKey: number;
            authListSubscriptions: number;
            authUpsertSubscription: number;
            authUpdateSubscription: number;
            authDeleteSubscription: number;
            searchIndex: number;
            timetableTrain: number;
            exportDailyIndex: number;
            exportDaily: number;
        };
        perRecord: {
            historyEmu: CostPerRecordRule;
            historyTrain: CostPerRecordRule;
            recordsDaily: CostPerRecordRule;
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

function assertValidEmailAddress(value: string, name: string) {
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
                    ? '0000'
                    : asString(refresh.refreshAt, `${name}.refresh.refreshAt`)
        }
    };
}

function parseAssetConfig(value: unknown, name: string): AssetConfig {
    const asset = asObject(value, name);
    return {
        file: asString(asset.file, `${name}.file`),
        provider: (() => {
            if (asset.provider === undefined) {
                return undefined;
            }
            return asString(asset.provider, `${name}.provider`);
        })()
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

    const user = asObject(root.user, 'user');
    const userScrypt = asObject(user.scrypt, 'user.scrypt');
    const userPushSubscriptions = asObject(
        user.pushSubscriptions,
        'user.pushSubscriptions'
    );
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
                schedule: parseAssetConfig(
                    assets.schedule,
                    'data.assets.schedule'
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
                timetableTrain: asNumber(
                    costFixed.timetableTrain,
                    'cost.fixed.timetableTrain',
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
    for (const key of ['EMUList', 'QRCode'] as const) {
        const asset = configResult.data.assets[key];
        try {
            parseDailyTimeHHmm(asset.refresh.refreshAt);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            assert(
                false,
                `data.assets.${key}.refresh.refreshAt is invalid: ${message}`
            );
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

export default function useConfig() {
    if (!config) {
        const configPath = resolveConfigPath();
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config = validateConfig(raw);
    }
    return config!;
}
