import { getMaxDigits, getRulesByKeyword, hasOverlapWithRule } from './rules';
import type { ScheduleProbePrefixRule } from './types';

export function getInitialKeywords(rules: ScheduleProbePrefixRule[]): string[] {
    const keywords = new Set<string>();
    for (const rule of rules) {
        for (let firstDigit = 1; firstDigit <= 9; firstDigit += 1) {
            const digitPrefix = String(firstDigit);
            if (!hasOverlapWithRule(digitPrefix, rule)) {
                continue;
            }

            keywords.add(`${rule.prefix}${digitPrefix}`);
        }
    }
    return Array.from(keywords);
}

export function expandKeyword(
    keyword: string,
    rules: ScheduleProbePrefixRule[]
): string[] {
    const matches = getRulesByKeyword(keyword, rules);
    if (matches.length === 0) {
        return [];
    }

    const nextLevelKeywords = new Set<string>();
    for (const match of matches) {
        const maxDigits = getMaxDigits(match.rule);
        if (match.digitPrefix.length >= maxDigits) {
            continue;
        }

        for (let nextDigit = 0; nextDigit <= 9; nextDigit += 1) {
            const nextDigitPrefix = `${match.digitPrefix}${nextDigit}`;
            if (!hasOverlapWithRule(nextDigitPrefix, match.rule)) {
                continue;
            }

            nextLevelKeywords.add(`${match.rule.prefix}${nextDigitPrefix}`);
        }
    }
    return Array.from(nextLevelKeywords);
}
