import { computed } from 'vue';
import type { RecentLookupSearchItem } from '~/types/lookup';
import { normalizeLookupCode } from '~/utils/lookup/lookupTarget';

const STORAGE_KEY = 'opencrhtracker:recent-lookups';
const MAX_RECENT_LOOKUPS = 5;

function isRecentLookupType(
    value: unknown
): value is RecentLookupSearchItem['type'] {
    return value === 'train' || value === 'emu' || value === 'station';
}

function normalizeRecentLookupCode(item: RecentLookupSearchItem) {
    return item.type === 'station'
        ? item.code.trim()
        : normalizeLookupCode(item.code);
}

function normalizeRecentLookupItem(
    item: RecentLookupSearchItem
): RecentLookupSearchItem | null {
    const code = normalizeRecentLookupCode(item);
    const subtitle = item.subtitle.trim();
    const tags = Array.isArray(item.tags)
        ? item.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter(
                  (tag, index, array) =>
                      tag.length > 0 && array.indexOf(tag) === index
              )
        : [];

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

function parseRecentLookupItems(value: string) {
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((item) => {
                if (
                    typeof item !== 'object' ||
                    item === null ||
                    !('type' in item) ||
                    !('code' in item) ||
                    !('subtitle' in item) ||
                    !('tags' in item) ||
                    !isRecentLookupType(item.type) ||
                    typeof item.code !== 'string' ||
                    typeof item.subtitle !== 'string' ||
                    !Array.isArray(item.tags)
                ) {
                    return null;
                }

                return normalizeRecentLookupItem({
                    type: item.type,
                    code: item.code,
                    subtitle: item.subtitle,
                    tags: item.tags
                } as RecentLookupSearchItem);
            })
            .filter(
                (item): item is RecentLookupSearchItem => item !== null
            )
            .slice(0, MAX_RECENT_LOOKUPS);
    } catch {
        return [];
    }
}

function loadRecentLookupItems() {
    if (!import.meta.client) {
        return [];
    }

    try {
        const rawValue = window.localStorage.getItem(STORAGE_KEY);
        if (!rawValue) {
            return [];
        }

        return parseRecentLookupItems(rawValue);
    } catch {
        return [];
    }
}

function persistRecentLookupItems(items: RecentLookupSearchItem[]) {
    if (!import.meta.client) {
        return;
    }

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
        // Keep in-memory recent searches even if storage is unavailable.
    }
}

function isSameRecentLookupItem(
    left: RecentLookupSearchItem,
    right: RecentLookupSearchItem
) {
    return (
        left.type === right.type &&
        normalizeRecentLookupCode(left) === normalizeRecentLookupCode(right)
    );
}

export function useRecentLookupSearches() {
    const recentSearches = useState<RecentLookupSearchItem[]>(
        'recent-lookup-searches',
        () => []
    );
    const hydrated = useState('recent-lookup-searches-hydrated', () => false);

    function ensureHydrated() {
        if (!import.meta.client || hydrated.value) {
            return;
        }

        recentSearches.value = loadRecentLookupItems();
        hydrated.value = true;
    }

    function addRecentSearch(item: RecentLookupSearchItem) {
        ensureHydrated();

        const normalizedItem = normalizeRecentLookupItem(item);
        if (!normalizedItem) {
            return;
        }

        const nextItems = [
            normalizedItem,
            ...recentSearches.value.filter(
                (recentItem) =>
                    !isSameRecentLookupItem(recentItem, normalizedItem)
            )
        ].slice(0, MAX_RECENT_LOOKUPS);

        recentSearches.value = nextItems;
        persistRecentLookupItems(nextItems);
    }

    ensureHydrated();

    return {
        recentSearches: computed(() => recentSearches.value),
        addRecentSearch
    };
}
