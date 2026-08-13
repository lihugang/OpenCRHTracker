import { postNotificationsSend } from '~/server/domain/notifications';
import type { V2OperationContext } from '~/server/utils/api/v2/V2Types';

export async function postNotificationsSendV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as {
        title?: string;
        body?: string;
        url?: string;
        tag?: string;
    };
    return postNotificationsSend(ctx.identity.id, {
        title: request.title ?? '',
        body: request.body ?? '',
        url: request.url ?? '',
        tag: request.tag ?? ''
    });
}
