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

const chineseDigitValues: Readonly<Record<string, number>> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
};

const platformPhrasePattern =
    /([0-9零〇一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟]+)\s*站台/g;

function parseChinesePlatformNo(text: string): number | null {
    const singleDigit = chineseDigitValues[text];
    if (singleDigit !== undefined) {
        return singleDigit;
    }

    if (text === '十') {
        return 10;
    }

    const teenMatch = text.match(/^十([一二三四五六七八九])$/);
    if (teenMatch) {
        return 10 + chineseDigitValues[teenMatch[1]!]!;
    }

    const tensMatch = text.match(/^([二三四五六七八九])十([一二三四五六七八九])?$/);
    if (!tensMatch) {
        return null;
    }

    return (
        chineseDigitValues[tensMatch[1]!]! * 10 +
        (tensMatch[2] ? chineseDigitValues[tensMatch[2]]! : 0)
    );
}

export default function parsePlatformNo(value: unknown): number | null {
    const text = typeof value === 'string' ? value.trim() : '';

    for (const match of text.matchAll(platformPhrasePattern)) {
        const phrase = match[1]!;
        const parsed =
            parseNonNegativeInteger(phrase) ?? parseChinesePlatformNo(phrase);
        if (parsed !== null) {
            return parsed;
        }
    }

    const match = text.match(/\d+/);
    if (!match) {
        return null;
    }

    return parseNonNegativeInteger(match[0]);
}
