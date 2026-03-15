import normalizeCode from '~/server/utils/12306/normalizeCode';

const lastDetectedAtByGroup = new Map<string, number>();

function normalizeDepot(depot: string): string {
    return depot.trim();
}

function buildDetectionGroupKey(depot: string, model: string): string {
    return `${normalizeDepot(depot)}#${normalizeCode(model)}`;
}

export function hasRecentCoupledGroupDetection(
    depot: string,
    model: string,
    nowSeconds: number,
    cooldownSeconds: number
): boolean {
    const groupKey = buildDetectionGroupKey(depot, model);
    const lastDetectedAt = lastDetectedAtByGroup.get(groupKey);
    if (typeof lastDetectedAt !== 'number') {
        return false;
    }

    return nowSeconds - lastDetectedAt < cooldownSeconds;
}

export function markCoupledGroupDetected(
    depot: string,
    model: string,
    nowSeconds: number
): void {
    const groupKey = buildDetectionGroupKey(depot, model);
    lastDetectedAtByGroup.set(groupKey, nowSeconds);
}

export function clearRecentCoupledGroupDetection(
    depot: string,
    model: string
): void {
    const groupKey = buildDetectionGroupKey(depot, model);
    lastDetectedAtByGroup.delete(groupKey);
}
