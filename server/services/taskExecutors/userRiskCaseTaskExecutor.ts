import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    executeQueuedUserRiskCase,
    USER_RISK_TASK_EXECUTOR
} from '~/server/services/userBanSecurityStore';

interface UserRiskCaseTaskArguments {
    riskCaseId: number;
}

function parseArguments(value: unknown): UserRiskCaseTaskArguments {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('user risk case task arguments must be an object');
    }

    const riskCaseId = (value as { riskCaseId?: unknown }).riskCaseId;
    if (!Number.isSafeInteger(riskCaseId) || (riskCaseId as number) <= 0) {
        throw new Error(
            'user risk case task riskCaseId must be a positive integer'
        );
    }

    return {
        riskCaseId: riskCaseId as number
    };
}

export function registerUserRiskCaseTaskExecutor() {
    registerTaskExecutor(USER_RISK_TASK_EXECUTOR, async (value) => {
        const args = parseArguments(value);
        executeQueuedUserRiskCase(args.riskCaseId);
    });
}
