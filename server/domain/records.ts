import { listDailyRecordLightPaged } from '~/server/services/emuRoutesStore';
import type { EmuId } from '~/server/libs/database/emu';
import type { ServiceDay } from '~/server/utils/date/serviceDay';
import { serviceDayToShanghaiDayStartUnixSeconds } from '~/server/utils/date/serviceDay';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { ExternalCursorPoint } from '~/server/utils/internal/boundaries';

export interface DailyRecordDomainItem {
    id: number;
    serviceDay: ServiceDay;
    timetableId: number | null;
    emuId: EmuId;
    trainCode: TrainCodeParts;
}

export interface GetDailyRecordsDomainResult {
    items: DailyRecordDomainItem[];
    cursor: ExternalCursorPoint | null;
    limit: number;
    nextCursor: ExternalCursorPoint | null;
}

export function getDailyRecords(input: {
    serviceDay: ServiceDay;
    cursor: ExternalCursorPoint | null;
    limit: number;
}): GetDailyRecordsDomainResult {
    const startAt = serviceDayToShanghaiDayStartUnixSeconds(input.serviceDay);
    const endAt = startAt + 24 * 60 * 60 - 1;
    const rows = listDailyRecordLightPaged(
        startAt,
        endAt,
        input.cursor,
        input.limit
    );

    const nextCursor =
        rows.length < input.limit || rows.length === 0
            ? null
            : {
                  serviceDate: rows[rows.length - 1]!.service_date,
                  id: rows[rows.length - 1]!.id
              };

    return {
        items: rows.map(toDailyRecordDomainItem),
        cursor: input.cursor,
        limit: input.limit,
        nextCursor
    };
}

function toDailyRecordDomainItem(
    row: ReturnType<typeof listDailyRecordLightPaged>[number]
): DailyRecordDomainItem {
    return {
        id: row.id,
        serviceDay: row.service_date,
        timetableId: row.timetable_id,
        emuId: row.emu_id,
        trainCode: row.train_code
    };
}
