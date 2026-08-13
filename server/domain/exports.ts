import {
    countDailyExportItems,
    getDailyExportFileName,
    listDailyExportIndex,
    readDailyExportText
} from '~/server/services/dailyExportStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import { serviceDateToDay } from '~/server/utils/date/serviceDay';

export function getDailyExportIndex(year?: number, month?: number) {
    return listDailyExportIndex(year, month);
}

export function getDailyExport(date: string) {
    const missingMessage = `${getDailyExportFileName(date)} 未生成`;

    if (date >= getCurrentDateString()) {
        throw new ApiRequestError(404, 'not_found', missingMessage);
    }

    const content = readDailyExportText(date);
    if (content === null) {
        throw new ApiRequestError(404, 'not_found', missingMessage);
    }

    return {
        serviceDay: serviceDateToDay(date),
        total: countDailyExportItems(content),
        content
    };
}
