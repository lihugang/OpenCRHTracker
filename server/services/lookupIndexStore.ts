import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import { loadPublishedScheduleState } from '~/server/utils/12306/scheduleProbe/stateStore';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseJsonlToJson from '~/server/utils/json/parseJsonlToJson';
import type { LookupSuggestItem } from '~/types/lookup';

interface RawEmuListRecord extends Record<string, unknown> {
    model?: unknown;
    trainSetNo?: unknown;
    bureau?: unknown;
    depot?: unknown;
    tags?: unknown;
}

interface LookupIndexCache {
    scheduleFilePath: string;
    scheduleMtimeMs: number;
    emuListFilePath: string;
    emuListMtimeMs: number;
    items: LookupSuggestItem[];
}

const DEFAULT_TRAIN_SUBTITLE = '暂无区间信息';
const DEFAULT_EMU_SUBTITLE = '暂无配属信息';

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
        return `${start} → ${end}`;
    }

    if (start || end) {
        return start || end;
    }

    return DEFAULT_TRAIN_SUBTITLE;
}

function buildEmuCode(model: string, trainSetNo: string) {
    return `${model}-${trainSetNo}`;
}

function normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(
            (item, index, array) =>
                item.length > 0 && array.indexOf(item) === index
        );
}

function buildEmuSubtitle(record: { bureau: string; depot: string }) {
    const parts = [];
    if (record.bureau) {
        parts.push(record.bureau);
    }
    if (record.depot) {
        const depotLabel = record.depot.endsWith('动车所')
            ? record.depot
            : `${record.depot}动车所`;
        parts.push(depotLabel);
    }

    return parts.join(' · ') || DEFAULT_EMU_SUBTITLE;
}

function loadTrainItems(scheduleFilePath: string) {
    const state = loadPublishedScheduleState(scheduleFilePath);
    const deduplicated = new Map<string, LookupSuggestItem>();

    for (const item of state?.items ?? []) {
        const code = normalizeCode(item.code);
        if (!code || deduplicated.has(code)) {
            continue;
        }

        deduplicated.set(code, {
            type: 'train',
            code,
            subtitle: buildTrainSubtitle(item.startStation, item.endStation),
            tags: []
        });
    }

    return Array.from(deduplicated.values());
}

function loadEmuItems(emuListFilePath: string) {
    const text = fs.readFileSync(resolveAssetPath(emuListFilePath), 'utf8');
    const rows = parseJsonlToJson<RawEmuListRecord>(text);
    const deduplicated = new Map<string, LookupSuggestItem>();

    for (const row of rows) {
        if (
            typeof row.model !== 'string' ||
            typeof row.trainSetNo !== 'string'
        ) {
            continue;
        }

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
            tags: normalizeTags(row.tags),
            subtitle: buildEmuSubtitle({
                bureau: typeof row.bureau === 'string' ? row.bureau.trim() : '',
                depot: typeof row.depot === 'string' ? row.depot.trim() : ''
            })
        });
    }

    return Array.from(deduplicated.values());
}

function compareIndexItems(left: LookupSuggestItem, right: LookupSuggestItem) {
    if (left.type !== right.type) {
        return left.type === 'train' ? -1 : 1;
    }

    if (left.code.length !== right.code.length) {
        return left.code.length - right.code.length;
    }

    return left.code.localeCompare(right.code, 'zh-Hans-CN');
}

function rebuildCache() {
    const config = useConfig();
    const scheduleFilePath = config.data.assets.schedule.file;
    const emuListFilePath = config.data.assets.EMUList.file;

    const nextCache: LookupIndexCache = {
        scheduleFilePath,
        scheduleMtimeMs: getFileMtimeMs(scheduleFilePath),
        emuListFilePath,
        emuListMtimeMs: getFileMtimeMs(emuListFilePath),
        items: [
            ...loadTrainItems(scheduleFilePath),
            ...loadEmuItems(emuListFilePath)
        ].sort(compareIndexItems)
    };

    cached = nextCache;
    return nextCache;
}

export function getLookupIndex() {
    const config = useConfig();
    const scheduleFilePath = config.data.assets.schedule.file;
    const emuListFilePath = config.data.assets.EMUList.file;
    const scheduleMtimeMs = getFileMtimeMs(scheduleFilePath);
    const emuListMtimeMs = getFileMtimeMs(emuListFilePath);

    if (
        cached &&
        cached.scheduleFilePath === scheduleFilePath &&
        cached.scheduleMtimeMs === scheduleMtimeMs &&
        cached.emuListFilePath === emuListFilePath &&
        cached.emuListMtimeMs === emuListMtimeMs
    ) {
        return cached.items;
    }

    return rebuildCache().items;
}
