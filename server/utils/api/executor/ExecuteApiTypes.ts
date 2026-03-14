import type { H3Event } from 'h3';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';

export interface ExecuteApiOptions<TData> {
    requiredScopes?: string[];
    cors?: boolean;
    bypassAnonymousQuota?: boolean;
    fixedCost?: number;
    dynamicCostFromData?: (data: TData) => number;
    successHeaders?: (event: H3Event, data: TData) => void;
    successStatusCode?: number;
}

export interface ExecuteApiContext {
    event: H3Event;
    identity: ApiIdentity;
}
