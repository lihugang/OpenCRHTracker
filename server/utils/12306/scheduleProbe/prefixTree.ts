import { getMaxDigits, getRuleByKeyword, hasOverlapWithRule } from './rules';
import type { ScheduleProbePrefixRule } from './types';

export function getInitialKeywords(rules: ScheduleProbePrefixRule[]): string[] {
    const keywords: string[] = [];
    for (const rule of rules) {
        for (let firstDigit = 1; firstDigit <= 9; firstDigit += 1) {
            const digitPrefix = String(firstDigit);
            if (!hasOverlapWithRule(digitPrefix, rule)) {
                continue;
            }

            keywords.push(`${rule.prefix}${digitPrefix}`);
        }
    }
    return keywords;
}

export function expandKeyword(
    keyword: string,
    rules: ScheduleProbePrefixRule[]
): string[] {
    const match = getRuleByKeyword(keyword, rules);
    if (!match) {
        return [];
    }

    const maxDigits = getMaxDigits(match.rule);
    if (match.digitPrefix.length >= maxDigits) {
        return [];
    }

    const nextLevelKeywords: string[] = [];
    for (let nextDigit = 0; nextDigit <= 9; nextDigit += 1) {
        const nextDigitPrefix = `${match.digitPrefix}${nextDigit}`;
        if (!hasOverlapWithRule(nextDigitPrefix, match.rule)) {
            continue;
        }

        nextLevelKeywords.push(`${match.rule.prefix}${nextDigitPrefix}`);
    }
    return nextLevelKeywords;
}
