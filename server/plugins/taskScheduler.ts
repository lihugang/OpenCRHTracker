import { startTaskScheduler } from '~/server/services/taskScheduler';

export default defineNitroPlugin(() => {
    startTaskScheduler();
});
