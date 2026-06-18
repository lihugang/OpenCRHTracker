import fs from 'fs';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { getAssetFilePath } from '~/server/utils/dataAssets/store';
import { ensureAssetFile } from '~/server/utils/dataAssets/store';
import parseJsonlToJson from '~/server/utils/json/parseJsonlToJson';

interface RawAllocationExport extends Record<string, unknown> {
    schema_version?: unknown;
    railway_bureaus?: unknown;
    train_depots?: unknown;
    emu_depots?: unknown;
    manufacturers?: unknown;
    socket_locations?: unknown;
    toilet_statuses?: unknown;
    business_seat_types?: unknown;
    coach_types?: unknown;
    trainset_models?: unknown;
    coach_layouts?: unknown;
    emu_trainsets?: unknown;
    trainsets?: unknown;
}

interface RawAllocationIdRecord extends Record<string, unknown> {
    id?: unknown;
}

interface RawRailwayBureauRecord extends RawAllocationIdRecord {
    name?: unknown;
}

interface RawTrainDepotRecord extends RawAllocationIdRecord {
    bureau_id?: unknown;
    name?: unknown;
}

interface RawEmuDepotRecord extends RawAllocationIdRecord {
    train_depot_id?: unknown;
    name?: unknown;
}

interface RawTrainsetModelRecord extends RawAllocationIdRecord {
    model?: unknown;
    sub_model?: unknown;
    custom_type?: unknown;
    remark?: unknown;
    first_class_power_legrest?: unknown;
    socket_location_id?: unknown;
    toilet_status_id?: unknown;
    business_seat_type_id?: unknown;
}

interface RawCoachLayoutRecord extends RawAllocationIdRecord {
    model_id?: unknown;
    coach_no?: unknown;
    coach_type_id?: unknown;
    capacity?: unknown;
    has_power?: unknown;
    has_pantograph?: unknown;
    has_large_luggage_area?: unknown;
    has_accessible_facility?: unknown;
}

interface RawManufacturerRecord extends RawAllocationIdRecord {
    name?: unknown;
}

interface RawSocketLocationRecord extends RawAllocationIdRecord {
    text?: unknown;
}

interface RawToiletStatusRecord extends RawAllocationIdRecord {
    text?: unknown;
}

interface RawBusinessSeatTypeRecord extends RawAllocationIdRecord {
    text?: unknown;
}

interface RawCoachTypeRecord extends RawAllocationIdRecord {
    type_code?: unknown;
    type_name?: unknown;
}

interface RawEmuTrainsetRemark extends Record<string, unknown> {
    tags?: unknown;
    alias?: unknown;
    note?: unknown;
}

interface RawEmuTrainsetRecord extends Record<string, unknown> {
    model_id?: unknown;
    car_no?: unknown;
    emu_depot_id?: unknown;
    trainset_manufacturer_id?: unknown;
    trailer_manufacturer_id?: unknown;
    manufacture_month?: unknown;
    is_public?: unknown;
    railway_travel_code_enabled?: unknown;
    remark?: unknown;
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
    trainDepot: string;
    depot: string;
    multiple: boolean;
    subModel: string;
    customType: string;
    trainsetManufacturer: string;
    trailerManufacturer: string;
    manufactureMonth: string;
    isPublic: boolean;
    railwayTravelCodeEnabled: boolean;
    firstClassPowerLegrest: boolean;
    toiletStatus: string;
    socketLocation: string;
    businessSeatType: string;
    modelRemark: string;
    note: string;
    tags: string[];
    alias: string[];
    coachLayouts: EmuCoachLayoutRecord[];
}

export interface EmuCoachLayoutRecord {
    coachNo: number;
    coachTypeCode: string;
    coachTypeName: string;
    capacity: number;
    hasPower: boolean;
    hasPantograph: boolean;
    hasLargeLuggageArea: boolean;
    hasAccessibleFacility: boolean;
}

export type ProbeEmuMultipleState = 'multiple' | 'non_multiple' | 'unknown';

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

function normalizeRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
        throw new Error(`EMUList field ${fieldName} must be a string`);
    }

    const normalizedValue = value.trim();
    if (normalizedValue.length === 0) {
        throw new Error(`EMUList field ${fieldName} must be non-empty`);
    }

    return normalizedValue;
}

function normalizeOptionalString(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
}

function normalizeOptionalDisplayString(value: unknown): string {
    const normalizedValue = normalizeOptionalString(value);
    return normalizedValue === '-' ? '' : normalizedValue;
}

function normalizeBoolean(value: unknown, defaultValue = false): boolean {
    if (typeof value === 'boolean') {
        return value;
    }

    return defaultValue;
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

function parseJsonObject(text: string): RawAllocationExport {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`EMUList asset content must be valid JSON: ${message}`);
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('EMUList asset content must be a JSON object');
    }

    return parsed as RawAllocationExport;
}

