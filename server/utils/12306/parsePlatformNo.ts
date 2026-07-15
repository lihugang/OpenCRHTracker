function parseNonNegativeInteger(value: unknown): number | null {
    const text =
        typeof value === 'number' || typeof value === 'string'
            ? String(value).trim()
            : '';
    if (!/^\d+$/.test(text)) {
        return null;
    }

    const parsed = Number.parseInt(text, 10);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export default function parsePlatformNo(value: unknown): number | null {
    const text = typeof value === 'string' ? value.trim() : '';
    const match = text.match(/\d+/);
    if (!match) {
        return null;
    }

    return parseNonNegativeInteger(match[0]);
}
