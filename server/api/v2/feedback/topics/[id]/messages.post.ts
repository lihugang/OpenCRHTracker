import { defineEventHandler } from 'h3';
import executeV2Operation from '~/server/utils/api/v2/executeV2Operation';

export default defineEventHandler((event) => {
    return executeV2Operation(event, 'PostFeedbackTopicMessage');
});