function getRequiredArray<T>(
    value: unknown,
    fieldName: string
): T[] {
    if (!Array.isArray(value)) {
        throw new Error(`EMUList field ${fieldName} must be an array`);
    }

    return value as T[];
}

function getOptionalArray<T>(value: unknown): T[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value as T[];
}

function normalizeId(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(`EMUList field ${fieldName} must be a positive integer`);
    }

    return value;
}

function buildRecordById<T extends RawAllocationIdRecord>(
    rows: T[],
    fieldName: string
): Map<number, T> {
    const recordsById = new Map<number, T>();

    for (const [index, row] of rows.entries()) {
        const id = normalizeId(row.id, `${fieldName}[${index}].id`);
        if (recordsById.has(id)) {
            throw new Error(`EMUList field ${fieldName} has duplicate id ${id}`);
        }
        recordsById.set(id, row);
    }

    return recordsById;
}

function buildCoachCountByModelId(
    coachLayouts: RawCoachLayoutRecord[]
): Map<number, number> {
    const coachNosByModelId = new Map<number, Set<number>>();

    for (const [index, row] of coachLayouts.entries()) {
        const modelId = normalizeId(
            row.model_id,
            `coach_layouts[${index}].model_id`
        );
        const coachNo = normalizeId(
            row.coach_no,
            `coach_layouts[${index}].coach_no`
        );
        const coachNos = coachNosByModelId.get(modelId) ?? new Set<number>();
        coachNos.add(coachNo);
        coachNosByModelId.set(modelId, coachNos);
    }

    return new Map(
        [...coachNosByModelId.entries()].map(([modelId, coachNos]) => [
            modelId,
            coachNos.size
        ])
    );
}

function getTrainsets(exportObject: RawAllocationExport): {
    fieldName: string;
    rows: RawEmuTrainsetRecord[];
} {
    if (Array.isArray(exportObject.emu_trainsets)) {
        return {
            fieldName: 'emu_trainsets',
            rows: exportObject.emu_trainsets as RawEmuTrainsetRecord[]
        };
    }

    return {
        fieldName: 'trainsets',
        rows: getRequiredArray<RawEmuTrainsetRecord>(
            exportObject.trainsets,
            'trainsets'
        )
    };
}

function getRemark(value: unknown): RawEmuTrainsetRemark {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return value as RawEmuTrainsetRemark;
}

function getOptionalRecordName(
    recordsById: Map<number, { name?: unknown }>,
    id: unknown
): string {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        return '';
    }

    return normalizeOptionalString(recordsById.get(id)?.name);
}

function getOptionalRecordText(
    recordsById: Map<number, { text?: unknown }>,
    id: unknown
): string {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        return '';
    }

    return normalizeOptionalDisplayString(recordsById.get(id)?.text);
}

function buildCoachLayoutsByModelId(
    coachLayouts: RawCoachLayoutRecord[],
    coachTypesById: Map<number, RawCoachTypeRecord>
): Map<number, EmuCoachLayoutRecord[]> {
    const layoutsByModelId = new Map<number, EmuCoachLayoutRecord[]>();

    for (const [index, row] of coachLayouts.entries()) {
        const modelId = normalizeId(
            row.model_id,
            `coach_layouts[${index}].model_id`
        );
        const coachTypeId = normalizeId(
            row.coach_type_id,
            `coach_layouts[${index}].coach_type_id`
        );
        const coachType = coachTypesById.get(coachTypeId);
        const layout: EmuCoachLayoutRecord = {
            coachNo: normalizeId(row.coach_no, `coach_layouts[${index}].coach_no`),
            coachTypeCode: normalizeOptionalString(coachType?.type_code),
            coachTypeName: normalizeOptionalString(coachType?.type_name),
            capacity:
                typeof row.capacity === 'number' &&
                Number.isInteger(row.capacity) &&
                row.capacity >= 0
                    ? row.capacity
                    : 0,
            hasPower: normalizeBoolean(row.has_power),
            hasPantograph: normalizeBoolean(row.has_pantograph),
            hasLargeLuggageArea: normalizeBoolean(row.has_large_luggage_area),
            hasAccessibleFacility: normalizeBoolean(
                row.has_accessible_facility
            )
        };
        const layouts = layoutsByModelId.get(modelId) ?? [];
        layouts.push(layout);
        layoutsByModelId.set(modelId, layouts);
    }

    for (const layouts of layoutsByModelId.values()) {
        layouts.sort((left, right) => left.coachNo - right.coachNo);
    }

    return layoutsByModelId;
}

