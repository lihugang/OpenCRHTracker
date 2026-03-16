import fs from 'fs';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { ensureAssetFile } from '~/server/utils/dataAssets/store';
import parseJsonlToJson from '~/server/utils/json/parseJsonlToJson';

interface RawEmuListRecord extends Record<string, unknown> {
    model?: unknown;
    trainSetNo?: unknown;
    bureau?: unknown;
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
    bureau: string;
    depot: string;
    multiple: boolean;
    tags: string[];
}

export interface ProbeAssets {
    emuList: EmuListRecord[];
    emuByModelAndTrainSetNo: Map<string, EmuListRecord>;
    emuListByBureauAndModel: Map<string, EmuListRecord[]>;
    qrcodeByModelAndTrainSetNo: Map<string, string>;
}

let cached: ProbeAssets | null = null;

function buildModelAndTrainSetNoKey(model: string, trainSetNo: string): string {
    return `${normalizeCode(model)}#${normalizeCode(trainSetNo)}`;
}

function buildBureauAndModelKey(bureau: string, model: string): string {
    return `${bureau.trim()}#${normalizeCode(model)}`;
}

function normalizeRequiredString(
    value: unknown,
    fieldName: string,
    rowNumber: number
): string {
    if (typeof value !== 'string') {
        throw new Error(
            `EMUList row ${rowNumber} field ${fieldName} must be a string`
        );
    }

    const normalizedValue = value.trim();
    if (normalizedValue.length === 0) {
        throw new Error(
            `EMUList row ${rowNumber} field ${fieldName} must be non-empty`
        );
    }

    return normalizedValue;
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

export function parseEmuListAssetText(text: string): EmuListRecord[] {
    const rawEmuRecords = parseJsonlToJson<RawEmuListRecord>(text);
    const emuList: EmuListRecord[] = [];

    for (const [index, row] of rawEmuRecords.entries()) {
        const rowNumber = index + 1;
        const model = normalizeCode(
            normalizeRequiredString(row.model, 'model', rowNumber)
        );
        const trainSetNo = normalizeCode(
            normalizeRequiredString(row.trainSetNo, 'trainSetNo', rowNumber)
        );
        const bureau = normalizeRequiredString(row.bureau, 'bureau', rowNumber);
        const depot = normalizeRequiredString(row.depot, 'depot', rowNumber);

        emuList.push({
            model,
            trainSetNo,
            bureau,
            depot,
            multiple: row.multiple === true,
            tags: normalizeTags(row.tags)
        });
    }

    return emuList;
}

function buildProbeAssets(
    emuList: EmuListRecord[],
    rawQrCodeRecords: RawQrCodeRecord[]
): ProbeAssets {
    const emuByModelAndTrainSetNo = new Map<string, EmuListRecord>();
    const emuListByBureauAndModel = new Map<string, EmuListRecord[]>();

    for (const record of emuList) {
        emuByModelAndTrainSetNo.set(
            buildModelAndTrainSetNoKey(record.model, record.trainSetNo),
            record
        );

        const bureauAndModelKey = buildBureauAndModelKey(
            record.bureau,
            record.model
        );
        const group = emuListByBureauAndModel.get(bureauAndModelKey);
        if (group) {
            group.push(record);
        } else {
            emuListByBureauAndModel.set(bureauAndModelKey, [record]);
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

    return {
        emuList,
        emuByModelAndTrainSetNo,
        emuListByBureauAndModel,
        qrcodeByModelAndTrainSetNo
    };
}

export async function loadProbeAssets(): Promise<ProbeAssets> {
    if (cached) {
        return cached;
    }

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
    const emuList = parseEmuListAssetText(emuJsonlText);
    const rawQrCodeRecords = parseJsonlToJson<RawQrCodeRecord>(qrCodeJsonlText);

    cached = buildProbeAssets(emuList, rawQrCodeRecords);
    return cached;
}

export function buildProbeAssetKey(model: string, trainSetNo: string): string {
    return buildModelAndTrainSetNoKey(model, trainSetNo);
}

export function invalidateProbeAssetsCache(): void {
    cached = null;
}
