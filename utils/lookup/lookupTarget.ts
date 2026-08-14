import type { LookupTarget } from '~/types/lookup';
import { parseCanonicalTrainCode } from '~/utils/api/v2/mappers/trainCode';

export function normalizeLookupCode(value: string) {
    return value.trim().toUpperCase();
}

export function resolveLookupTarget(value: string): LookupTarget | null {
    const code = normalizeLookupCode(value);
    if (code.length === 0) {
        return null;
    }

    if (code.startsWith('CR')) {
        return {
            type: 'emu',
            code
        };
    }

    if (parseCanonicalTrainCode(code)) {
        return {
            type: 'train',
            code
        };
    }

    return {
        type: 'station',
        code: value.trim()
    };
}

export function buildLookupPath(target: LookupTarget) {
    const encodedCode = encodeURIComponent(target.code);
    if (target.type === 'train') {
        return `/train/${encodedCode}`;
    }

    if (target.type === 'emu') {
        return `/emu/${encodedCode}`;
    }

    return `/station/${encodedCode}`;
}
