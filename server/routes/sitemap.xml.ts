import { defineEventHandler, getRequestURL, setHeader, type H3Event } from 'h3';
import useConfig from '~/server/config';
import { listPublicFeedbackTopics } from '~/server/services/feedbackStore';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { listDocsApiEndpoints } from '~/utils/docs/apiDocs';

interface SitemapUrlEntry {
    path: string;
    lastmod?: string;
}

function escapeXml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function normalizeOrigin(value: string) {
    return value.trim().replace(/\/+$/, '');
}

function resolveOrigin(event: H3Event) {
    const runtimeConfig = useRuntimeConfig();

    if (
        typeof runtimeConfig.public.siteUrl === 'string' &&
        runtimeConfig.public.siteUrl.trim()
    ) {
        return normalizeOrigin(runtimeConfig.public.siteUrl);
    }

    return getRequestURL(event).origin;
}

function buildAbsoluteUrl(origin: string, path: string) {
    return origin + (path.startsWith('/') ? path : '/' + path);
}

function toIsoDate(timestampSeconds: number) {
    return new Date(timestampSeconds * 1000).toISOString();
}

function buildSitemapXml(origin: string, entries: SitemapUrlEntry[]) {
    const body = entries
        .map((entry) => {
            const lastmodXml = entry.lastmod
                ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>`
                : '';

            return `<url><loc>${escapeXml(buildAbsoluteUrl(origin, entry.path))}</loc>${lastmodXml}</url>`;
        })
        .join('');

    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

function listAllPublicFeedbackSitemapEntries() {
    const entries: SitemapUrlEntry[] = [];
    let cursor = null;

    while (true) {
        const result = listPublicFeedbackTopics({}, cursor, 200);

        for (const topic of result.items) {
            entries.push({
                path: `/feedback/${topic.id}`,
                lastmod: toIsoDate(topic.lastRepliedAt || topic.updatedAt)
            });
        }

        if (!result.nextCursor || result.rows.length === 0) {
            break;
        }

        const lastRow = result.rows[result.rows.length - 1]!;
        cursor = {
            lastRepliedAt: lastRow.last_replied_at,
            id: lastRow.id
        };
    }

    return entries;
}

export default defineEventHandler((event) => {
    const cacheMaxAge = useConfig().api.cache.sitemapMaxAgeSeconds;
    const origin = resolveOrigin(event);
    const staticEntries: SitemapUrlEntry[] = [
        { path: '/' },
        { path: '/about' },
        { path: '/docs' },
        { path: '/docs/deploy' },
        { path: '/docs/crawl' },
        { path: '/docs/api' },
        { path: '/exports/daily' },
        { path: '/feedback' }
    ];
    const docsApiEntries = listDocsApiEndpoints().map((endpoint) => ({
        path: `/docs/api/${endpoint.slug}`
    }));
    const publicFeedbackEntries = listAllPublicFeedbackSitemapEntries();

    setCacheControl(event, cacheMaxAge);
    setHeader(event, 'content-type', 'application/xml; charset=UTF-8');

    return buildSitemapXml(origin, [
        ...staticEntries,
        ...docsApiEntries,
        ...publicFeedbackEntries
    ]);
});
