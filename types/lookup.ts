export type LookupTargetType = 'train' | 'emu';

export interface LookupTarget {
    type: LookupTargetType;
    code: string;
}

export interface TrainHistoryRecord {
    id: string;
    ts: number;
    endAt: number;
    emuCode: string;
    startStation: string;
    endStation: string;
}

export interface EmuHistoryRecord {
    id: string;
    ts: number;
    endAt: number;
    trainCode: string;
    startStation: string;
    endStation: string;
}

export interface HistoryResponseBase<TItem> {
    cursor: string;
    limit: number;
    nextCursor: string;
    items: TItem[];
}

export interface TrainHistoryResponse extends HistoryResponseBase<TrainHistoryRecord> {
    trainCode: string;
    start?: number | null;
    end?: number | null;
}

export interface EmuHistoryResponse extends HistoryResponseBase<EmuHistoryRecord> {
    emuCode: string;
    start?: number | null;
    end?: number | null;
}

export interface RecentAssignmentGroup {
    id: string;
    dayLabel: string;
    timeLabel: string;
    routeLabel: string;
    startAt: number;
    endAt: number;
    startStation: string;
    endStation: string;
    primaryCodes: string[];
}

export type RecentAssignmentsState =
    | 'idle'
    | 'loading'
    | 'success'
    | 'empty'
    | 'error';
