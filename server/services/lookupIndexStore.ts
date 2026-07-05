import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import { parseEmuListAssetText } from '~/server/services/probeAssetStore';
import {
    ensureScheduleDocumentMigrated,
    getScheduleStateVersion
} from '~/server/utils/12306/scheduleProbe/stateStore';
import {
    getScheduleDatabaseFilePath,
    listScheduleStationLookupRows,
    listScheduleTrainLookupRows,
    resolveActiveScheduleStateSummary
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import type { LookupSuggestItem } from '~/types/lookup';

interface LookupIndexCache {
    scheduleDatabasePath: string;
    scheduleStateVersion: number;
    emuListFilePath: string;
    emuListMtimeMs: number;
    items: LookupSuggestItem[];
}

const DEFAULT_TRAIN_SUBTITLE = '暂无区间信息';
const DEFAULT_EMU_SUBTITLE = '暂无配属信息';
const TYPE_ORDER: Record<LookupSuggestItem['type'], number> = {
    train: 0,
    emu: 1,
    station: 2
};

let cached: LookupIndexCache | null = null;

function resolveAssetPath(filePath: string) {
    return path.resolve(filePath);
}

function getFileMtimeMs(filePath: string) {
    try {
        return fs.statSync(resolveAssetPath(filePath)).mtimeMs;
    } catch {
        return -1;
    }
}

function buildTrainSubtitle(startStation: string, endStation: string) {
    const start = startStation.trim();
    const end = endStation.trim();

    if (start && end) {
        return `${start} -> ${end}`;
    }

    if (start || end) {
        return start || end;
    }

    return DEFAULT_TRAIN_SUBTITLE;
}

function buildEmuCode(model: string, trainSetNo: string) {
    return `${model}-${trainSetNo}`;
}

function buildEmuSubtitle(record: { bureau: string; depot: string }) {
    const parts = [];
    if (record.bureau) {
        parts.push(record.bureau);
    }
    if (record.depot) {
        parts.push(record.depot);
    }

    return parts.join(' · ') || DEFAULT_EMU_SUBTITLE;
}

function loadTrainItems() {
    if (!ensureScheduleDocumentMigrated()) {
        return [];
    }

    const activeSummary = resolveActiveScheduleStateSummary(
        getCurrentDateString()
    );
    if (!activeSummary) {
        return [];
    }

    const deduplicated = new Map<string, LookupSuggestItem>();

    for (const row of listScheduleTrainLookupRows(activeSummary.kind)) {
        const code = normalizeCode(row.itemCode);
        if (!code || deduplicated.has(code)) {
            continue;
        }

        deduplicated.set(code, {
            type: 'train',
            code,
            subtitle: buildTrainSubtitle(row.startStation, row.endStation),
            tags: []
        });
    }

    return Array.from(deduplicated.values());
}

function loadStationItems() {
    if (!ensureScheduleDocumentMigrated()) {
        return [];
    }

    const currentDate = getCurrentDateString();
    const activeSummary = resolveActiveScheduleStateSummary(currentDate);
    if (!activeSummary || activeSummary.date !== currentDate) {
        return [];
    }

    return listScheduleStationLookupRows(activeSummary.kind)
        .map<LookupSuggestItem>((row) => ({
            type: 'station',
            code: row.stationName,
            subtitle: `时刻表 · ${row.stopCount} 个车次`,
            tags: []
        }))
        .sort((left, right) =>
            left.code.localeCompare(right.code, 'zh-Hans-CN')
        );
}

function loadEmuItems(emuListFilePath: string) {
    const text = fs.readFileSync(resolveAssetPath(emuListFilePath), 'utf8');
    const rows = parseEmuListAssetText(text);
    const deduplicated = new Map<string, LookupSuggestItem>();

    for (const row of rows) {
        const model = normalizeCode(row.model);
        const trainSetNo = normalizeCode(row.trainSetNo);
        if (!model || !trainSetNo) {
            continue;
        }

        const code = buildEmuCode(model, trainSetNo);
        if (deduplicated.has(code)) {
            continue;
        }

        deduplicated.set(code, {
            type: 'emu',
            code,
            tags: row.tags,
            subtitle: buildEmuSubtitle({
                bureau: row.bureau,
                depot: row.depot
            })
        });
    }

    return Array.from(deduplicated.values());
}

function compareIndexItems(left: LookupSuggestItem, right: LookupSuggestItem) {
    if (left.type !== right.type) {
        return TYPE_ORDER[left.type] - TYPE_ORDER[right.type];
    }

    if (left.code.length !== right.code.length) {
        return left.code.length - right.code.length;
    }

    return left.code.localeCompare(right.code, 'zh-Hans-CN');
}

function rebuildCache() {
    const config = useConfig();
    const scheduleDatabasePath = getScheduleDatabaseFilePath();
    const emuListFilePath = config.data.assets.EMUList.file;
    const items = [
        ...loadTrainItems(),
        ...loadEmuItems(emuListFilePath),
        ...loadStationItems()
    ].sort(compareIndexItems);

    const nextCache: LookupIndexCache = {
        scheduleDatabasePath,
        scheduleStateVersion: getScheduleStateVersion(),
        emuListFilePath,
        emuListMtimeMs: getFileMtimeMs(emuListFilePath),
        items
    };

    cached = nextCache;
    return nextCache;
}

export function getLookupIndex() {
    const config = useConfig();
    const scheduleDatabasePath = getScheduleDatabaseFilePath();
    const emuListFilePath = config.data.assets.EMUList.file;
    const scheduleStateVersion = getScheduleStateVersion();
    const emuListMtimeMs = getFileMtimeMs(emuListFilePath);

    if (
        cached &&
        cached.scheduleDatabasePath === scheduleDatabasePath &&
        cached.scheduleStateVersion === scheduleStateVersion &&
        cached.emuListFilePath === emuListFilePath &&
        cached.emuListMtimeMs === emuListMtimeMs
    ) {
        return cached.items;
    }

    return rebuildCache().items;
}

export function invalidateLookupIndexCache(): void {
    cached = null;
}
