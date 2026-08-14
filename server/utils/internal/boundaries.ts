import {
    ensureEmuId,
    getEmuCode,
    getEmuId,
    type EmuId
} from '~/server/libs/database/emu';

export { ensureEmuId } from '~/server/libs/database/emu';
import {
    formatTrainCodes,
    formatTrainCode,
    parseTrainCodes,
    parseTrainCode,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import {
    dayToServiceDate,
    serviceDateToDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import parseCursor from '~/server/utils/api/query/parseCursor';

/**
 * External <-> internal boundary helpers.
 *
 * These are the only places where the internal value framework
 * (EmuId / TrainCodeParts / ServiceDay) is converted to and from
 * the external string formats used by HTTP APIs and upstream 12306
 * requests. Internal services should never format or parse these
 * identities themselves.
 */

export function parseExternalTrainCode(value: unknown): TrainCodeParts | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new Error('invalid_external_train_code');
    }
    const text = value.trim();
    return text.length === 0 ? null : parseTrainCode(text);
}

export function parseExternalTrainCodeOrThrow(
    value: unknown,
    label = 'trainCode'
): TrainCodeParts {
    const parsed = parseExternalTrainCode(value);
    if (!parsed) {
        throw new Error(`invalid_train_code ${label}=${String(value ?? '')}`);
    }
    return parsed;
}

export function formatExternalTrainCode(parts: TrainCodeParts): string {
    return formatTrainCode(parts);
}

export function parseExternalTrainCodes(
    value: unknown,
    label = 'trainCodes'
): TrainCodeParts[] {
    if (!Array.isArray(value)) {
        throw new Error(`invalid_${label}`);
    }
    const parsed: TrainCodeParts[] = [];
    for (const item of value) {
        if (typeof item !== 'string') {
            throw new Error(`invalid_${label}`);
        }
        const code = parseTrainCode(item);
        if (!code) {
            throw new Error(`invalid_${label}`);
        }
        parsed.push(code);
    }
    if (parsed.length === 0) {
        throw new Error(`invalid_${label}`);
    }
    return parsed;
}

export function formatExternalTrainCodes(
    parts: readonly TrainCodeParts[]
): string[] {
    return formatTrainCodes(parts);
}

export function parseExternalEmuCode(value: unknown): EmuId | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new Error('invalid_external_emu_code');
    }
    const text = value.trim().toUpperCase();
    return text.length === 0 ? null : getEmuId(text);
}

export function ensureExternalEmuId(value: unknown): EmuId {
    if (typeof value !== 'string') {
        throw new Error('invalid_emu_code');
    }
    const text = value.trim().toUpperCase();
    if (text.length === 0) {
        throw new Error('invalid_emu_code');
    }
    return ensureEmuId(text);
}

export function parseExternalEmuCodes(
    value: unknown,
    label = 'emuCodes'
): EmuId[] {
    if (!Array.isArray(value)) {
        throw new Error(`invalid_${label}`);
    }
    const result: EmuId[] = [];
    const seen = new Set<number>();
    for (const item of value) {
        const id = ensureExternalEmuId(item);
        if (seen.has(Number(id))) {
            continue;
        }
        seen.add(Number(id));
        result.push(id);
    }
    if (result.length === 0) {
        throw new Error(`invalid_${label}`);
    }
    return result;
}

export function formatExternalEmuCodes(ids: readonly EmuId[]): string[] {
    return ids.map(formatExternalEmuCode);
}

export function formatExternalEmuCode(id: EmuId): string {
    const code = getEmuCode(id);
    if (!code) {
        throw new Error(`unknown_emu_id ${Number(id)}`);
    }
    return code;
}

export function parseExternalServiceDate(value: unknown): ServiceDay {
    if (typeof value !== 'string') {
        throw new Error('invalid_external_service_date');
    }
    return serviceDateToDay(value);
}

export function formatExternalServiceDate(day: ServiceDay): string {
    return dayToServiceDate(day);
}

export interface ExternalCursorPoint {
    serviceDate: ServiceDay;
    id: number;
}

export function parseExternalCursor(
    raw: unknown,
    label: string
): ExternalCursorPoint | null {
    const cursor = parseCursor(raw, label);
    return cursor
        ? {
              serviceDate: serviceDateToDay(cursor.serviceDate),
              id: cursor.id
          }
        : null;
}
