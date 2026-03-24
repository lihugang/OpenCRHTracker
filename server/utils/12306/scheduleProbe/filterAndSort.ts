import { getRuleByCode } from './rules';
import type { ScheduleItem, ScheduleProbePrefixRule } from './types';

interface RawTrainCodeItem {
    route: {
        code: string;
        internalCode: string;
    };
}

export function normalizeTrainCodeItems(
    items: RawTrainCodeItem[],
    rules: ScheduleProbePrefixRule[]
): ScheduleItem[] {
    const normalized: ScheduleItem[] = [];
    for (const item of items) {
        const match = getRuleByCode(item.route.code, rules);
        if (!match) {
            continue;
        }

        normalized.push({
            code: match.normalizedCode,
            internalCode: item.route.internalCode,
            allCodes: [match.normalizedCode],
            startStation: '',
            endStation: '',
            startAt: null,
            endAt: null,
            lastRouteRefreshAt: null,
            stops: []
        });
    }

    return normalized;
}

export function sortScheduleItems(
    items: ScheduleItem[],
    rules: ScheduleProbePrefixRule[]
): ScheduleItem[] {
    const prefixOrder = new Map<string, number>();
    for (const [index, rule] of rules.entries()) {
        if (!prefixOrder.has(rule.prefix)) {
            prefixOrder.set(rule.prefix, index);
        }
    }

    return [...items].sort((a, b) => {
        const aMatch = getRuleByCode(a.code, rules);
        const bMatch = getRuleByCode(b.code, rules);

        if (!aMatch && !bMatch) {
            return a.code.localeCompare(b.code);
        }
        if (!aMatch) {
            return 1;
        }
        if (!bMatch) {
            return -1;
        }

        const aPrefixOrder =
            prefixOrder.get(aMatch.rule.prefix) ?? Number.MAX_SAFE_INTEGER;
        const bPrefixOrder =
            prefixOrder.get(bMatch.rule.prefix) ?? Number.MAX_SAFE_INTEGER;
        if (aPrefixOrder !== bPrefixOrder) {
            return aPrefixOrder - bPrefixOrder;
        }

        if (aMatch.no !== bMatch.no) {
            return aMatch.no - bMatch.no;
        }
        return a.code.localeCompare(b.code);
    });
}
