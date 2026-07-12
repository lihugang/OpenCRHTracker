import { parentPort } from 'node:worker_threads';
import { rebuildReferenceModelIndex } from '~/server/services/referenceModelIndexStore';
import { rebuildTrainCirculationIndex } from '~/server/services/trainCirculationIndexStore';
import type {
    IndexRebuildRequest,
    IndexRebuildResponse
} from '~/server/workers/indexRebuildProtocol';

const port = parentPort;
if (!port) {
    throw new Error('Index rebuild worker requires a parent port');
}

port.on('message', (request: IndexRebuildRequest) => {
    if (request.type !== 'rebuild') {
        return;
    }

    try {
        const cache =
            request.kind === 'rebuild_train_circulation_index'
                ? rebuildTrainCirculationIndex()
                : rebuildReferenceModelIndex();
        const response: IndexRebuildResponse = {
            type: 'success',
            requestId: request.requestId,
            kind: request.kind,
            cache
        };
        port.postMessage(response);
    } catch (error) {
        const response: IndexRebuildResponse = {
            type: 'failure',
            requestId: request.requestId,
            kind: request.kind,
            error:
                error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : String(error)
        };
        port.postMessage(response);
    }
});
