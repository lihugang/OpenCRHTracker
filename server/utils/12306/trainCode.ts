import normalizeCode from './normalizeCode';

export interface TrainCodeParts {
    readonly prefix: string;
    readonly number: number;
}

export type TrainCode = TrainCodeParts;

const TRAIN_CODE_PATTERN = /^([A-Z]?)([0-9]{1,4})$/;

export function parseTrainCode(value: string): TrainCodeParts | null {
    const normalized = normalizeCode(value);
    const match = TRAIN_CODE_PATTERN.exec(normalized);
    if (!match) {
        return null;
    }

    const number = Number.parseInt(match[2]!, 10);
    if (!Number.isInteger(number) || number < 0 || number > 9999) {
        return null;
    }

    return {
        prefix: match[1] ?? '',
        number
    };
}

export function formatTrainCode(parts: TrainCodeParts): string {
    if (
        !/^[A-Z]?$/.test(parts.prefix) ||
        !Number.isInteger(parts.number) ||
        parts.number < 0 ||
        parts.number > 9999
    ) {
        throw new Error('invalid_train_code_parts');
    }

    return `${parts.prefix}${parts.number}`;
}

export function trainCodeKey(parts: TrainCodeParts): string {
    return formatTrainCode(parts);
}

export function sameTrainCode(
    left: TrainCodeParts | null | undefined,
    right: TrainCodeParts | null | undefined
): boolean {
    if (!left || !right) {
        return left === right;
    }
    return left.prefix === right.prefix && left.number === right.number;
}

export function parseTrainCodes(values: readonly unknown[]): TrainCodeParts[] {
    const result: TrainCodeParts[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const parsed = parseTrainCode(String(value ?? ''));
        if (!parsed) {
            continue;
        }
        const key = trainCodeKey(parsed);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(parsed);
    }
    return result;
}

export function formatTrainCodes(parts: readonly TrainCodeParts[]): string[] {
    return parts.map(formatTrainCode);
}
