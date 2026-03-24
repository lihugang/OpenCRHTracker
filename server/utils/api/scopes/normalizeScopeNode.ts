export default function normalizeScopeNode(scope: string) {
    const normalized = scope.trim().toLowerCase();
    if (normalized.length === 0) {
        throw new Error('scope 必须是非空字符串');
    }

    const segments = normalized.split('.');
    if (
        segments.some((segment) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment))
    ) {
        throw new Error(`scope "${scope}" 必须使用点分隔的小写片段`);
    }

    return normalized;
}
