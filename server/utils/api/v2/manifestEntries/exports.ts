import { defineV2Operation } from '~/server/utils/api/v2/V2Types';
import {
    GetDailyExportIndexRequestSchema,
    GetDailyExportIndexDataSchema,
    GetDailyExportIndexResponseSchema,
    GetDailyExportRequestSchema,
    GetDailyExportDataSchema,
    GetDailyExportResponseSchema
} from '#shared/generated/proto/opencrh/v2/exports_pb';
import {
    getDailyExportIndexV2Adapter,
    getDailyExportV2Adapter
} from '~/server/utils/api/v2/adapters/exports';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    getDailyResponseCacheControlMaxAge,
    getMonthlyResponseCacheControlMaxAge
} from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import { asServiceDay, dayToServiceDate } from '~/server/utils/date/serviceDay';

export const EXPORTS_MANIFEST_ENTRIES = {
    GetDailyExportIndex: defineV2Operation({
        operationName: 'GetDailyExportIndex',
        method: 'GET',
        pathTemplate: '/api/v2/exports/daily',
        requestSchema: GetDailyExportIndexRequestSchema,
        dataSchema: GetDailyExportIndexDataSchema,
        responseSchema: GetDailyExportIndexResponseSchema,
        requiredScopes: [API_SCOPES.exports.daily.read],
        cors: true,
        cost: { kind: 'fixed', key: 'exportDailyIndex' },
        cache: (data) => {
            const typed = data as {
                selectedYear: number;
                selectedMonth: number;
            };
            return getMonthlyResponseCacheControlMaxAge(
                typed.selectedYear,
                typed.selectedMonth
            );
        },
        bodyMode: 'none',
        handler: getDailyExportIndexV2Adapter
    }),
    GetDailyExport: defineV2Operation({
        operationName: 'GetDailyExport',
        method: 'GET',
        pathTemplate: '/api/v2/exports/daily/:date',
        requestSchema: GetDailyExportRequestSchema,
        dataSchema: GetDailyExportDataSchema,
        responseSchema: GetDailyExportResponseSchema,
        requiredScopes: [API_SCOPES.exports.daily.read],
        cors: true,
        cost: { kind: 'fixed', key: 'exportDaily' },
        cache: (data) =>
            getDailyResponseCacheControlMaxAge(
                dayToServiceDate(
                    asServiceDay((data as { serviceDay: number }).serviceDay)
                )
            ),
        bodyMode: 'none',
        jsonData: (data) => {
            const typed = data as {
                serviceDay: number;
                total: number;
                content: Uint8Array;
            };
            return {
                serviceDay: typed.serviceDay,
                total: typed.total,
                content: Buffer.from(typed.content).toString('utf8')
            };
        },
        rawMedia: {
            kind: 'csv',
            isRequested: (query) =>
                query.binary === '1' || query.binary === 'true',
            resolveContentType: () => 'text/csv',
            build: (data) => ({
                content: Buffer.from(
                    (data as { content: Uint8Array }).content
                ).toString('utf8'),
                contentType: 'text/csv; charset=utf-8',
                contentDisposition: `attachment; filename="${dayToServiceDate(
                    asServiceDay((data as { serviceDay: number }).serviceDay)
                )}.csv"`
            })
        },
        handler: getDailyExportV2Adapter
    })
} as const;
