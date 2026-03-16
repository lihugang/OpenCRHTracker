import normalizeCode from '~/server/utils/12306/normalizeCode';

const lastDetectedAtByGroup = new Map<string, number>();

function normalizeBureau(bureau: string): string {
    return bureau.trim();
}

function buildDetectionGroupKey(bureau: string, model: string): string {
    return `${normalizeBureau(bureau)}#${normalizeCode(model)}`;
}

export function hasRecentCoupledGroupDetection(
    bureau: string,
    model: string,
    nowSeconds: number,
    cooldownSeconds: number
): boolean {
    const groupKey = buildDetectionGroupKey(bureau, model);
    const lastDetectedAt = lastDetectedAtByGroup.get(groupKey);
    if (typeof lastDetectedAt !== 'number') {
        return false;
    }

    return nowSeconds - lastDetectedAt < cooldownSeconds;
}

export function markCoupledGroupDetected(
    bureau: string,
    model: string,
    nowSeconds: number
): void {
    const groupKey = buildDetectionGroupKey(bureau, model);
    lastDetectedAtByGroup.set(groupKey, nowSeconds);
}

export function clearRecentCoupledGroupDetection(
    bureau: string,
    model: string
): void {
    const groupKey = buildDetectionGroupKey(bureau, model);
    lastDetectedAtByGroup.delete(groupKey);
}
