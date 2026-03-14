import normalizeScopeNode from '~/server/utils/api/scopes/normalizeScopeNode';

export default function normalizeScopeList(scopes: Iterable<string>) {
    const deduped = new Set<string>();
    const result: string[] = [];

    for (const scope of scopes) {
        const normalized = normalizeScopeNode(scope);
        if (deduped.has(normalized)) {
            continue;
        }

        deduped.add(normalized);
        result.push(normalized);
    }

    return result;
}
