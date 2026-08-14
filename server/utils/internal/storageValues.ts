import { asEmuId, type EmuId } from '~/server/libs/database/emu';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import { asServiceDay, type ServiceDay } from '~/server/utils/date/serviceDay';

export const INTERNAL_JSON_SCHEMA_VERSION = 2;
const INTERNAL_JSON_MARKER = '__opencrh_internal_schema_version';
const INTERNAL_JSON_SEMANTIC_KEY = '__opencrh_internal_json_semantic_key';

const TRAIN_KEYS = new Set([
    'trainCode',
    'relatedTrainCode',
    'primaryTrainCode',
    'scannedTrainCode',
    'matchedTrainCode',
    'stationTrainCode',
    'seatTrainCode',
    'probedTrainCode',
    'train_code',
    'related_train_code',
    'primary_train_code',
    'scanned_train_code',
    'matched_train_code',
    'station_train_code'
]);

const TRAIN_ARRAY_KEYS = new Set([
    'codes',
    'allTrainCodes',
    'failedEnrichCodes',
    'trainCodes',
    'stationTrainCodes',
    'attemptedTrainCodes',
    'allCodes',
    'directHitTrainCodes',
    'historicalTrainCodes',
    'matchedTrainCodes',
    'targetTrainCodes',
    'requestedCodes',
    'groupCodes',
    'checkedTrainCodes',
    'notRunningTrainCodes',
    'requestFailedTrainCodes',
    'mergedFromTrainCodes',
    'unresolvedTrainCodes',
    'train_codes',
    'station_train_codes',
    'attempted_train_codes'
]);

const EMU_KEYS = new Set([
    'emuId',
    'primaryEmuId',
    'candidateEmuId',
    'relatedEmuId',
    'configuredEmuId',
    'scannedEmuId',
    'untrustedEmuId',
    'emu_id',
    'primary_emu_id',
    'candidate_emu_id',
    'related_emu_id'
]);

const EMU_ARRAY_KEYS = new Set([
    'emuIds',
    'emu_ids',
    'persistedEmuIds',
    'allEmuIds',
    'affectedEmuIds',
    'mergedFromEmuIds'
]);

