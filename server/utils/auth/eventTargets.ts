import { asEmuId } from '~/server/libs/database/emu';
import { formatExternalEmuCode } from '~/server/utils/internal/boundaries';
import { formatExternalTrainCode } from '~/server/utils/internal/boundaries';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { AuthEventTarget } from '~/server/types/authTargets';

export function authEventTargetKey(target: AuthEventTarget): string {
    if (target.kind === 'train') {
        return `train:${target.trainCode.prefix}:${target.trainCode.number}`;
    }
    if (target.kind === 'emu') {
        return `emu:${target.emuId}`;
    }
    return `feedback:${target.topicId}`;
}

export function buildAuthEventTargetPath(target: AuthEventTarget): string {
    if (target.kind === 'train') {
        return `/train/${encodeURIComponent(formatExternalTrainCode(target.trainCode))}`;
    }
    if (target.kind === 'emu') {
        return `/emu/${encodeURIComponent(formatExternalEmuCode(target.emuId))}`;
    }
    return `/feedback/${target.topicId}`;
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

export function normalizeAuthEventTarget(
    value: unknown
): AuthEventTarget | null {
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

    if (raw.kind === 'feedback') {
        const topicId = (value as { topicId?: unknown }).topicId;
        if (
            typeof topicId !== 'number' ||
            !Number.isInteger(topicId) ||
            topicId <= 0
        ) {
            return null;
        }
        return { kind: 'feedback', topicId };
    }

    return null;
}
