import {
    getDebugEchoError,
    getExposedConfig,
    getHealth
} from '~/server/domain/system';
import ensure from '~/server/utils/api/executor/ensure';
import type { V2OperationContext } from '~/server/utils/api/v2/V2Types';

export async function getHealthV2Adapter(ctx: V2OperationContext) {
    return getHealth();
}

export async function getDebugEchoErrorV2Adapter(
    ctx: V2OperationContext
) {
    const statusCode = Number(ctx.query.status ?? '400');
    const errorCode =
        typeof ctx.query.code === 'string' && ctx.query.code.length > 0
            ? ctx.query.code
            : 'debug_error';

    ensure(
        Number.isInteger(statusCode) &&
            statusCode >= 400 &&
            statusCode < 600,
        400,
        'invalid_param',
        'status 必须是 400-599 的整数'
    );

    getDebugEchoError({
        status: statusCode,
        code: errorCode
    });

    return {};
}

export async function getExposedConfigV2Adapter(
    ctx: V2OperationContext
) {
    return getExposedConfig();
}
