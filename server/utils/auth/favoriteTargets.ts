import { asEmuId } from '~/server/libs/database/emu';
import type { EmuId } from '~/server/libs/database/emu';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { AuthFavoriteTarget } from '~/server/types/authTargets';

export function authFavoriteTargetKey(target: AuthFavoriteTarget): string {
    if (target.kind === 'train') {
        return `train:${target.trainCode.prefix}:${target.trainCode.number}`;
    }
    if (target.kind === 'emu') {
        return `emu:${target.emuId}`;
    }
    return `station:${target.stationName.trim()}`;
}

function normalizeTrainCode(value: unknown): TrainCodeParts | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const raw = value as { prefix?: unknown; number?: unknown };
    const prefix = typeof raw.prefix === 'string' ? raw.prefix : '';
    const number =
        typeof raw.number === 'number' && Number.isInteger(raw.number)
            ? raw.number
            : NaN;

    if (!/^[A-Z]?$/.test(prefix) || !Number.isInteger(number) || number <= 0) {
        return null;
    }

    return {
        prefix,
        number
    };
}

export function normalizeAuthFavoriteTarget(
    value: unknown
): AuthFavoriteTarget | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const raw = value as { kind?: unknown };
    if (raw.kind === 'train') {
        const trainCode = normalizeTrainCode(
            (value as { trainCode?: unknown }).trainCode
        );
        return trainCode === null ? null : { kind: 'train', trainCode };
    }

    if (raw.kind === 'emu') {
        const emuId = (value as { emuId?: unknown }).emuId;
        if (
            typeof emuId !== 'number' ||
            !Number.isInteger(emuId) ||
            emuId <= 0
        ) {
            return null;
        }
        return { kind: 'emu', emuId: asEmuId(emuId) };
    }

    if (raw.kind === 'station') {
        const stationName = (value as { stationName?: unknown }).stationName;
        if (
            typeof stationName !== 'string' ||
            stationName.trim().length === 0
        ) {
            return null;
        }
        return { kind: 'station', stationName: stationName.trim() };
    }

    return null;
}

export function normalizeAuthFavoriteTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(
            (tag, index, array) =>
                tag.length > 0 && array.indexOf(tag) === index
        );
}

export function isEmuFavoriteTarget(
    target: AuthFavoriteTarget
): target is { kind: 'emu'; emuId: EmuId } {
    return target.kind === 'emu';
}
