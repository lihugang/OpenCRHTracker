import type { LookupTarget } from '~/types/lookup';

export function normalizeLookupCode(value: string) {
    return value.trim().toUpperCase();
}

export function resolveLookupTarget(value: string): LookupTarget | null {
    const code = normalizeLookupCode(value);
    if (code.length === 0) {
        return null;
    }

    return {
        type: code.startsWith('CR') ? 'emu' : 'train',
        code
    };
}

export function buildLookupPath(target: LookupTarget) {
    const encodedCode = encodeURIComponent(target.code);
    return target.type === 'train'
        ? `/train/${encodedCode}`
        : `/emu/${encodedCode}`;
}
