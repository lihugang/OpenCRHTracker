import type { H3Event } from 'h3';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';

export interface ExecuteApiOptions<TData> {
    requireApiKey?: boolean;
    fixedCost?: number;
    dynamicCostFromData?: (data: TData) => number;
    successStatusCode?: number;
}

export interface ExecuteApiContext {
    event: H3Event;
    identity: ApiIdentity;
}
