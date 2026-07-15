import hasScope from '~/server/utils/api/scopes/hasScope';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';

function minimizeScopeList(scopes: Iterable<string>) {
    const normalized = normalizeScopeList(scopes).sort((left, right) => {
        const segmentDifference =
            left.split('.').length - right.split('.').length;
        return segmentDifference || left.localeCompare(right);
    });
    const result: string[] = [];

    for (const scope of normalized) {
        if (!hasScope(result, scope)) {
            result.push(scope);
        }
    }

    return result;
}

export default function intersectScopeLists(
    credentialScopes: Iterable<string>,
    accountScopes: Iterable<string>
) {
    const credential = normalizeScopeList(credentialScopes);
    const account = normalizeScopeList(accountScopes);
    const intersections: string[] = [];

    for (const credentialScope of credential) {
        for (const accountScope of account) {
            if (hasScope([accountScope], credentialScope)) {
                intersections.push(credentialScope);
                continue;
            }

            if (hasScope([credentialScope], accountScope)) {
                intersections.push(accountScope);
            }
        }
    }

    return minimizeScopeList(intersections);
}
