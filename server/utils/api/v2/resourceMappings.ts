import { asEmuId, getEmuCode } from '~/server/libs/database/emu';
import { getHistoricalTimetableContent } from '~/server/services/historicalTimetableResolver';

export type V2EmuCodeMappings = Record<string, string>;

export interface V2HistoricalTimetableMapping {
    timetableId: number;
    startStation?: string;
    endStation?: string;
    startOffset?: number;
    endOffset?: number;
    stops: Array<{
        stationNo: number;
        stationName: string;
        arriveOffset?: number;
        departOffset?: number;
        stationTrainCode: {
            prefix: string;
            number: number;
        };
        isStart: boolean;
        isEnd: boolean;
    }>;
}

export function resolveEmuCodeMappings(
    ids: readonly number[]
): V2EmuCodeMappings | undefined {
    const uniqueIds = [...new Set(ids)].filter((id) => Number.isInteger(id));
    uniqueIds.sort((left, right) => left - right);

    const mappings: V2EmuCodeMappings = {};
    let foundAny = false;

    for (const id of uniqueIds) {
        try {
            const code = getEmuCode(asEmuId(id));
            if (code === null) {
                console.error(`v2 emu mapping missing emuId=${id}`);
                continue;
            }
            mappings[String(id)] = code;
            foundAny = true;
        } catch (error) {
            console.error(`v2 emu mapping resolve failed emuId=${id}`, error);
        }
    }

    return foundAny ? mappings : undefined;
}

export function resolveTimetableMappings(
    ids: readonly number[]
): Record<string, V2HistoricalTimetableMapping> | undefined {
    const uniqueIds = [...new Set(ids)].filter((id) => Number.isInteger(id));
    uniqueIds.sort((left, right) => left - right);

    const mappings: Record<string, V2HistoricalTimetableMapping> = {};
    let foundAny = false;

    for (const id of uniqueIds) {
        const content = getHistoricalTimetableContent(id);
        if (content === null) {
            console.error(`v2 timetable mapping missing timetableId=${id}`);
            continue;
        }

        mappings[String(id)] = {
            timetableId: content.id,
            ...(content.startStation === null
                ? {}
                : { startStation: content.startStation }),
            ...(content.endStation === null
                ? {}
                : { endStation: content.endStation }),
            ...(content.startOffset === null
                ? {}
                : { startOffset: content.startOffset }),
            ...(content.endOffset === null
                ? {}
                : { endOffset: content.endOffset }),
            stops: content.stops.map((stop) => ({
                stationNo: stop.stationNo,
                stationName: stop.stationName,
                ...(stop.arriveAt === null
                    ? {}
                    : { arriveOffset: stop.arriveAt }),
                ...(stop.departAt === null
                    ? {}
                    : { departOffset: stop.departAt }),
                stationTrainCode: {
                    prefix: stop.stationTrainCode.prefix,
                    number: stop.stationTrainCode.number
                },
                isStart: stop.isStart,
                isEnd: stop.isEnd
            }))
        };
        foundAny = true;
    }

    return foundAny ? mappings : undefined;
}
