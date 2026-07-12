import type { ReferenceModelIndexCache } from '~/server/services/referenceModelIndexStore';
import type { TrainCirculationIndexCache } from '~/server/services/trainCirculationIndexStore';

export type IndexRebuildKind =
    | 'rebuild_train_circulation_index'
    | 'rebuild_reference_model_index';

export interface IndexRebuildRequest {
    type: 'rebuild';
    requestId: number;
    kind: IndexRebuildKind;
}

export interface IndexRebuildSuccess {
    type: 'success';
    requestId: number;
    kind: IndexRebuildKind;
    cache: TrainCirculationIndexCache | ReferenceModelIndexCache;
}

export interface IndexRebuildFailure {
    type: 'failure';
    requestId: number;
    kind: IndexRebuildKind;
    error: string;
}

export type IndexRebuildResponse = IndexRebuildSuccess | IndexRebuildFailure;
