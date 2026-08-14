const TRAIN_CODE_PATTERN = /^([A-Z]?)([0-9]{1,4})$/;

export interface NormalizedTrainCode {
    prefix: string;
    number: number;
}

export function formatProtoTrainCode(
    value:
        | {
              prefix?: string | undefined;
              number?: number | undefined;
          }
        | null
        | undefined
): string {
    if (!value) {
        return '';
    }

    const prefix = typeof value.prefix === 'string' ? value.prefix : '';
    const number =
        typeof value.number === 'number' && Number.isInteger(value.number)
            ? value.number
            : -1;
    if (
        !/^[A-Z]?$/.test(prefix) ||
        !Number.isInteger(number) ||
        number < 0 ||
        number > 9999
    ) {
        return '';
    }

    return `${prefix}${number}`.toUpperCase();
}

export function parseCanonicalTrainCode(
    value: string | null | undefined
): NormalizedTrainCode | null {
    const text = String(value ?? '')
        .trim()
        .toUpperCase();
    const match = TRAIN_CODE_PATTERN.exec(text);
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

export function toProtoTrainCode(
    value: string | null | undefined
): NormalizedTrainCode | null {
    return parseCanonicalTrainCode(value);
}
