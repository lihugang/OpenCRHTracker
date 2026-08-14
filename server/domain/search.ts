import { getLookupIndex } from '~/server/services/lookupIndexStore';

export function getSearchIndex() {
    return {
        items: getLookupIndex()
    };
}
