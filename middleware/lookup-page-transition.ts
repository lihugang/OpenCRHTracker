const LOOKUP_DETAIL_PATH = /^\/(?:train|emu)\/[^/]+$/;

const LOOKUP_PAGE_TRANSITION = {
    name: 'page',
    mode: 'out-in'
} as const;

function isLookupDetailPath(path: string) {
    return LOOKUP_DETAIL_PATH.test(path);
}

export default defineNuxtRouteMiddleware((to, from) => {
    to.meta.pageTransition =
        to.path === '/' && isLookupDetailPath(from.path)
            ? LOOKUP_PAGE_TRANSITION
            : false;
});
