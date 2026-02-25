import fs from 'fs';

interface CostPerRecordRule {
    unitCost: number;
    rounding: 'ceil';
}

export interface Config {
    spider: {
        userAgent: string;
        params: {
            // 12306 api
            eKey: string;
        };
        rateLimit: {
            minIntervalMs: number;
        };
    };
    data: {
        assets: Record<
            'EMUList' | 'QRCode' | 'schedule',
            {
                file: string;
                provider?: string;
            }
        >;
        databases: Record<'task' | 'EMUTracked' | 'users', string>;
    };
    user: {
        saltLength: number;
        apiKeyPrefix: string;
        apiKeyBytes: number;
        apiKeyTtlSeconds: number;
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
        headers: {
            remain: string;
            cost: string;
            retryAfter: string;
        };
        pagination: {
            defaultLimit: number;
            maxLimit: number;
        };
        timestampUnit: 'seconds';
        debug: {
            enableEchoError: boolean;
        };
    };
    quota: {
        anonymousMaxTokens: number;
        userMaxTokens: number;
        refillAmount: number;
        refillIntervalSeconds: number;
        resetToMaxOnRestart: boolean;
    };
    cost: {
        fixed: {
            health: number;
            quotaMe: number;
            debugEchoError: number;
            authLogin: number;
            authIssueApiKey: number;
            authListApiKeys: number;
            authRevokeApiKey: number;
            exportDaily: number;
        };
        perRecord: {
            historyEmu: CostPerRecordRule;
            historyTrain: CostPerRecordRule;
            recordsDaily: CostPerRecordRule;
        };
    };
}

let config: Config | null = null;

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

function asString(value: unknown, name: string): string {
    assert(
        typeof value === 'string' && value.length > 0,
        `${name} must be a non-empty string`
    );
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

function asBoolean(value: unknown, name: string): boolean {
    assert(typeof value === 'boolean', `${name} must be a boolean`);
    return value;
}

function asRounding(value: unknown, name: string): 'ceil' {
    assert(value === 'ceil', `${name} must be 'ceil'`);
    return 'ceil';
}

function validateConfig(raw: unknown): Config {
    const root = asObject(raw, 'root');

    const spider = asObject(root.spider, 'spider');
    const spiderParams = asObject(spider.params, 'spider.params');
    const spiderRateLimit = asObject(spider.rateLimit, 'spider.rateLimit');

    const data = asObject(root.data, 'data');
    const assets = asObject(data.assets, 'data.assets');
    const databases = asObject(data.databases, 'data.databases');

    const user = asObject(root.user, 'user');
    const userScrypt = asObject(user.scrypt, 'user.scrypt');

    const api = asObject(root.api, 'api');
    const apiHeaders = asObject(api.headers, 'api.headers');
    const apiPagination = asObject(api.pagination, 'api.pagination');
    const apiDebug = asObject(api.debug, 'api.debug');

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

    const configResult: Config = {
        spider: {
            userAgent: asString(spider.userAgent, 'spider.userAgent'),
            params: {
                eKey: asString(spiderParams.eKey, 'spider.params.eKey')
            },
            rateLimit: {
                minIntervalMs: asNumber(
                    spiderRateLimit.minIntervalMs,
                    'spider.rateLimit.minIntervalMs',
                    0
                )
            }
        },
        data: {
            assets: {
                EMUList: {
                    file: asString(
                        asObject(assets.EMUList, 'data.assets.EMUList').file,
                        'data.assets.EMUList.file'
                    ),
                    provider: (() => {
                        const provider = asObject(
                            assets.EMUList,
                            'data.assets.EMUList'
                        ).provider;
                        if (provider === undefined) return undefined;
                        return asString(
                            provider,
                            'data.assets.EMUList.provider'
                        );
                    })()
                },
                QRCode: {
                    file: asString(
                        asObject(assets.QRCode, 'data.assets.QRCode').file,
                        'data.assets.QRCode.file'
                    ),
                    provider: (() => {
                        const provider = asObject(
                            assets.QRCode,
                            'data.assets.QRCode'
                        ).provider;
                        if (provider === undefined) return undefined;
                        return asString(
                            provider,
                            'data.assets.QRCode.provider'
                        );
                    })()
                },
                schedule: {
                    file: asString(
                        asObject(assets.schedule, 'data.assets.schedule').file,
                        'data.assets.schedule.file'
                    ),
                    provider: (() => {
                        const provider = asObject(
                            assets.schedule,
                            'data.assets.schedule'
                        ).provider;
                        if (provider === undefined) return undefined;
                        return asString(
                            provider,
                            'data.assets.schedule.provider'
                        );
                    })()
                }
            },
            databases: {
                task: asString(databases.task, 'data.databases.task'),
                EMUTracked: asString(
                    databases.EMUTracked,
                    'data.databases.EMUTracked'
                ),
                users: asString(databases.users, 'data.databases.users')
            }
        },
        user: {
            saltLength: asNumber(user.saltLength, 'user.saltLength', 8),
            apiKeyPrefix: asString(user.apiKeyPrefix, 'user.apiKeyPrefix'),
            apiKeyBytes: asNumber(user.apiKeyBytes, 'user.apiKeyBytes', 16),
            apiKeyTtlSeconds: asNumber(
                user.apiKeyTtlSeconds,
                'user.apiKeyTtlSeconds',
                60
            ),
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
            headers: {
                remain: asString(apiHeaders.remain, 'api.headers.remain'),
                cost: asString(apiHeaders.cost, 'api.headers.cost'),
                retryAfter: asString(
                    apiHeaders.retryAfter,
                    'api.headers.retryAfter'
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
            }
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
            )
        },
        cost: {
            fixed: {
                health: asNumber(costFixed.health, 'cost.fixed.health', 0),
                quotaMe: asNumber(costFixed.quotaMe, 'cost.fixed.quotaMe', 0),
                debugEchoError: asNumber(
                    costFixed.debugEchoError,
                    'cost.fixed.debugEchoError',
                    0
                ),
                authLogin: asNumber(
                    costFixed.authLogin,
                    'cost.fixed.authLogin',
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
                }
            }
        }
    };

    assert(
        configResult.api.pagination.maxLimit >=
        configResult.api.pagination.defaultLimit,
        'api.pagination.maxLimit must be >= defaultLimit'
    );
    return configResult;
}

export default function useConfig() {
    if (!config) {
        const raw = JSON.parse(fs.readFileSync('data/config.json').toString());
        config = validateConfig(raw);
    }
    return config!;
}