export function parseEmuListAssetText(text: string): EmuListRecord[] {
    const exportObject = parseJsonObject(text);
    const railwayBureaus = getRequiredArray<RawRailwayBureauRecord>(
        exportObject.railway_bureaus,
        'railway_bureaus'
    );
    const trainDepots = getRequiredArray<RawTrainDepotRecord>(
        exportObject.train_depots,
        'train_depots'
    );
    const emuDepots = getRequiredArray<RawEmuDepotRecord>(
        exportObject.emu_depots,
        'emu_depots'
    );
    const manufacturers = getOptionalArray<RawManufacturerRecord>(
        exportObject.manufacturers
    );
    const socketLocations = getOptionalArray<RawSocketLocationRecord>(
        exportObject.socket_locations
    );
    const toiletStatuses = getOptionalArray<RawToiletStatusRecord>(
        exportObject.toilet_statuses
    );
    const businessSeatTypes = getOptionalArray<RawBusinessSeatTypeRecord>(
        exportObject.business_seat_types
    );
    const coachTypes = getOptionalArray<RawCoachTypeRecord>(
        exportObject.coach_types
    );
    const trainsetModels = getRequiredArray<RawTrainsetModelRecord>(
        exportObject.trainset_models,
        'trainset_models'
    );
    const coachLayouts = getRequiredArray<RawCoachLayoutRecord>(
        exportObject.coach_layouts,
        'coach_layouts'
    );
    const trainsetTable = getTrainsets(exportObject);

    const railwayBureauById = buildRecordById(
        railwayBureaus,
        'railway_bureaus'
    );
    const trainDepotById = buildRecordById(trainDepots, 'train_depots');
    const emuDepotById = buildRecordById(emuDepots, 'emu_depots');
    const manufacturerById = buildRecordById(manufacturers, 'manufacturers');
    const socketLocationById = buildRecordById(
        socketLocations,
        'socket_locations'
    );
    const toiletStatusById = buildRecordById(
        toiletStatuses,
        'toilet_statuses'
    );
    const businessSeatTypeById = buildRecordById(
        businessSeatTypes,
        'business_seat_types'
    );
    const coachTypeById = buildRecordById(coachTypes, 'coach_types');
    const trainsetModelById = buildRecordById(
        trainsetModels,
        'trainset_models'
    );
    const coachCountByModelId = buildCoachCountByModelId(coachLayouts);
    const coachLayoutsByModelId = buildCoachLayoutsByModelId(
        coachLayouts,
        coachTypeById
    );
    const emuList: EmuListRecord[] = [];

    for (const [index, row] of trainsetTable.rows.entries()) {
        const rowNumber = index + 1;
        if (!isSeatCodeEnabled(row.railway_travel_code_enabled)) {
            continue;
        }

        const modelId = normalizeId(
            row.model_id,
            `${trainsetTable.fieldName}[${index}].model_id`
        );
        const trainsetModel = trainsetModelById.get(modelId);
        if (!trainsetModel) {
            throw new Error(
                `EMUList row ${rowNumber} references missing model_id ${modelId}`
            );
        }

        const emuDepotId = normalizeId(
            row.emu_depot_id,
            `${trainsetTable.fieldName}[${index}].emu_depot_id`
        );
        const emuDepot = emuDepotById.get(emuDepotId);
        if (!emuDepot) {
            throw new Error(
                `EMUList row ${rowNumber} references missing emu_depot_id ${emuDepotId}`
            );
        }

        const trainDepotId = normalizeId(
            emuDepot.train_depot_id,
            `emu_depots[${emuDepotId}].train_depot_id`
        );
        const trainDepot = trainDepotById.get(trainDepotId);
        if (!trainDepot) {
            throw new Error(
                `EMUList row ${rowNumber} references missing train_depot_id ${trainDepotId}`
            );
        }

        const bureauId = normalizeId(
            trainDepot.bureau_id,
            `train_depots[${trainDepotId}].bureau_id`
        );
        const bureau = railwayBureauById.get(bureauId);
        if (!bureau) {
            throw new Error(
                `EMUList row ${rowNumber} references missing bureau_id ${bureauId}`
            );
        }

        const coachCount = coachCountByModelId.get(modelId);
        const multiple = typeof coachCount === 'number' ? coachCount <= 8 : true;

        const remark = getRemark(row.remark);
        const model = normalizeCode(
            normalizeRequiredString(trainsetModel.model, 'trainset_models.model')
        );
        const trainSetNo = normalizeCode(
            normalizeRequiredString(
                row.car_no,
                `${trainsetTable.fieldName}.car_no`
            )
        );
        const bureauName = normalizeRequiredString(
            bureau.name,
            'railway_bureaus.name'
        );
        const depot = normalizeRequiredString(emuDepot.name, 'emu_depots.name');
        const trainDepotName = normalizeRequiredString(
            trainDepot.name,
            'train_depots.name'
        );

        emuList.push({
            model,
            trainSetNo,
            bureau: bureauName,
            trainDepot: trainDepotName,
            depot,
            multiple,
            subModel: normalizeOptionalDisplayString(trainsetModel.sub_model),
            customType: normalizeOptionalDisplayString(
                trainsetModel.custom_type
            ),
            trainsetManufacturer: getOptionalRecordName(
                manufacturerById,
                row.trainset_manufacturer_id
            ),
            trailerManufacturer: getOptionalRecordName(
                manufacturerById,
                row.trailer_manufacturer_id
            ),
            manufactureMonth: normalizeOptionalString(row.manufacture_month),
            isPublic: normalizeBoolean(row.is_public),
            railwayTravelCodeEnabled: isSeatCodeEnabled(
                row.railway_travel_code_enabled
            ),
            firstClassPowerLegrest: normalizeBoolean(
                trainsetModel.first_class_power_legrest
            ),
            toiletStatus: getOptionalRecordText(
                toiletStatusById,
                trainsetModel.toilet_status_id
            ),
            socketLocation: getOptionalRecordText(
                socketLocationById,
                trainsetModel.socket_location_id
            ),
            businessSeatType: getOptionalRecordText(
                businessSeatTypeById,
                trainsetModel.business_seat_type_id
            ),
            modelRemark: normalizeOptionalDisplayString(trainsetModel.remark),
            note: normalizeOptionalDisplayString(remark.note),
            tags: normalizeTags(remark.tags),
            alias: normalizeAliases(remark.alias),
            coachLayouts: [...(coachLayoutsByModelId.get(modelId) ?? [])]
        });
    }

    if (emuList.length === 0) {
        throw new Error('EMUList asset content must include at least one trainset');
    }

    buildCanonicalEmuCodeByAnyCode(emuList);
    return emuList;
}

