import type {
    FavoriteLookupInput,
    FavoriteLookupItem,
    LookupSuggestItem,
    LookupTarget,
    LookupTargetType,
    RecentLookupSearchItem
} from '~/types/lookup';
import { normalizeLookupCode } from '~/utils/lookup/lookupTarget';

export type LookupStoredItem = LookupSuggestItem | RecentLookupSearchItem;

function normalizeLookupItemCode(type: LookupTargetType, code: string) {
    return type === 'station' ? code.trim() : normalizeLookupCode(code);
}

export function buildLookupItemKey(type: LookupTargetType, code: string) {
    return `${type}:${normalizeLookupItemCode(type, code)}`;
}

export function buildLookupItemKeyFromTarget(target: LookupTarget) {
    return buildLookupItemKey(target.type, target.code);
}

export function buildLookupItemKeyFromItem(
    item: Pick<LookupTarget, 'type' | 'code'>
) {
    return buildLookupItemKey(item.type, item.code);
}

export function normalizeLookupItemTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) {
        return [];
    }

    return tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(
            (tag, index, array) =>
                tag.length > 0 && array.indexOf(tag) === index
        );
}

export function isLookupTargetType(value: unknown): value is LookupTargetType {
    return value === 'train' || value === 'emu' || value === 'station';
}

export function normalizeLookupSuggestItem(
    item: LookupStoredItem
): LookupSuggestItem | null {
    const code = normalizeLookupItemCode(item.type, item.code);
    const subtitle = item.subtitle.trim();
    const tags = normalizeLookupItemTags(item.tags);

    if (code.length === 0) {
        return null;
    }

    return {
        type: item.type,
        code,
        subtitle,
        tags
    };
}

export function normalizeFavoriteLookupInput(
    item: FavoriteLookupInput
): FavoriteLookupInput | null {
    const code = normalizeLookupItemCode(item.type, item.code);
    const tags = normalizeLookupItemTags(item.tags);

    if (code.length === 0) {
        return null;
    }

    return {
        type: item.type,
        code,
        tags
    };
}

export function normalizeFavoriteLookupItem(
    item: FavoriteLookupItem
): FavoriteLookupItem | null {
    const normalizedItem = normalizeFavoriteLookupInput(item);
    if (!normalizedItem) {
        return null;
    }

    if (!Number.isInteger(item.starredAt) || item.starredAt <= 0) {
        return null;
    }

    return {
        ...normalizedItem,
        starredAt: item.starredAt
    };
}

export function buildLookupFavoriteFallbackSubtitle(type: LookupTargetType) {
    if (type === 'station') {
        return '车站时刻表';
    }

    return '历史担当记录';
}
