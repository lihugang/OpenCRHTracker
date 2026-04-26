import { defineEventHandler } from 'h3';
import useConfig from '~/server/config';
import executeApi from '~/server/utils/api/executor/executeApi';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AboutExposedConfigData } from '~/types/about';

export default defineEventHandler(async (event) => {
    const config = useConfig();

    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.config.read],
            fixedCost: 1,
            successHeaders: (successEvent) =>
                setCacheControl(
                    successEvent,
                    config.api.cache.currentDayMaxAgeSeconds
                )
        },
        async () => {
            const schedulerPollIntervalMs =
                config.task.scheduler.pollIntervalMs;

            const response: AboutExposedConfigData = {
                about: {
                    schedulerPollIntervalMs,
                    schedulerPollIntervalMinutes:
                        schedulerPollIntervalMs / 60_000
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
                    cost: {
                        minimumRequestCost: 1,
                        fixed: {
                            authMe: config.cost.fixed.authMe,
                            timetableTrain: config.cost.fixed.timetableTrain,
                            exportDailyIndex:
                                config.cost.fixed.exportDailyIndex,
                            exportDaily: config.cost.fixed.exportDaily
                        },
                        perRecord: {
                            recordsDaily: {
                                unitCost:
                                    config.cost.perRecord.recordsDaily.unitCost,
                                rounding:
                                    config.cost.perRecord.recordsDaily.rounding
                            },
                            timetableStation: {
                                unitCost:
                                    config.cost.perRecord.timetableStation
                                        .unitCost,
                                rounding:
                                    config.cost.perRecord.timetableStation
                                        .rounding
                            },
                            historyTrain: {
                                unitCost:
                                    config.cost.perRecord.historyTrain.unitCost,
                                rounding:
                                    config.cost.perRecord.historyTrain.rounding
                            },
                            historyEmu: {
                                unitCost:
                                    config.cost.perRecord.historyEmu.unitCost,
                                rounding:
                                    config.cost.perRecord.historyEmu.rounding
                            }
                        }
                    }
                }
            };

            return response;
        }
    );
});
