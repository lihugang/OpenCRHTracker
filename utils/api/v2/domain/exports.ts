import type { GetDailyExportIndexData } from '#shared/generated/proto/opencrh/v2/exports_pb';
import {
    GetDailyExport,
    GetDailyExportIndex
} from '#shared/api/v2/registry/exports';
import type { DailyExportIndexResponse } from '~/types/exports';
import { epochServiceDayToDateString } from '~/utils/api/v2/mappers/serviceDay';
import { requestV2, requestV2Raw } from '~/utils/api/v2/transport';
import { requireSuccess } from '~/utils/api/v2/domain/common';

function mapDailyExportIndex(
    data: GetDailyExportIndexData
): DailyExportIndexResponse {
    return {
        selectedYear: data.selectedYear,
        selectedMonth: data.selectedMonth,
        availableYears: data.availableYears,
        availableMonths: data.availableMonths,
        items: data.items.map((item) => ({
            date: epochServiceDayToDateString(item.serviceDay),
            formats: ['csv']
        }))
    };
}

export async function fetchDailyExportIndex(
    year?: number,
    month?: number,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetDailyExportIndexData,
        DailyExportIndexResponse
    >(
        GetDailyExportIndex,
        {
            query: {
                year,
                month
            }
        },
        mapDailyExportIndex,
        { signal, retry: 0 }
    );
    return requireSuccess(GetDailyExportIndex, result);
}

export async function fetchDailyExportCsv(
    date: string,
    mode: 'blob' | 'arrayBuffer' | 'text' = 'text'
) {
    return requestV2Raw(
        GetDailyExport,
        {
            params: { date },
            query: { binary: true }
        },
        mode
    );
}
