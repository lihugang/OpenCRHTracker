export type QueryTabKey = 'train' | 'emu' | 'daily';

export type QueryRequestState =
    | 'idle'
    | 'loading'
    | 'success'
    | 'empty'
    | 'error';

export interface WorkbenchResultMeta {
    label: string;
    value: string;
}

export interface WorkbenchResultItem {
    id: string;
    title: string;
    subtitle: string;
    timestampLabel?: string;
    badges: string[];
    route?: {
        start: string;
        end: string;
    };
    meta: WorkbenchResultMeta[];
}

export interface QueryTabOption {
    value: QueryTabKey;
    label: string;
    hint: string;
}

export interface QueryFieldDefinition {
    key: string;
    label: string;
    type?: 'text' | 'date';
    placeholder?: string;
    help?: string;
    inputMode?: 'text' | 'numeric';
    autocomplete?: string;
}

export interface TrackerApiSuccess<TData> {
    ok: true;
    data: TData;
    error: '';
}

export interface TrackerApiFailure {
    ok: false;
    data: string;
    error: string;
}

export type TrackerApiResponse<TData> =
    | TrackerApiSuccess<TData>
    | TrackerApiFailure;

export interface PaginatedQueryResponse<TItem> {
    items: TItem[];
    nextCursor: string;
    limit: number;
}
