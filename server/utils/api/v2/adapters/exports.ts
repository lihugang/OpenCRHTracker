import { getDailyExport, getDailyExportIndex } from '~/server/domain/exports';
import ensure from '~/server/utils/api/executor/ensure';
import type { V2OperationContext } from '~/server/utils/api/v2/V2Types';

function parseOptionalPositiveInteger(value: unknown): number | undefined {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    return parsed > 0 ? parsed : undefined;
}

export async function getDailyExportIndexV2Adapter(ctx: V2OperationContext) {
    const result = getDailyExportIndex(
        parseOptionalPositiveInteger(ctx.query.year),
        parseOptionalPositiveInteger(ctx.query.month)
    );

    return {
        selectedYear: result.selectedYear,
        selectedMonth: result.selectedMonth,
        availableYears: result.availableYears,
        availableMonths: result.availableMonths,
        items: result.items
    };
}

export async function getDailyExportV2Adapter(ctx: V2OperationContext) {
    const date = typeof ctx.params.date === 'string' ? ctx.params.date : '';
    ensure(/^\d{8}$/.test(date), 400, 'invalid_param', 'date 必须是 YYYYMMDD');

    const result = getDailyExport(date);
    return {
        serviceDay: result.serviceDay,
        total: result.total,
        content: Buffer.from(result.content, 'utf8')
    };
}
