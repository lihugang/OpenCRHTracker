import {
    listDailyRecordsAll,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';
import type {
    AdminAnomalyItem,
    AdminAnomalyRouteRecord,
    AdminAnomalyScanResponse
} from '~/types/admin';

const SIX_HOURS_SECONDS = 6 * 60 * 60;

function toAnomalyRouteRecord(row: DailyEmuRouteRow): AdminAnomalyRouteRecord {
    return {
        id: String(row.id),
        trainCode: row.train_code,
        emuCode: row.emu_code,
        startStation: row.start_station_name,
        endStation: row.end_station_name,
        startAt: row.start_at,
        endAt: row.end_at,
        durationSeconds: Math.max(0, row.end_at - row.start_at)
    };
}

function sortRoutesAscending(left: DailyEmuRouteRow, right: DailyEmuRouteRow) {
    return left.start_at - right.start_at || left.id - right.id;
}

export function scanDailyAnomalies(date: string): AdminAnomalyScanResponse {
    const dayRange = getDayTimestampRange(date);
    const rows = listDailyRecordsAll(dayRange.startAt, dayRange.endAt).sort(
        sortRoutesAscending
    );
    const rowsByTrainCode = new Map<string, DailyEmuRouteRow[]>();
    const rowsByEmuCode = new Map<string, DailyEmuRouteRow[]>();

    for (const row of rows) {
        const trainGroup = rowsByTrainCode.get(row.train_code);
        if (trainGroup) {
            trainGroup.push(row);
        } else {
            rowsByTrainCode.set(row.train_code, [row]);
        }

        const emuGroup = rowsByEmuCode.get(row.emu_code);
        if (emuGroup) {
            emuGroup.push(row);
        } else {
            rowsByEmuCode.set(row.emu_code, [row]);
        }
    }

    const items: AdminAnomalyItem[] = [];

    for (const [trainCode, trainRows] of rowsByTrainCode.entries()) {
        const uniqueEmuCodes = Array.from(
            new Set(trainRows.map((row) => row.emu_code))
        ).sort();
        if (uniqueEmuCodes.length <= 2) {
            continue;
        }

        items.push({
            type: 'train_multi_emu',
            subjectCode: trainCode,
            title: '同日车次关联车组超过 2 组',
            summary:
                `车次 ${trainCode} 在 ${date} 关联了 ${uniqueEmuCodes.length} 组车，` +
                `已超过允许范围。`,
            trainCodes: [trainCode],
            emuCodes: uniqueEmuCodes,
            durationSeconds: null,
            routes: trainRows.map(toAnomalyRouteRecord)
        });
    }

    for (const [emuCode, emuRows] of rowsByEmuCode.entries()) {
        if (emuRows.length !== 1) {
            continue;
        }

        const [route] = emuRows;
        const durationSeconds = Math.max(0, route.end_at - route.start_at);
        if (durationSeconds >= SIX_HOURS_SECONDS) {
            continue;
        }

        items.push({
            type: 'emu_single_short_route',
            subjectCode: emuCode,
            title: '单日仅 1 条交路且运行时长小于 6 小时',
            summary:
                `车组 ${emuCode} 在 ${date} 仅执行 1 条交路，` +
                `运行时长约 ${Math.floor(durationSeconds / 60)} 分钟。`,
            trainCodes: [route.train_code],
            emuCodes: [emuCode],
            durationSeconds,
            routes: [toAnomalyRouteRecord(route)]
        });
    }

    items.sort((left, right) => {
        const leftStartAt = left.routes[0]?.startAt ?? 0;
        const rightStartAt = right.routes[0]?.startAt ?? 0;

        if (left.type !== right.type) {
            return left.type.localeCompare(right.type);
        }

        return (
            leftStartAt - rightStartAt ||
            left.subjectCode.localeCompare(right.subjectCode)
        );
    });

    return {
        date,
        total: items.length,
        counts: [
            {
                type: 'train_multi_emu',
                label: '车次重联异常',
                count: items.filter((item) => item.type === 'train_multi_emu')
                    .length
            },
            {
                type: 'emu_single_short_route',
                label: '车组短交路异常',
                count: items.filter(
                    (item) => item.type === 'emu_single_short_route'
                ).length
            }
        ],
        items
    };
}
