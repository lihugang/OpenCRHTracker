import { beginSsrRenderTiming } from '~/server/utils/timing/serverTiming';

export default defineNuxtPlugin((nuxtApp) => {
    const event = nuxtApp.ssrContext?.event;
    if (!event) {
        return;
    }

    beginSsrRenderTiming(event);
});
