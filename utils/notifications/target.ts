import type {
    NotificationTarget,
    NotificationTargetType
} from '~/types/notifications';
import { normalizeLookupCode } from '~/utils/lookup/lookupTarget';

export function isNotificationTargetType(
    value: unknown
): value is NotificationTargetType {
    return value === 'train' || value === 'emu' || value === 'feedback';
}

export function normalizeNotificationTargetId(
    targetType: NotificationTargetType,
    targetId: string
) {
    if (targetType === 'train' || targetType === 'emu') {
        return normalizeLookupCode(targetId);
    }

    return targetId.trim();
}

export function normalizeNotificationTarget(
    target: NotificationTarget
): NotificationTarget | null {
    const targetId = normalizeNotificationTargetId(
        target.targetType,
        target.targetId
    );

    if (target.targetType === 'feedback') {
        if (!/^\d+$/.test(targetId) || Number(targetId) <= 0) {
            return null;
        }
    } else if (targetId.length === 0) {
        return null;
    }

    return {
        targetType: target.targetType,
        targetId
    };
}

export function buildNotificationTargetKey(target: NotificationTarget) {
    return `${target.targetType}:${target.targetId}`;
}

export function buildNotificationTargetPath(target: NotificationTarget) {
    const encodedTargetId = encodeURIComponent(target.targetId);

    if (target.targetType === 'train') {
        return `/train/${encodedTargetId}`;
    }

    if (target.targetType === 'emu') {
        return `/emu/${encodedTargetId}`;
    }

    return `/feedback/${encodedTargetId}`;
}
