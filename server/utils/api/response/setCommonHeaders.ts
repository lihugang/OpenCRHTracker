import { setHeader, type H3Event } from 'h3';
import useConfig from '~/server/config';
import type ResponseMeta from '~/server/utils/api/response/ResponseMeta';

export default function setCommonHeaders(event: H3Event, meta: ResponseMeta) {
    const config = useConfig();
    setHeader(event, config.api.headers.remain, String(meta.remain));
    setHeader(event, config.api.headers.cost, String(meta.cost));
    if (meta.retryAfter !== undefined) {
        setHeader(
            event,
            config.api.headers.retryAfter,
            String(meta.retryAfter)
        );
    }
}
