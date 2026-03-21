export interface FeedbackSourceContext {
    sourcePath: string;
    sourceFullPath: string;
    sourceTitle: string;
    sourceType: 'home' | 'train' | 'emu' | 'other';
    sourceCode: string;
    sourceSummary: string;
}

function readQueryString(value: unknown) {
    if (typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0];
    }

    return '';
}

export function buildFeedbackSourceQuery(context: FeedbackSourceContext) {
    const query: Record<string, string> = {};

    if (context.sourcePath) {
        query.sourcePath = context.sourcePath;
    }
    if (context.sourceFullPath) {
        query.sourceFullPath = context.sourceFullPath;
    }
    if (context.sourceTitle) {
        query.sourceTitle = context.sourceTitle;
    }
    if (context.sourceType && context.sourceType !== 'other') {
        query.sourceType = context.sourceType;
    }
    if (context.sourceCode) {
        query.sourceCode = context.sourceCode;
    }
    if (context.sourceSummary) {
        query.sourceSummary = context.sourceSummary;
    }

    return query;
}

export function readFeedbackSourceQuery(
    query: Record<string, unknown>,
    fallback: Partial<FeedbackSourceContext> = {}
): FeedbackSourceContext {
    const sourceType = readQueryString(query.sourceType);

    return {
        sourcePath:
            readQueryString(query.sourcePath) || fallback.sourcePath || '',
        sourceFullPath:
            readQueryString(query.sourceFullPath) ||
            fallback.sourceFullPath ||
            '',
        sourceTitle:
            readQueryString(query.sourceTitle) || fallback.sourceTitle || '',
        sourceType:
            sourceType === 'home' ||
            sourceType === 'train' ||
            sourceType === 'emu' ||
            sourceType === 'other'
                ? sourceType
                : fallback.sourceType || 'other',
        sourceCode:
            readQueryString(query.sourceCode) || fallback.sourceCode || '',
        sourceSummary:
            readQueryString(query.sourceSummary) ||
            fallback.sourceSummary ||
            ''
    };
}

export function hasFeedbackSource(context: FeedbackSourceContext) {
    return Boolean(
        context.sourcePath ||
            context.sourceCode ||
            context.sourceSummary ||
            context.sourceTitle
    );
}
