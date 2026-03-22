import { computed, toValue } from 'vue';

interface JsonLdNode {
    [key: string]: unknown;
}

interface UseSiteSeoInput {
    title?: string | (() => string);
    description?: string | (() => string);
    path?: string | (() => string);
    image?: string | (() => string);
    type?: 'website' | 'article';
    noindex?: boolean | (() => boolean);
    jsonLd?: JsonLdNode | JsonLdNode[] | null | (() => JsonLdNode | JsonLdNode[] | null);
}

const DEFAULT_SITE_NAME = 'Open CRH Tracker';
const DEFAULT_DESCRIPTION = '中国动车组担当及交路信息查询网站';
const DEFAULT_OG_IMAGE_PATH = '/icons/icon-512x512.png';

function normalizeOrigin(value: string) {
    return value.trim().replace(/\/+$/, '');
}

function normalizePath(value: string) {
    if (!value) {
        return '/';
    }

    if (/^https?:\/\//i.test(value)) {
        return value;
    }

    return value.startsWith('/') ? value : '/' + value;
}

function joinUrl(origin: string, path: string) {
    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    if (!origin) {
        return path;
    }

    return normalizeOrigin(origin) + normalizePath(path);
}

export function useSiteSeo(input: UseSiteSeoInput) {
    const route = useRoute();
    const runtimeConfig = useRuntimeConfig();
    const requestUrl = import.meta.server ? useRequestURL() : null;

    const title = computed(() => toValue(input.title) || DEFAULT_SITE_NAME);
    const description = computed(
        () => toValue(input.description) || DEFAULT_DESCRIPTION
    );
    const resolvedPath = computed(() =>
        normalizePath(toValue(input.path) || route.path)
    );
    const origin = computed(() => {
        const configuredSiteUrl =
            typeof runtimeConfig.public.siteUrl === 'string'
                ? runtimeConfig.public.siteUrl
                : '';

        if (configuredSiteUrl.trim()) {
            return normalizeOrigin(configuredSiteUrl);
        }

        if (requestUrl) {
            return requestUrl.origin;
        }

        if (import.meta.client) {
            return window.location.origin;
        }

        return '';
    });
    const canonicalUrl = computed(() => joinUrl(origin.value, resolvedPath.value));
    const imageUrl = computed(() =>
        joinUrl(origin.value, toValue(input.image) || DEFAULT_OG_IMAGE_PATH)
    );
    const pageType = computed(() => input.type ?? 'website');
    const noindex = computed(() => Boolean(toValue(input.noindex)));
    const robots = computed(() =>
        noindex.value ? 'noindex, nofollow' : 'index, follow'
    );
    const jsonLd = computed(() => toValue(input.jsonLd) ?? null);

    useSeoMeta({
        title,
        description,
        robots,
        ogSiteName: DEFAULT_SITE_NAME,
        ogTitle: title,
        ogDescription: description,
        ogType: pageType,
        ogUrl: canonicalUrl,
        ogImage: imageUrl,
        twitterCard: 'summary_large_image',
        twitterTitle: title,
        twitterDescription: description,
        twitterImage: imageUrl
    });

    useHead(() => ({
        link: canonicalUrl.value
            ? [
                  {
                      rel: 'canonical',
                      href: canonicalUrl.value
                  }
              ]
            : [],
        script: jsonLd.value
            ? [
                  {
                      type: 'application/ld+json',
                      children: JSON.stringify(jsonLd.value)
                  }
              ]
            : []
    }));
}
