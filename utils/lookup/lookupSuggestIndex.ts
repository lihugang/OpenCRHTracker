import type { LookupSuggestItem } from '~/types/lookup';
import Trie from '~/utils/lookup/trie';

export interface LookupSuggestIndex {
    items: LookupSuggestItem[];
    query(
        query: string,
        type?: LookupSuggestItem['type'],
        limit?: number
    ): LookupSuggestItem[];
}

let cachedItems: LookupSuggestItem[] | null = null;
let cachedIndex: LookupSuggestIndex | null = null;

function normalizeKeyword(value: string) {
    return value.trim().toUpperCase();
}

function isLookupSuggestItem(
    item: LookupSuggestItem | undefined
): item is LookupSuggestItem {
    return item !== undefined;
}

function getSuggestionRank(item: LookupSuggestItem, query: string) {
    if (item.code === query) {
        return 0;
    }

    if (item.code.startsWith(query)) {
        return 1;
    }

    const normalizedQuery = normalizeKeyword(query);
    const normalizedTags = Array.isArray(item.tags)
        ? item.tags.map(normalizeKeyword)
        : [];

    if (normalizedTags.some((tag) => tag === normalizedQuery)) {
        return 2;
    }

    if (normalizedTags.some((tag) => tag.startsWith(normalizedQuery))) {
        return 3;
    }

    if (normalizedTags.some((tag) => tag.includes(normalizedQuery))) {
        return 4;
    }

    return 5;
}

function compareSuggestionOrder(query: string) {
    return (left: LookupSuggestItem, right: LookupSuggestItem) => {
        const leftRank = getSuggestionRank(left, query);
        const rightRank = getSuggestionRank(right, query);
        if (leftRank !== rightRank) {
            return leftRank - rightRank;
        }

        if (left.type !== right.type) {
            return left.type === 'train' ? -1 : 1;
        }

        if (left.code.length !== right.code.length) {
            return left.code.length - right.code.length;
        }

        return left.code.localeCompare(right.code, 'zh-Hans-CN');
    };
}

function buildTagVariants(value: string) {
    const normalized = normalizeKeyword(value);
    const variants: string[] = [];

    for (let index = 0; index < normalized.length; index += 1) {
        variants.push(normalized.slice(index));
    }

    return variants;
}

function resolveSearchLimit(limit?: number) {
    if (!limit || !Number.isFinite(limit) || limit <= 0) {
        return Number.POSITIVE_INFINITY;
    }

    return Math.max(1, Math.ceil(limit));
}

function buildLookupSuggestIndex(
    items: LookupSuggestItem[]
): LookupSuggestIndex {
    const allCodeTrie = new Trie<number>();
    const trainCodeTrie = new Trie<number>();
    const emuCodeTrie = new Trie<number>();
    const emuTagTrie = new Trie<number>();

    items.forEach((item, itemIndex) => {
        const normalizedCode = normalizeKeyword(item.code);
        allCodeTrie.insert(normalizedCode, itemIndex);

        if (item.type === 'train') {
            trainCodeTrie.insert(normalizedCode, itemIndex);
            return;
        }

        emuCodeTrie.insert(normalizedCode, itemIndex);
        for (const tag of item.tags) {
            emuTagTrie.insertMany(buildTagVariants(tag), itemIndex);
        }
    });

    function collectItems(indexes: Iterable<number>): LookupSuggestItem[] {
        const itemsSet = new Set<number>();
        for (const itemIndex of indexes) {
            itemsSet.add(itemIndex);
        }

        return Array.from(itemsSet)
            .map((itemIndex) => items[itemIndex])
            .filter(isLookupSuggestItem);
    }

    return {
        items,
        query(query, type, limit) {
            const normalizedQuery = normalizeKeyword(query);
            const searchLimit = resolveSearchLimit(limit);

            if (type === 'train') {
                return collectItems(
                    trainCodeTrie.search(normalizedQuery, searchLimit)
                )
                    .sort(compareSuggestionOrder(normalizedQuery))
                    .slice(0, searchLimit);
            }

            if (type === 'emu') {
                return collectItems([
                    ...emuCodeTrie.search(normalizedQuery, searchLimit),
                    ...emuTagTrie.search(normalizedQuery, searchLimit)
                ])
                    .sort(compareSuggestionOrder(normalizedQuery))
                    .slice(0, searchLimit);
            }

            return collectItems([
                ...allCodeTrie.search(normalizedQuery, searchLimit),
                ...emuTagTrie.search(normalizedQuery, searchLimit)
            ])
                .sort(compareSuggestionOrder(normalizedQuery))
                .slice(0, searchLimit);
        }
    };
}

export default function getLookupSuggestIndex(
    items: LookupSuggestItem[]
): LookupSuggestIndex {
    if (cachedIndex && cachedItems === items) {
        return cachedIndex;
    }

    cachedItems = items;
    cachedIndex = buildLookupSuggestIndex(items);
    return cachedIndex;
}
