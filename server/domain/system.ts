import useConfig from '~/server/config';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export function getHealth() {
    return {
        status: 'ok',
        timestamp: getNowSeconds()
    };
}

export function getDebugEchoError(input: {
    status: number;
    code: string;
}) {
    const config = useConfig();
    if (!import.meta.dev || !config.api.debug.enableEchoError) {
        throw new ApiRequestError(404, 'not_found', '当前环境不可使用该接口');
    }

    throw new ApiRequestError(
        input.status,
        input.code,
        '这是调试错误返回'
    );
}

export function getExposedConfig() {
    const config = useConfig();
    const schedulerPollIntervalMs = config.task.scheduler.pollIntervalMs;

    return {
        about: {
            schedulerPollIntervalMs,
            schedulerPollIntervalMinutes: schedulerPollIntervalMs / 60_000
        },
        qqBinding: {
            enabled: config.user.qqBinding.enabled,
            codeTtlSeconds: config.user.qqBinding.codeTtlSeconds,
            sendIntervalSeconds: config.user.qqBinding.sendIntervalSeconds
        },
        api: {
            versionPrefix: config.api.versionPrefix,
            apiKeyHeader: config.api.apiKeyHeader,
            authCookieName: config.api.authCookieName,
            timestampUnit: config.api.timestampUnit,
            headers: {
                remain: config.api.headers.remain,
                cost: config.api.headers.cost,
                retryAfter: config.api.headers.retryAfter
            },
            pagination: {
                defaultLimit: config.api.pagination.defaultLimit,
                maxLimit: config.api.pagination.maxLimit
            },
            quota: {
                anonymousMaxTokens: config.quota.anonymousMaxTokens,
                userMaxTokens: config.quota.userMaxTokens,
                refillAmount: config.quota.refillAmount,
                refillIntervalSeconds: config.quota.refillIntervalSeconds
            },
            cost: {
                minimumRequestCost: 1,
                fixed: {
                    authMe: config.cost.fixed.authMe,
                    authRedeemMembership: config.cost.fixed.authRedeemMembership,
                    authCreateOauthClient: config.cost.fixed.authCreateOauthClient,
                    allocationEmu: config.cost.fixed.allocationEmu,
                    timetableTrainCurrent: config.cost.fixed.timetableTrainCurrent,
                    trainCirculationImageCacheHit:
                        config.cost.fixed.trainCirculationImageCacheHit,
                    trainCirculationImage:
                        config.cost.fixed.trainCirculationImage,
                    trainCirculationImageFailure:
                        config.cost.fixed.trainCirculationImageFailure,
                    timetableTrainHistory:
                        config.cost.fixed.timetableTrainHistory,
                    exportDailyIndex: config.cost.fixed.exportDailyIndex,
                    exportDaily: config.cost.fixed.exportDaily
                },
                perRecord: {
                    recordsDaily: config.cost.perRecord.recordsDaily,
                    timetableTrainHistory:
                        config.cost.perRecord.timetableTrainHistory,
                    timetableStation: config.cost.perRecord.timetableStation,
                    historyTrain: config.cost.perRecord.historyTrain,
                    historyEmu: config.cost.perRecord.historyEmu
                }
            }
        }
    };
}
