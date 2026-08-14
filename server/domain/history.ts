import {
    listHistoryLightByEmuPaged,
    listHistoryLightByTrainPaged
} from '~/server/services/emuRoutesStore';
import type { EmuId } from '~/server/libs/database/emu';
import type { ServiceDay } from '~/server/utils/date/serviceDay';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { ExternalCursorPoint } from '~/server/utils/internal/boundaries';

export interface TrainHistoryDomainItem {
    id: number;
    serviceDay: ServiceDay;
    timetableId: number | null;
    emuId: EmuId;
}

export interface EmuHistoryDomainItem {
    id: number;
    serviceDay: ServiceDay;
    timetableId: number | null;
    trainCode: TrainCodeParts;
}

export interface HistoryPageDomainResult<TItem> {
    items: TItem[];
    cursor: ExternalCursorPoint | null;
    limit: number;
    nextCursor: ExternalCursorPoint | null;
}

export function getTrainHistory(input: {
    trainCode: TrainCodeParts;
    start: number;
    end: number;
    cursor: ExternalCursorPoint | null;
    limit: number;
}): HistoryPageDomainResult<TrainHistoryDomainItem> {
    const rows = listHistoryLightByTrainPaged(
        input.trainCode,
        input.start,
        input.end,
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
        items: rows.map((row) => ({
            id: row.id,
            serviceDay: row.service_date,
            timetableId: row.timetable_id,
            emuId: row.emu_id
        })),
        cursor: input.cursor,
        limit: input.limit,
        nextCursor
    };
}

export function getEmuHistory(input: {
    emuId: EmuId;
    start: number;
    end: number;
    cursor: ExternalCursorPoint | null;
    limit: number;
}): HistoryPageDomainResult<EmuHistoryDomainItem> {
    const rows = listHistoryLightByEmuPaged(
        input.emuId,
        input.start,
        input.end,
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
        items: rows.map((row) => ({
            id: row.id,
            serviceDay: row.service_date,
            timetableId: row.timetable_id,
            trainCode: row.train_code
        })),
        cursor: input.cursor,
        limit: input.limit,
        nextCursor
    };
}
