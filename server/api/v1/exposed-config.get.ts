import { defineEventHandler } from 'h3';
import useConfig from '~/server/config';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AboutExposedConfigData } from '~/types/about';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.config.read],
            fixedCost: 0
        },
        async () => {
            const schedulerPollIntervalMs =
                useConfig().task.scheduler.pollIntervalMs;

            const response: AboutExposedConfigData = {
                about: {
                    schedulerPollIntervalMs,
                    schedulerPollIntervalMinutes:
                        schedulerPollIntervalMs / 60_000
                }
            };

            return response;
        }
    );
});
