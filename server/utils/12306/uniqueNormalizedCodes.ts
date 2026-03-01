import normalizeCode from '~/server/utils/12306/normalizeCode';

export default function uniqueNormalizedCodes(codes: string[]): string[] {
    return Array.from(
        new Set(
            codes
                .map((item) => normalizeCode(item))
                .filter((item) => item.length > 0)
        )
    );
}