export function validateDownloadedEmuListAssetText(text: string): void {
    if (text.trim().length === 0) {
        throw new Error('EMUList asset content must not be empty');
    }

    parseEmuListAssetText(text);
}

export function validateDownloadedQrCodeAssetText(text: string): void {
    parseJsonlToJson<RawQrCodeRecord>(text);
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
            allowProvider: true,
            validateContent: validateDownloadedEmuListAssetText
        }),
        ensureAssetFile('QRCode', {
            defaultContent: '',
            allowProvider: true
        })
    ]);

    const emuListText = fs.readFileSync(emuAsset.filePath, 'utf8');
    const qrCodeJsonlText = fs.readFileSync(qrCodeAsset.filePath, 'utf8');
    const emuList = parseEmuListAssetText(emuListText);
    const rawQrCodeRecords = parseJsonlToJson<RawQrCodeRecord>(qrCodeJsonlText);

    cached = buildProbeAssets(emuList, rawQrCodeRecords);
    return cached;
}

export function preloadProbeAssetsFromLocalFiles(): ProbeAssets {
    const emuFilePath = getAssetFilePath('EMUList');
    const qrCodeFilePath = getAssetFilePath('QRCode');
    const emuListText = fs.readFileSync(emuFilePath, 'utf8');
    const qrCodeJsonlText = fs.readFileSync(qrCodeFilePath, 'utf8');

    validateDownloadedEmuListAssetText(emuListText);
    validateDownloadedQrCodeAssetText(qrCodeJsonlText);

    const emuList = parseEmuListAssetText(emuListText);
    const rawQrCodeRecords = parseJsonlToJson<RawQrCodeRecord>(qrCodeJsonlText);

    cached = buildProbeAssets(emuList, rawQrCodeRecords);
    return cached;
}

export function buildProbeAssetKey(model: string, trainSetNo: string): string {
    return buildModelAndTrainSetNoKey(model, trainSetNo);
}

export function getProbeEmuMultipleStateFromRecord(
    record: EmuListRecord | null | undefined
): ProbeEmuMultipleState {
    if (!record) {
        return 'unknown';
    }

    return record.multiple ? 'multiple' : 'non_multiple';
}

export function getProbeEmuMultipleStateFromCode(
    assets: ProbeAssets,
    emuCode: string
): ProbeEmuMultipleState {
    const normalizedEmuCode = normalizeCode(emuCode);
    if (normalizedEmuCode.length === 0) {
        return 'unknown';
    }

    const [model, trainSetNo] = normalizedEmuCode.split('-', 2);
    if (!model || !trainSetNo) {
        return 'unknown';
    }

    return getProbeEmuMultipleStateFromRecord(
        assets.emuByModelAndTrainSetNo.get(
            buildModelAndTrainSetNoKey(model, trainSetNo)
        )
    );
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
