import { defineEventHandler } from 'h3';
import {
    getAuthorizeContext,
    parseAuthorizeRequest
} from '~/server/utils/oauth/authorizeRequest';

export default defineEventHandler((event) => {
    return getAuthorizeContext(event, parseAuthorizeRequest(event));
});
