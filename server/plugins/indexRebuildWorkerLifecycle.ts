import { shutdownIndexRebuildWorker } from '~/server/services/indexRebuildWorker';

export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('close', async () => {
        await shutdownIndexRebuildWorker();
    });
});
