import hasScope from '~/server/utils/api/scopes/hasScope';

export default function isScopeSubset(
    childScopes: Iterable<string>,
    parentScopes: Iterable<string>
) {
    for (const childScope of childScopes) {
        if (!hasScope(parentScopes, childScope)) {
            return false;
        }
    }

    return true;
}
