export function protoInt64ToNumber(
    value: bigint | number | null | undefined
): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    return Number(value);
}

export function protoOptionalUint32ToNumber(
    value: number | null | undefined
): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    return value;
}
