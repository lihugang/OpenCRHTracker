import type { ScheduleProbePrefixRule } from './types';

interface RuleByCodeMatch {
    rule: ScheduleProbePrefixRule;
    no: number;
    normalizedCode: string;
}

interface RuleByKeywordMatch {
    rule: ScheduleProbePrefixRule;
    digitPrefix: string;
}

function sortRulesByPrefixLengthDesc(
    rules: ScheduleProbePrefixRule[]
): ScheduleProbePrefixRule[] {
    return [...rules].sort((a, b) => b.prefix.length - a.prefix.length);
}

export function getRulesByKeyword(
    keyword: string,
    rules: ScheduleProbePrefixRule[]
): RuleByKeywordMatch[] {
    const matches: RuleByKeywordMatch[] = [];
    for (const rule of sortRulesByPrefixLengthDesc(rules)) {
        if (!keyword.startsWith(rule.prefix)) {
            continue;
        }

        const digitPrefix = keyword.slice(rule.prefix.length);
        if (!/^\d+$/.test(digitPrefix)) {
            continue;
        }
        if (digitPrefix.length === 0) {
            continue;
        }

        matches.push({
            rule,
            digitPrefix
        });
    }
    return matches;
}

export function getRuleByCode(
    code: string,
    rules: ScheduleProbePrefixRule[]
): RuleByCodeMatch | null {
    const normalized = code.trim().toUpperCase();
    for (const rule of sortRulesByPrefixLengthDesc(rules)) {
        if (!normalized.startsWith(rule.prefix)) {
            continue;
        }

        const numericPart = normalized.slice(rule.prefix.length);
        if (!/^\d+$/.test(numericPart)) {
            continue;
        }

        const no = Number.parseInt(numericPart, 10);
        if (no < rule.minNo || no > rule.maxNo) {
            continue;
        }

        return {
            rule,
            no,
            normalizedCode: `${rule.prefix}${no}`
        };
    }
    return null;
}

export function getMaxDigits(rule: ScheduleProbePrefixRule): number {
    return String(rule.maxNo).length;
}

export function hasOverlapWithRule(
    digitPrefix: string,
    rule: ScheduleProbePrefixRule
): boolean {
    if (!/^\d+$/.test(digitPrefix)) {
        return false;
    }

    const prefixValue = Number.parseInt(digitPrefix, 10);
    const prefixLength = digitPrefix.length;
    const maxDigits = getMaxDigits(rule);

    for (let digits = prefixLength; digits <= maxDigits; digits += 1) {
        const scale = 10 ** (digits - prefixLength);
        const minCandidate = prefixValue * scale;
        const maxCandidate = minCandidate + scale - 1;
        if (minCandidate <= rule.maxNo && maxCandidate >= rule.minNo) {
            return true;
        }
    }

    return false;
}
