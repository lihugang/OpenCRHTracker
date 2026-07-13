import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    executeQueuedUserBanAction,
    USER_BAN_TASK_EXECUTOR
} from '~/server/services/userBanSecurityStore';

interface BanUserAccountTaskArguments {
    actionId: number;
}

function parseArguments(value: unknown): BanUserAccountTaskArguments {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('ban user account task arguments must be an object');
    }

    const actionId = (value as { actionId?: unknown }).actionId;
    if (!Number.isSafeInteger(actionId) || (actionId as number) <= 0) {
        throw new Error('ban user account task actionId must be positive');
    }

    return {
        actionId: actionId as number
    };
}

export function registerBanUserAccountTaskExecutor() {
    registerTaskExecutor(USER_BAN_TASK_EXECUTOR, async (value) => {
        const args = parseArguments(value);
        executeQueuedUserBanAction(args.actionId);
    });
}
