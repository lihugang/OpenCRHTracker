import normalizeCode from './normalizeCode';

export interface ParsedEmuCode {
    model: string;
    trainSetNo: string;
}

export default function parseEmuCode(emuCode: string): ParsedEmuCode | null {
    const normalized = normalizeCode(emuCode);
    const separatorIndex = normalized.lastIndexOf('-');
    if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
        return null;
    }

    return {
        model: normalized.slice(0, separatorIndex),
        trainSetNo: normalized.slice(separatorIndex + 1)
    };
}