const DATE_KEYS = new Set([
    'lastBuildDate',
    'lastFullSweepDate',
    'startDay',
    'endDay',
    'serviceDate',
    'trainDate',
    'date',
    'service_date',
    'train_date'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function encodeTrainCode(value: unknown): TrainCodeParts | null {
    if (value === null) {
        return null;
    }
    if (!isRecord(value)) {
        throw new Error('invalid_internal_train_code');
    }
    const { prefix, number } = value;
    if (
        typeof prefix !== 'string' ||
        typeof number !== 'number' ||
        !Number.isInteger(number)
    ) {
        throw new Error('invalid_internal_train_code');
    }
    return { prefix, number };
}

function encodeEmuId(value: unknown): EmuId | null {
    if (value === null) {
        return null;
    }
    if (typeof value !== 'number') {
        throw new Error('invalid_internal_emu_id');
    }
    return asEmuId(value);
}

function encodeServiceDay(value: unknown): ServiceDay | null {
    if (value === null) {
        return null;
    }
    if (typeof value !== 'number') {
        throw new Error('invalid_internal_service_day');
    }
    return asServiceDay(value);
}

function encodeValue(value: unknown, key?: string): unknown {
    if (TRAIN_KEYS.has(key ?? '')) {
        return encodeTrainCode(value);
    }
    if (TRAIN_ARRAY_KEYS.has(key ?? '')) {
        if (!Array.isArray(value)) {
            throw new Error('invalid_internal_train_codes');
        }
        return value.map(encodeTrainCode);
    }
    if (EMU_KEYS.has(key ?? '')) {
        return encodeEmuId(value);
    }
    if (EMU_ARRAY_KEYS.has(key ?? '')) {
        if (!Array.isArray(value)) {
            throw new Error('invalid_internal_emu_ids');
        }
        return value.map(encodeEmuId);
    }
    if (DATE_KEYS.has(key ?? '')) {
        return encodeServiceDay(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => encodeValue(item));
    }
    if (isRecord(value)) {
        const result: Record<string, unknown> = {};
        const isTrainRecord =
            Object.prototype.hasOwnProperty.call(value, 'internalCode') &&
            (Object.prototype.hasOwnProperty.call(value, 'stops') ||
                Object.prototype.hasOwnProperty.call(value, 'allCodes'));
        const isRouteRecord = key === 'route' || key === 'scannedRoute';
        const isEmuRecord = key === 'emu';
        for (const [childKey, childValue] of Object.entries(value)) {
            result[childKey] = encodeValue(
                childValue,
                childKey === 'code' && (isTrainRecord || isRouteRecord)
                    ? 'trainCode'
                    : childKey === 'code' && isEmuRecord
                      ? 'emuId'
                      : childKey
            );
        }
        return result;
    }
    return value;
}

function decodeTrainCode(value: unknown): TrainCodeParts | null {
    return encodeTrainCode(value);
}

function decodeEmuId(value: unknown): EmuId | null {
    return encodeEmuId(value);
}

function decodeValue(value: unknown, key?: string): unknown {
    if (TRAIN_KEYS.has(key ?? '')) {
        return decodeTrainCode(value);
    }
    if (TRAIN_ARRAY_KEYS.has(key ?? '')) {
        if (!Array.isArray(value)) {
            throw new Error('invalid_internal_train_codes');
        }
        return value.map(decodeTrainCode);
    }
    if (EMU_KEYS.has(key ?? '') || key === 'emuId' || key === 'emu_id') {
        return decodeEmuId(value);
    }
    if (
        EMU_ARRAY_KEYS.has(key ?? '') ||
        key === 'emuIds' ||
        key === 'emu_ids'
    ) {
        if (!Array.isArray(value)) {
            throw new Error('invalid_internal_emu_ids');
        }
        return value.map(decodeEmuId);
    }
    if (DATE_KEYS.has(key ?? '')) {
        if (typeof value !== 'number') {
            throw new Error('invalid_internal_service_day');
        }
        return asServiceDay(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => decodeValue(item));
    }
    if (isRecord(value)) {
        const result: Record<string, unknown> = {};
        const isTrainRecord =
            Object.prototype.hasOwnProperty.call(value, 'internalCode') &&
            (Object.prototype.hasOwnProperty.call(value, 'stops') ||
                Object.prototype.hasOwnProperty.call(value, 'allCodes'));
        const isRouteRecord = key === 'route' || key === 'scannedRoute';
        const isEmuRecord = key === 'emu';
        for (const [childKey, childValue] of Object.entries(value)) {
            result[childKey] = decodeValue(
                childValue,
                childKey === 'code' && (isTrainRecord || isRouteRecord)
                    ? 'trainCode'
                    : childKey === 'code' && isEmuRecord
                      ? 'emuId'
                      : childKey
            );
        }
        return result;
    }
    return value;
}

export function encodeInternalJson(value: unknown): unknown {
    const encoded = encodeValue(value);
    if (isRecord(encoded)) {
        return {
            [INTERNAL_JSON_MARKER]: INTERNAL_JSON_SCHEMA_VERSION,
            ...encoded
        };
    }
    return {
        [INTERNAL_JSON_MARKER]: INTERNAL_JSON_SCHEMA_VERSION,
        value: encoded
    };
}

export function decodeInternalJson(value: unknown): unknown {
    if (
        !isRecord(value) ||
        value[INTERNAL_JSON_MARKER] !== INTERNAL_JSON_SCHEMA_VERSION
    ) {
        throw new Error('unsupported_internal_json_schema');
    }
    const semanticKey = value[INTERNAL_JSON_SEMANTIC_KEY];
    if (typeof semanticKey === 'string' && semanticKey.length > 0) {
        if (!Object.prototype.hasOwnProperty.call(value, 'value')) {
            throw new Error('invalid_internal_json_semantic_value');
        }
        return decodeValue(value.value, semanticKey);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
        return decodeValue(value.value);
    }
    const { [INTERNAL_JSON_MARKER]: _version, ...body } = value;
    return decodeValue(body);
}

export function stringifyInternalJson(value: unknown): string {
    return JSON.stringify(encodeInternalJson(value));
}

export function stringifyInternalJsonField(
    value: unknown,
    semanticKey: string
): string {
    if (semanticKey.trim().length === 0) {
        throw new Error('invalid_internal_json_semantic_key');
    }
    return JSON.stringify({
        [INTERNAL_JSON_MARKER]: INTERNAL_JSON_SCHEMA_VERSION,
        [INTERNAL_JSON_SEMANTIC_KEY]: semanticKey,
        value: encodeValue(value, semanticKey)
    });
}

export function parseInternalJsonField(
    text: string,
    semanticKey: string,
    _mode?: 'external' | 'internal'
): unknown {
    const parsed = JSON.parse(text) as unknown;
    if (
        !isRecord(parsed) ||
        parsed[INTERNAL_JSON_MARKER] !== INTERNAL_JSON_SCHEMA_VERSION ||
        parsed[INTERNAL_JSON_SEMANTIC_KEY] !== semanticKey ||
        !Object.prototype.hasOwnProperty.call(parsed, 'value')
    ) {
        throw new Error('unsupported_internal_json_schema');
    }
    return decodeValue(parsed.value, semanticKey);
}

export function parseInternalJson(
    text: string,
    _mode?: 'external' | 'internal'
): unknown {
    return decodeInternalJson(JSON.parse(text) as unknown);
}
