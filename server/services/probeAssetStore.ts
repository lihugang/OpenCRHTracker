import fs from 'fs';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { ensureAssetFile } from '~/server/utils/dataAssets/store';
import parseJsonlToJson from '~/server/utils/json/parseJsonlToJson';

interface RawEmuListRecord extends Record<string, unknown> {
    model?: unknown;
    trainSetNo?: unknown;
    bureau?: unknown;
    depot?: unknown;
    enableSeatCode?: unknown;
    multiple?: unknown;
    tags?: unknown;
    alias?: unknown;
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
    alias: string[];
}

export interface ProbeAssets {
    emuList: EmuListRecord[];
    emuByModelAndTrainSetNo: Map<string, EmuListRecord>;
    emuListByBureauAndModel: Map<string, EmuListRecord[]>;
    qrcodeByModelAndTrainSetNo: Map<string, string>;
    canonicalEmuCodeByAnyCode: Map<string, string>;
}

let cached: ProbeAssets | null = null;

function buildModelAndTrainSetNoKey(model: string, trainSetNo: string): string {
    return `${normalizeCode(model)}#${normalizeCode(trainSetNo)}`;
}

function buildBureauAndModelKey(bureau: string, model: string): string {
    return `${bureau.trim()}#${normalizeCode(model)}`;
}

function buildCanonicalEmuCode(model: string, trainSetNo: string): string {
    return normalizeCode(`${model}-${trainSetNo}`);
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

function normalizeOptionalString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isSeatCodeEnabled(value: unknown): boolean {
    return value !== false;
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

function normalizeAliases(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizeCode(item))
        .filter(
            (item, index, array) =>
                item.length > 0 && array.indexOf(item) === index
        );
}

function registerCanonicalEmuCode(
    canonicalEmuCodeByAnyCode: Map<string, string>,
    code: string,
    canonicalCode: string,
    rowNumber: number,
    fieldName: string
): void {
    const existingCanonicalCode = canonicalEmuCodeByAnyCode.get(code);
    if (
        typeof existingCanonicalCode === 'string' &&
        existingCanonicalCode !== canonicalCode
    ) {
        throw new Error(
            `EMUList row ${rowNumber} field ${fieldName} conflicts for ${code}: already mapped to ${existingCanonicalCode}`
        );
    }

    canonicalEmuCodeByAnyCode.set(code, canonicalCode);
}

function buildCanonicalEmuCodeByAnyCode(
    emuList: EmuListRecord[]
): Map<string, string> {
    const canonicalEmuCodeByAnyCode = new Map<string, string>();

    for (const [index, record] of emuList.entries()) {
        const rowNumber = index + 1;
        const canonicalCode = buildCanonicalEmuCode(
            record.model,
            record.trainSetNo
        );

        registerCanonicalEmuCode(
            canonicalEmuCodeByAnyCode,
            canonicalCode,
            canonicalCode,
            rowNumber,
            'model/trainSetNo'
        );

        for (const alias of record.alias) {
            if (alias === canonicalCode) {
                continue;
            }

            registerCanonicalEmuCode(
                canonicalEmuCodeByAnyCode,
                alias,
                canonicalCode,
                rowNumber,
                'alias'
            );
        }
    }

    return canonicalEmuCodeByAnyCode;
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
        const depot = normalizeOptionalString(row.depot);

        if (!isSeatCodeEnabled(row.enableSeatCode)) {
            continue;
        }

        emuList.push({
            model,
            trainSetNo,
            bureau,
            depot,
            multiple: row.multiple === true,
            tags: normalizeTags(row.tags),
            alias: normalizeAliases(row.alias)
        });
    }

    buildCanonicalEmuCodeByAnyCode(emuList);
    return emuList;
}

function buildProbeAssets(
    emuList: EmuListRecord[],
    rawQrCodeRecords: RawQrCodeRecord[]
): ProbeAssets {
    const emuByModelAndTrainSetNo = new Map<string, EmuListRecord>();
    const emuListByBureauAndModel = new Map<string, EmuListRecord[]>();
    const canonicalEmuCodeByAnyCode = buildCanonicalEmuCodeByAnyCode(emuList);

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
        if (!emuByModelAndTrainSetNo.has(key)) {
            continue;
        }
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
        qrcodeByModelAndTrainSetNo,
        canonicalEmuCodeByAnyCode
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

export async function resolveCanonicalEmuCode(
    rawEmuCode: string
): Promise<string> {
    const normalizedEmuCode = normalizeCode(rawEmuCode);
    if (normalizedEmuCode.length === 0) {
        return '';
    }

    const assets = await loadProbeAssets();
    return (
        assets.canonicalEmuCodeByAnyCode.get(normalizedEmuCode) ??
        normalizedEmuCode
    );
}

export function invalidateProbeAssetsCache(): void {
    cached = null;
}
