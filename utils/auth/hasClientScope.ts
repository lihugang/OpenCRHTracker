export const CLIENT_AUTH_SCOPES = {
    admin: 'api.admin'
} as const;

function normalizeScopeValue(scope: string) {
    return scope.trim().toLowerCase();
}

export default function hasClientScope(
    grantedScopes: Iterable<string>,
    requiredScope: string
) {
    const normalizedRequiredScope = normalizeScopeValue(requiredScope);

    for (const grantedScope of grantedScopes) {
        const normalizedGrantedScope = normalizeScopeValue(grantedScope);
        if (
            normalizedGrantedScope === normalizedRequiredScope ||
            normalizedRequiredScope.startsWith(`${normalizedGrantedScope}.`)
        ) {
            return true;
        }
    }

    return false;
}
