const FEEDBACK_LIST_PATH = '/feedback';
const FEEDBACK_DETAIL_PATH = /^\/feedback\/[^/]+$/;

const FEEDBACK_PAGE_TRANSITION = {
    name: 'page',
    mode: 'out-in'
} as const;

function isFeedbackListPath(path: string) {
    return path === FEEDBACK_LIST_PATH;
}

function isFeedbackDetailPath(path: string) {
    return FEEDBACK_DETAIL_PATH.test(path);
}

export default defineNuxtRouteMiddleware((to, from) => {
    const isFeedbackPair =
        (isFeedbackListPath(to.path) && isFeedbackDetailPath(from.path)) ||
        (isFeedbackDetailPath(to.path) && isFeedbackListPath(from.path));

    to.meta.pageTransition = isFeedbackPair ? FEEDBACK_PAGE_TRANSITION : false;
});
