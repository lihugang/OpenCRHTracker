import {
    appendServerTimingHeaders,
    finalizeSsrRenderTiming,
    initializeRequestTiming
} from '~/server/utils/timing/serverTiming';

export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('request', (event) => {
        initializeRequestTiming(event);
    });

    nitroApp.hooks.hook('render:response', (_response, { event }) => {
        finalizeSsrRenderTiming(event);
    });

    nitroApp.hooks.hook('beforeResponse', (event) => {
        appendServerTimingHeaders(event);
    });
});
