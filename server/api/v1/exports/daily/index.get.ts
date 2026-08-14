import { defineEventHandler, getQuery } from 'h3';
import { getDailyExportIndex } from '~/server/domain/exports';
import { dayToExportDate } from '~/server/services/dailyExportStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { getMonthlyResponseCacheControlMaxAge } from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

function parseOptionalPositiveInteger(value: unknown): number | undefined {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    return parsed > 0 ? parsed : undefined;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.exports.daily.read],
            fixedCost: getFixedCost('exportDailyIndex'),
            successHeaders: (successEvent, data) =>
                setCacheControl(
                    successEvent,
                    getMonthlyResponseCacheControlMaxAge(
                        data.selectedYear,
                        data.selectedMonth
                    )
                )
        },
        async () => {
            const query = getQuery(event);
            const index = getDailyExportIndex(
                parseOptionalPositiveInteger(query.year),
                parseOptionalPositiveInteger(query.month)
            );

            return {
                selectedYear: index.selectedYear,
                selectedMonth: index.selectedMonth,
                availableYears: index.availableYears,
                availableMonths: index.availableMonths,
                items: index.items.map((item) => ({
                    date: dayToExportDate(item.serviceDay)
                }))
            };
        }
    );
});
