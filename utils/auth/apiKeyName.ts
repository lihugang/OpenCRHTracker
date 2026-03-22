export interface ApiKeyNameLengthConfig {
    minLength: number;
    maxLength: number;
}

export function normalizeApiKeyName(name: string) {
    return name.trim();
}

export function validateApiKeyName(
    name: string,
    length: ApiKeyNameLengthConfig
) {
    const normalizedName = normalizeApiKeyName(name);

    if (normalizedName.length < length.minLength) {
        return `API Key 名称至少需要 ${length.minLength} 个字符。`;
    }

    if (normalizedName.length > length.maxLength) {
        return `API Key 名称不能超过 ${length.maxLength} 个字符。`;
    }

    return '';
}
