import normalizeScopeNode from '~/server/utils/api/scopes/normalizeScopeNode';

export default function hasScope(
    grantedScopes: Iterable<string>,
    requiredScope: string
) {
    const normalizedRequiredScope = normalizeScopeNode(requiredScope);

    for (const grantedScope of grantedScopes) {
        const normalizedGrantedScope = normalizeScopeNode(grantedScope);
        if (
            normalizedGrantedScope === normalizedRequiredScope ||
            normalizedRequiredScope.startsWith(`${normalizedGrantedScope}.`)
        ) {
            return true;
        }
    }

    return false;
}
