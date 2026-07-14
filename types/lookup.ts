export type LookupTargetType = 'train' | 'emu' | 'station';
export type FutureAssignmentPredictionSourceType = Extract<
    LookupTargetType,
    'train' | 'emu'
>;

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

export type RecentLookupSearchItem = LookupSuggestItem;

export interface FavoriteLookupInput {
    type: LookupTargetType;
    code: string;
    tags: string[];
}

export interface FavoriteLookupItem extends FavoriteLookupInput {
    starredAt: number;
}

export type LookupSuggestionMode = 'recent' | 'suggestions';

export interface LookupIndexResponse {
    items: LookupSuggestItem[];
}

export interface HistoricalTimetableRef {
    serviceDate: string;
    timetableId: number | null;
}

export interface TrainHistoryRecord extends HistoricalTimetableRef {
    id: string;
    emuCode: string;
}

export interface EmuHistoryRecord extends HistoricalTimetableRef {
    id: string;
    trainCode: string;
}

export interface StationTimetableRecord {
    trainCode: string;
    allCodes: string[];
    arriveAt: number | null;
    departAt: number | null;
    startStation: string;
    endStation: string;
    updatedAt: number | null;
    referenceModels: ReferenceModelItem[];
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

export interface StationTimetableResponse extends HistoryResponseBase<StationTimetableRecord> {
    stationName: string;
}

export interface EmuAllocationProfileResponse {
    requestEmuCode: string;
    emuCode: string;
    model: string;
    trainSetNo: string;
    bureau: string;
    trainDepot: string;
    depot: string;
    subModel: string;
    customType: string;
    trainsetManufacturer: string;
    trailerManufacturer: string;
    manufactureMonth: string;
    designMaxSpeed: number;
    operatingMaxSpeed: number;
    isPublic: boolean;
    railwayTravelCodeEnabled: boolean;
    firstClassPowerLegrest: boolean;
    toiletStatus: string;
    socketLocation: string;
    businessSeatType: string;
    modelRemark: string;
    note: string;
    tags: string[];
    alias: string[];
    coachLayouts: EmuAllocationCoachLayoutItem[];
}

export interface EmuAllocationCoachLayoutItem {
    coachNo: number;
    coachTypeCode: string;
    coachTypeName: string;
    capacity: number;
    hasPower: boolean;
    hasPantograph: boolean;
    hasLargeLuggageArea: boolean;
    hasAccessibleFacility: boolean;
}

export interface LookupHistoryListItem {
    id: string;
    serviceDate: string;
    timetableId: number | null;
    startAt: number | null;
    endAt: number | null;
    code: string;
    startStation: string | null;
    endStation: string | null;
}

export interface TrainTimetableHistoryListItem {
    id: number;
    historyId: number;
    serviceDateStart: string;
    serviceDateEndExclusive: string;
}

export interface TrainTimetableHistoryListResponse extends HistoryResponseBase<TrainTimetableHistoryListItem> {
    trainCode: string;
}

export interface CurrentTrainTimetableStop {
    stationNo: number;
    stationName: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: string;
    wicket: string;
    distance: number | null;
    platformNo: number | null;
    isStart: boolean;
    isEnd: boolean;
}

export interface HistoricalTimetableStop {
    stationNo: number;
    stationName: string;
    arriveOffset: number | null;
    departOffset: number | null;
    stationTrainCode: string;
    isStart: boolean;
    isEnd: boolean;
}

export interface HistoricalTimetableData {
    historyId: number;
    startStation: string | null;
    endStation: string | null;
    startOffset: number | null;
    endOffset: number | null;
    stops: HistoricalTimetableStop[];
}

export interface TrainCirculationNode {
    internalCode: string;
    allCodes: string[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
}

export interface InferredTrainCirculationMetadata {
    routeId: string;
    windowStart: number;
    windowEnd: number;
    threshold: number;
    lowestLinkWeight: number | null;
    lowestLinkSupportCount: number | null;
    containsLoopBreak: boolean;
}

export interface InferredTrainCirculationReference {
    source: 'inferred';
    refreshAt: number | null;
    nodes: TrainCirculationNode[];
    metadata: InferredTrainCirculationMetadata;
}

export type OfficialCirculationValidationState =
    | 'raw_official'
    | 'split_official'
    | 'unmatched_official';

export interface TrainCirculationMetadata extends Partial<InferredTrainCirculationMetadata> {
    validationState?: OfficialCirculationValidationState;
    originalOfficialEntryKey?: string;
    splitSegmentIndex?: number;
    splitSegmentCount?: number;
    matchedInferredRouteId?: string;
    // Filled for unmatched_official and for the matched segment of split_official.
    candidateInferredCirculation?: InferredTrainCirculationReference | null;
}

export interface TrainCirculation {
    source: 'official' | 'inferred';
    refreshAt: number | null;
    nodes: TrainCirculationNode[];
    metadata?: TrainCirculationMetadata;
}

export interface CurrentTrainTimetableData {
    updatedAt: number | null;
    requestTrainCode: string;
    trainCode: string;
    internalCode: string;
    allCodes: string[];
    bureauCode: string;
    bureauName: string;
    trainDepartment: string;
    passengerDepartment: string;
    referenceModels: ReferenceModelItem[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    circulation: TrainCirculation | null;
    stops: CurrentTrainTimetableStop[];
}

export interface TrainCirculationImageData {
    requestTrainCode: string;
    trainCode: string;
    documentId: string;
    imageUrl: string;
}

export type FutureAssignmentPredictionMatchSource =
    | 'train-history'
    | 'emu-history'
    | 'yesterday-rollover'
    | 'template';

export type FutureAssignmentPredictionStatus =
    | 'idle'
    | 'no_circulation'
    | 'unresolved'
    | 'no_future'
    | 'ready';

export type FutureAssignmentAnchorResolvedBy =
    | 'today-history'
    | 'yesterday-rollover'
    | 'historical-route-anchor';

export interface FutureAssignmentPredictionNode {
    key: string;
    allCodes: string[];
    startStation: string;
    endStation: string;
    predictedStartAt: number | null;
    predictedEndAt: number | null;
    routeDayOffset: number;
    routeNodeIndex: number;
    dayOffsetFromToday: number;
    matchedBy: FutureAssignmentPredictionMatchSource;
}

export interface FutureAssignmentPredictedEmuItem {
    key: string;
    emuCodes: string[];
    predictedStartAt: number | null;
    predictedEndAt: number | null;
    dayOffsetFromToday: number;
    routeDayOffset: number;
    startStation: string;
    endStation: string;
    matchedBy: FutureAssignmentPredictionMatchSource;
}

export interface FutureAssignmentProgress {
    currentRouteDayOffset: number;
    currentNodeIndex: number;
    resolvedBy: FutureAssignmentAnchorResolvedBy;
    matchedBy: FutureAssignmentPredictionMatchSource;
    actualDayOffsetFromToday: number;
}

export interface FutureAssignmentDisplayAnchor {
    mode: 'current-progress' | 'train-alignment';
    routeDayOffset: number;
    routeNodeIndex: number;
    resolvedBy: FutureAssignmentAnchorResolvedBy;
    matchedBy: FutureAssignmentPredictionMatchSource;
    actualDayOffsetFromToday: number;
}

export interface ReferenceModelItem {
    model: string;
    weightedShare: number;
}

export type RecentAssignmentsState =
    | 'idle'
    | 'loading'
    | 'success'
    | 'empty'
    | 'error';
