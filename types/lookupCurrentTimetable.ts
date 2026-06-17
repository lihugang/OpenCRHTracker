import type {
    CurrentTrainTimetableData,
    HistoricalTimetableData
} from '~/types/lookup';

export type LookupTimetableLoadState = 'idle' | 'loading' | 'ready' | 'error';
export type LookupCurrentTimetableViewState =
    | 'loading'
    | 'error'
    | 'empty'
    | 'success';
export type CirculationPdfState = 'idle' | 'loading' | 'ready' | 'error';
export type TimetableSourceKey = 'current' | `history:${number}`;
export type CirculationExportFormat = 'pdf' | 'png';

export interface DisplayTimetableStop {
    stationNo: number;
    stationName: string;
    stationTrainCode: string;
    arriveAt: number | null;
    departAt: number | null;
    wicket: string | null;
    distance: number | null;
    platformNo: number | null;
    isStart: boolean;
}

export interface DisplayCirculationNode {
    key: string;
    allCodes: string[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    isCurrent: boolean;
}

export interface TimetableSourceOption {
    value: TimetableSourceKey;
    label: string;
}

export interface HistoricalTimetableOption {
    sourceKey: TimetableSourceKey;
    historyId: number;
    serviceDateStart: string;
    serviceDateEndExclusive: string;
    isCurrent: boolean;
}

export interface DisplayTimetableData {
    allCodes: string[];
    startStation: string;
    endStation: string;
    stops: DisplayTimetableStop[];
    updatedAt: number | null;
    circulation: CurrentTrainTimetableData['circulation'];
    bureauName: string;
    trainDepartment: string;
    passengerDepartment: string;
    internalCode: string;
    requestTrainCode: string;
    isHistorical: boolean;
}

export interface PersistedLookupTimetableSectionState {
    timetableExpanded: boolean;
    circulationExpanded: boolean;
}

export type HistoricalTimetableStopItem =
    HistoricalTimetableData['stops'][number];
