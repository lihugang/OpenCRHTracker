import { defineEventHandler, getQuery } from 'h3';
import { listDailyRecordsAll } from '~/server/services/emuRoutesStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { getDailyResponseCacheControlMaxAge } from '~/server/utils/api/response/getResponseCacheControlMaxAge';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';

function toCsvCell(value: string | number): string {
    const text = String(value);
    if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) {
        return text;
    }

    return `"${text.replace(/"/g, '""')}"`;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.exports.daily.read],
            fixedCost: getFixedCost('exportDaily'),
            successHeaders: (successEvent, data) =>
                setCacheControl(
                    successEvent,
                    getDailyResponseCacheControlMaxAge(data.date)
                )
        },
        async () => {
            const query = getQuery(event);
            const date = typeof query.date === 'string' ? query.date : '';
            const format =
                typeof query.format === 'string' ? query.format : 'json';

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );
            ensure(
                format === 'csv' || format === 'json',
                400,
                'invalid_param',
                'format 必须是 csv 或 json'
            );

            const dayRange = getDayTimestampRange(date);
            const rows = listDailyRecordsAll(dayRange.startAt, dayRange.endAt);
            const content =
                format === 'json'
                    ? JSON.stringify(
                          rows.map((row) => ({
                              trainCode: row.train_code,
                              emuCode: row.emu_code,
                              startStation: row.start_station_name,
                              endStation: row.end_station_name,
                              startAt: row.start_at,
                              endAt: row.end_at
                          }))
                      )
                    : [
                          'trainCode,emuCode,startStation,endStation,startAt,endAt',
                          ...rows.map((row) =>
                              [
                                  toCsvCell(row.train_code),
                                  toCsvCell(row.emu_code),
                                  toCsvCell(row.start_station_name),
                                  toCsvCell(row.end_station_name),
                                  toCsvCell(row.start_at),
                                  toCsvCell(row.end_at)
                              ].join(',')
                          )
                      ].join('\n');

            return {
                date,
                format,
                total: rows.length,
                content
            };
        }
    );
});
