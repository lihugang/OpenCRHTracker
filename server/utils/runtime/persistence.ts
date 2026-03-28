import fs from 'fs';
import path from 'path';
import { writeTextFileAtomically } from '~/server/utils/dataAssets/store';

type FlushCallback = () => void;

interface RuntimePersistenceState {
    callbacks: Set<FlushCallback>;
    registered: boolean;
}

interface GlobalWithRuntimePersistence {
    __openCrhRuntimePersistence?: RuntimePersistenceState;
}

function getRuntimePersistenceState() {
    const globalScope = globalThis as GlobalWithRuntimePersistence;
    if (!globalScope.__openCrhRuntimePersistence) {
        globalScope.__openCrhRuntimePersistence = {
            callbacks: new Set<FlushCallback>(),
            registered: false
        };
    }

    return globalScope.__openCrhRuntimePersistence;
}

function flushAllCallbacks() {
    const state = getRuntimePersistenceState();
    for (const callback of state.callbacks) {
        try {
            callback();
        } catch (error) {
            console.warn('[runtime-persistence] flush callback failed:', error);
        }
    }
}

function registerProcessHooks() {
    const state = getRuntimePersistenceState();
    if (state.registered) {
        return;
    }

    state.registered = true;

    process.once('beforeExit', flushAllCallbacks);
    process.once('SIGINT', () => {
        flushAllCallbacks();
        process.exit(130);
    });
    process.once('SIGTERM', () => {
        flushAllCallbacks();
        process.exit(143);
    });
}

export function registerRuntimeFlushCallback(callback: FlushCallback) {
    const state = getRuntimePersistenceState();
    state.callbacks.add(callback);
    registerProcessHooks();
}

export function startRuntimeFlushInterval(
    intervalMs: number,
    flush: FlushCallback
) {
    const timer = setInterval(flush, intervalMs);
    timer.unref?.();
    return timer;
}

export function readJsonFileIfExists<T>(filePath: string): T | null {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as T;
    } catch {
        return null;
    }
}

export function writeJsonFile(filePath: string, value: unknown): void {
    writeTextFileAtomically(
        path.resolve(filePath),
        `${JSON.stringify(value, null, 4)}\n`
    );
}
