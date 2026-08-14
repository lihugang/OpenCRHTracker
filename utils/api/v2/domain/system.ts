import type { GetExposedConfigData } from '#shared/generated/proto/opencrh/v2/system_pb';
import { GetExposedConfig } from '#shared/api/v2/registry/system';
import type { AboutExposedConfigData } from '~/types/about';
import { protoInt64ToNumber } from '~/utils/api/v2/mappers/numbers';
import { requestV2, type V2RequestInput } from '~/utils/api/v2/transport';
import { requireSuccess } from '~/utils/api/v2/domain/common';

function mapExposedConfig(data: GetExposedConfigData): AboutExposedConfigData {
    const about = data.about!;
    const qqBinding = data.qqBinding!;
    const api = data.api!;
    const headers = api.headers!;
    const pagination = api.pagination!;
    const quota = api.quota!;
    const cost = api.cost!;
    const fixed = cost.fixed!;
    const perRecord = cost.perRecord!;

    return {
        about: {
            schedulerPollIntervalMs:
                protoInt64ToNumber(about.schedulerPollIntervalMs) ?? 0,
            schedulerPollIntervalMinutes: about.schedulerPollIntervalMinutes
        },
        qqBinding: {
            enabled: qqBinding.enabled,
            codeTtlSeconds: qqBinding.codeTtlSeconds,
            sendIntervalSeconds: qqBinding.sendIntervalSeconds
        },
        api: {
            versionPrefix: api.versionPrefix,
            apiKeyHeader: api.apiKeyHeader,
            authCookieName: api.authCookieName,
            timestampUnit: api.timestampUnit,
            headers: {
                remain: headers.remain,
                cost: headers.cost,
                retryAfter: headers.retryAfter
            },
            pagination: {
                defaultLimit: pagination.defaultLimit,
                maxLimit: pagination.maxLimit
            },
            quota: {
                anonymousMaxTokens: quota.anonymousMaxTokens,
                userMaxTokens: quota.userMaxTokens,
                refillAmount: quota.refillAmount,
                refillIntervalSeconds: quota.refillIntervalSeconds
            },
            cost: {
                minimumRequestCost: cost.minimumRequestCost,
                fixed: {
                    authMe: protoInt64ToNumber(fixed.authMe) ?? 0,
                    authRedeemMembership:
                        protoInt64ToNumber(fixed.authRedeemMembership) ?? 0,
                    authCreateOauthClient:
                        protoInt64ToNumber(fixed.authCreateOauthClient) ?? 0,
                    allocationEmu: protoInt64ToNumber(fixed.allocationEmu) ?? 0,
                    timetableTrainCurrent:
                        protoInt64ToNumber(fixed.timetableTrainCurrent) ?? 0,
                    trainCirculationImageCacheHit:
                        protoInt64ToNumber(
                            fixed.trainCirculationImageCacheHit
                        ) ?? 0,
                    trainCirculationImage:
                        protoInt64ToNumber(fixed.trainCirculationImage) ?? 0,
                    trainCirculationImageFailure:
                        protoInt64ToNumber(
                            fixed.trainCirculationImageFailure
                        ) ?? 0,
                    timetableTrainHistory:
                        protoInt64ToNumber(fixed.timetableTrainHistory) ?? 0,
                    exportDailyIndex:
                        protoInt64ToNumber(fixed.exportDailyIndex) ?? 0,
                    exportDaily: protoInt64ToNumber(fixed.exportDaily) ?? 0
                },
                perRecord: {
                    recordsDaily: {
                        unitCost: perRecord.recordsDaily!.unitCost,
                        rounding:
                            perRecord.recordsDaily!.rounding as 'ceil'
                    },
                    timetableTrainHistory: {
                        unitCost:
                            perRecord.timetableTrainHistory!.unitCost,
                        rounding:
                            perRecord.timetableTrainHistory!.rounding as 'ceil'
                    },
                    timetableStation: {
                        unitCost: perRecord.timetableStation!.unitCost,
                        rounding:
                            perRecord.timetableStation!.rounding as 'ceil'
                    },
                    historyTrain: {
                        unitCost: perRecord.historyTrain!.unitCost,
                        rounding: perRecord.historyTrain!.rounding as 'ceil'
                    },
                    historyEmu: {
                        unitCost: perRecord.historyEmu!.unitCost,
                        rounding: perRecord.historyEmu!.rounding as 'ceil'
                    }
                }
            }
        }
    };
}

export async function fetchExposedConfig(
    input: V2RequestInput = {},
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetExposedConfigData,
        AboutExposedConfigData
    >(GetExposedConfig, input, mapExposedConfig, {
        signal,
        retry: 0
    });
    return requireSuccess(GetExposedConfig, result);
}
