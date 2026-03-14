export default function normalizeScopeNode(scope: string) {
    const normalized = scope.trim().toLowerCase();
    if (normalized.length === 0) {
        throw new Error('scope must be a non-empty string');
    }

    const segments = normalized.split('.');
    if (
        segments.some((segment) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment))
    ) {
        throw new Error(
            `scope "${scope}" must use dot-separated lowercase segments`
        );
    }

    return normalized;
}
