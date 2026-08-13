import { asEmuId, getEmuCode } from '~/server/libs/database/emu';
import { getHistoricalTimetableSummary } from '~/server/services/historicalTimetableResolver';

export type V2EmuCodeMappings = Record<string, string>;

export interface V2HistoricalTimetableSummaryMapping {
    startStation?: string;
    endStation?: string;
    startOffset?: number;
    endOffset?: number;
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
): Record<string, V2HistoricalTimetableSummaryMapping> | undefined {
    const uniqueIds = [...new Set(ids)].filter((id) => Number.isInteger(id));
    uniqueIds.sort((left, right) => left - right);

    const mappings: Record<string, V2HistoricalTimetableSummaryMapping> = {};
    let foundAny = false;

    for (const id of uniqueIds) {
        const summary = getHistoricalTimetableSummary(id);
        if (summary === null) {
            console.error(`v2 timetable mapping missing timetableId=${id}`);
            continue;
        }

        mappings[String(id)] = {
            ...(summary.startStation === null
                ? {}
                : { startStation: summary.startStation }),
            ...(summary.endStation === null
                ? {}
                : { endStation: summary.endStation }),
            ...(summary.startOffset === null
                ? {}
                : { startOffset: summary.startOffset }),
            ...(summary.endOffset === null
                ? {}
                : { endOffset: summary.endOffset })
        };
        foundAny = true;
    }

    return foundAny ? mappings : undefined;
}
