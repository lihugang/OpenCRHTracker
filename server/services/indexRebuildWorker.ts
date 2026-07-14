import { Worker } from 'node:worker_threads';
import getLogger from '~/server/libs/log4js';
import {
    installReferenceModelIndexCache,
    type ReferenceModelIndexCache
} from '~/server/services/referenceModelIndexStore';
import {
    installTrainCirculationIndexCache,
    type TrainCirculationIndexCache
} from '~/server/services/trainCirculationIndexStore';
import type {
    IndexRebuildKind,
    IndexRebuildRequest,
    IndexRebuildResponse
} from '~/server/workers/indexRebuildProtocol';
import { getScheduleStateVersion } from '~/server/utils/12306/scheduleProbe/stateStore';

const logger = getLogger('index-rebuild-worker');

interface PendingRequest {
    kind: IndexRebuildKind;
    resolve: () => void;
    reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
let shuttingDown = false;
const pendingRequests = new Map<number, PendingRequest>();
const inFlightByKind = new Map<IndexRebuildKind, Promise<void>>();

function installCache(
    response: Extract<IndexRebuildResponse, { type: 'success' }>
) {
    if (response.kind === 'rebuild_train_circulation_index') {
        const cache = response.cache as TrainCirculationIndexCache;
        installTrainCirculationIndexCache({
            ...cache,
            scheduleStateVersion: getScheduleStateVersion()
        });
        return;
    }

    installReferenceModelIndexCache(response.cache as ReferenceModelIndexCache);
}

function rejectPendingRequests(error: Error) {
    for (const pending of pendingRequests.values()) {
        pending.reject(error);
    }
    pendingRequests.clear();
}

function handleWorkerExit(exitCode: number) {
    worker = null;
    if (shuttingDown) {
        return;
    }

    const error = new Error(
        `Index rebuild worker exited with code ${exitCode}`
    );
    logger.error(error.message);
    rejectPendingRequests(error);
}

function getWorker() {
    if (worker) {
        return worker;
    }
    if (shuttingDown) {
        throw new Error('Index rebuild worker is shutting down');
    }

    const nextWorker = new Worker(
        new URL('./index-rebuild.mjs', import.meta.url)
    );
    nextWorker.on('message', (response: IndexRebuildResponse) => {
        const pending = pendingRequests.get(response.requestId);
        if (!pending || pending.kind !== response.kind) {
            return;
        }
        pendingRequests.delete(response.requestId);

        if (response.type === 'failure') {
            pending.reject(new Error(response.error));
            return;
        }

        try {
            installCache(response);
            pending.resolve();
        } catch (error) {
            pending.reject(
                error instanceof Error ? error : new Error(String(error))
            );
        }
    });
    nextWorker.on('error', (error: unknown) => {
        const normalizedError =
            error instanceof Error ? error : new Error(String(error));
        logger.error(`worker_error error=${normalizedError.message}`);
        rejectPendingRequests(normalizedError);
    });
    nextWorker.on('exit', handleWorkerExit);
    worker = nextWorker;
    return nextWorker;
}

function runIndexRebuildInternal(kind: IndexRebuildKind) {
    const requestId = nextRequestId;
    nextRequestId += 1;

    return new Promise<void>((resolve, reject) => {
        pendingRequests.set(requestId, { kind, resolve, reject });
        const request: IndexRebuildRequest = {
            type: 'rebuild',
            requestId,
            kind
        };
        try {
            getWorker().postMessage(request);
        } catch (error) {
            pendingRequests.delete(requestId);
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });
}

export function runIndexRebuild(kind: IndexRebuildKind): Promise<void> {
    const current = inFlightByKind.get(kind);
    if (current) {
        return current;
    }

    const promise = runIndexRebuildInternal(kind).finally(() => {
        if (inFlightByKind.get(kind) === promise) {
            inFlightByKind.delete(kind);
        }
    });
    inFlightByKind.set(kind, promise);
    return promise;
}

export async function shutdownIndexRebuildWorker() {
    shuttingDown = true;
    const currentWorker = worker;
    worker = null;
    rejectPendingRequests(new Error('Index rebuild worker shut down'));
    if (currentWorker) {
        await currentWorker.terminate();
    }
}
