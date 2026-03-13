import fs from 'fs';
import getLogger from '~/server/libs/log4js';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { ensureAssetFile } from '~/server/utils/dataAssets/store';
import parseJsonlToJson from '~/server/utils/json/parseJsonlToJson';

interface RawEmuListRecord extends Record<string, unknown> {
    model?: unknown;
    trainSetNo?: unknown;
    depot?: unknown;
    multiple?: unknown;
    tags?: unknown;
}

interface RawQrCodeRecord extends Record<string, unknown> {
    code?: unknown;
    model?: unknown;
    trainSetNo?: unknown;
}

export interface EmuListRecord {
    model: string;
    trainSetNo: string;
    depot: string;
    multiple: boolean;
    tags: string[];
}

export interface ProbeAssets {
    emuList: EmuListRecord[];
    emuByModelAndTrainSetNo: Map<string, EmuListRecord>;
    emuListByDepotAndModel: Map<string, EmuListRecord[]>;
    qrcodeByModelAndTrainSetNo: Map<string, string>;
}

const logger = getLogger('probe-asset-store');

let cached: ProbeAssets | null = null;

function buildModelAndTrainSetNoKey(model: string, trainSetNo: string): string {
    return `${normalizeCode(model)}#${normalizeCode(trainSetNo)}`;
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

export async function loadProbeAssets(): Promise<ProbeAssets> {
    if (cached) {
        return cached;
    }

    try {
        const [emuAsset, qrCodeAsset] = await Promise.all([
            ensureAssetFile('EMUList', {
                defaultContent: '',
                allowProvider: true
            }),
            ensureAssetFile('QRCode', {
                defaultContent: '',
                allowProvider: true
            })
        ]);

        const emuJsonlText = fs.readFileSync(emuAsset.filePath, 'utf8');
        const qrCodeJsonlText = fs.readFileSync(qrCodeAsset.filePath, 'utf8');

        const rawEmuRecords = parseJsonlToJson<RawEmuListRecord>(emuJsonlText);
        const rawQrCodeRecords =
            parseJsonlToJson<RawQrCodeRecord>(qrCodeJsonlText);

        const emuList: EmuListRecord[] = [];
        const emuByModelAndTrainSetNo = new Map<string, EmuListRecord>();
        const emuListByDepotAndModel = new Map<string, EmuListRecord[]>();
        for (const row of rawEmuRecords) {
            if (
                typeof row.model !== 'string' ||
                typeof row.trainSetNo !== 'string' ||
                typeof row.depot !== 'string'
            ) {
                continue;
            }
            const record = {
                model: normalizeCode(row.model),
                trainSetNo: normalizeCode(row.trainSetNo),
                depot: row.depot.trim(),
                multiple: row.multiple === true,
                tags: normalizeTags(row.tags)
            };
            emuList.push(record);
            emuByModelAndTrainSetNo.set(
                buildModelAndTrainSetNoKey(record.model, record.trainSetNo),
                record
            );

            const depotAndModelKey = `${record.depot}#${record.model}`;
            const group = emuListByDepotAndModel.get(depotAndModelKey);
            if (group) {
                group.push(record);
            } else {
                emuListByDepotAndModel.set(depotAndModelKey, [record]);
            }
        }

        const qrcodeByModelAndTrainSetNo = new Map<string, string>();
        for (const row of rawQrCodeRecords) {
            if (
                typeof row.code !== 'string' ||
                typeof row.model !== 'string' ||
                typeof row.trainSetNo !== 'string'
            ) {
                continue;
            }

            const key = buildModelAndTrainSetNoKey(row.model, row.trainSetNo);
            const code = row.code.trim();
            if (key.length === 0 || code.length === 0) {
                continue;
            }
            qrcodeByModelAndTrainSetNo.set(key, code);
        }

        cached = {
            emuList,
            emuByModelAndTrainSetNo,
            emuListByDepotAndModel,
            qrcodeByModelAndTrainSetNo
        };
        return cached;
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.warn(`load_failed error=${message}`);
        cached = {
            emuList: [],
            emuByModelAndTrainSetNo: new Map<string, EmuListRecord>(),
            emuListByDepotAndModel: new Map<string, EmuListRecord[]>(),
            qrcodeByModelAndTrainSetNo: new Map<string, string>()
        };
        return cached;
    }
}

export function buildProbeAssetKey(model: string, trainSetNo: string): string {
    return buildModelAndTrainSetNoKey(model, trainSetNo);
}

export function invalidateProbeAssetsCache(): void {
    cached = null;
}
