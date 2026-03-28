export type LookupTargetType = 'train' | 'emu';

export interface LookupTarget {
    type: LookupTargetType;
    code: string;
}

export interface LookupSuggestItem {
    type: LookupTargetType;
    code: string;
    subtitle: string;
    tags: string[];
}

export interface LookupIndexResponse {
    items: LookupSuggestItem[];
}

export interface TrainHistoryRecord {
    id: string;
    startAt: number;
    endAt: number;
    emuCode: string;
    startStation: string;
    endStation: string;
}

export interface EmuHistoryRecord {
    id: string;
    startAt: number;
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

export interface LookupHistoryListItem {
    id: string;
    startAt: number;
    endAt: number;
    code: string;
    startStation: string;
    endStation: string;
}

export interface CurrentTrainTimetableStop {
    stationNo: number;
    stationName: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: string;
    wicket: string;
    isStart: boolean;
    isEnd: boolean;
}

export interface CurrentTrainTimetableData {
    updatedAt: number | null;
    requestTrainCode: string;
    trainCode: string;
    internalCode: string;
    allCodes: string[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    stops: CurrentTrainTimetableStop[];
}

export type RecentAssignmentsState =
    | 'idle'
    | 'loading'
    | 'success'
    | 'empty'
    | 'error';
