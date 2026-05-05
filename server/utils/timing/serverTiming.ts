import {
    getRequestHeader,
    getRequestProtocol,
    getRequestURL,
    setHeader,
    type H3Event
} from 'h3';
import { useEvent } from 'nitropack/runtime';
import useConfig from '~/server/config';
import { adminServerMetricsRouteTemplates } from '~/server/utils/meta/routeTemplates';

type RequestTimingKind = 'ssr' | 'api';
type ServerTimingPhase = 'auth' | 'db' | 'compute' | 'render';

interface ActivePhaseFrame {
    name: ServerTimingPhase;
    startedAtMs: number;
}

interface SsrApiTimingEntry {
    metricName: string;
    durationMs: number;
}

interface RenderTimingState {
    startedAtMs: number | null;
    durationMs: number;
    finalized: boolean;
}

interface RequestTimingStore {
    kind: RequestTimingKind;
    startedAtMs: number;
    phaseDurationsMs: Record<ServerTimingPhase, number>;
    activePhases: ActivePhaseFrame[];
    render: RenderTimingState;
    ssrApiEntries: SsrApiTimingEntry[];
    headersWritten: boolean;
}

interface ServerTimingMetric {
    name: string;
    durationMs: number;
}

const REQUEST_TIMING_CONTEXT_KEY = '__openCrhRequestTiming';
const SSR_API_METRIC_PREFIX = 'api_';

function nowMs() {
    return Date.now();
}

function isApiRequest(pathname: string) {
    const versionPrefix = useConfig().api.versionPrefix;
    return pathname === versionPrefix || pathname.startsWith(`${versionPrefix}/`);
}

function isDocumentRequest(event: H3Event, pathname: string) {
    if (event.method !== 'GET' || isApiRequest(pathname)) {
        return false;
    }

    const fetchDestination = getRequestHeader(event, 'sec-fetch-dest');
    if (
        typeof fetchDestination === 'string' &&
        fetchDestination.toLowerCase() === 'document'
    ) {
        return true;
    }

    const accept = getRequestHeader(event, 'accept');
    return (
        typeof accept === 'string' && accept.toLowerCase().includes('text/html')
    );
}

function resolveRequestTimingKind(event: H3Event): RequestTimingKind | null {
    const pathname = getRequestURL(event).pathname;

    if (isApiRequest(pathname) && event.method !== 'OPTIONS') {
        return 'api';
    }

    if (isDocumentRequest(event, pathname)) {
        return 'ssr';
    }

    return null;
}

function pauseActivePhase(store: RequestTimingStore, timestampMs: number) {
    const activePhase = store.activePhases.at(-1);
    if (!activePhase) {
        return;
    }

    store.phaseDurationsMs[activePhase.name] += Math.max(
        0,
        timestampMs - activePhase.startedAtMs
    );
    activePhase.startedAtMs = timestampMs;
}

function addPhaseDuration(
    store: RequestTimingStore,
    phase: ServerTimingPhase,
    durationMs: number
) {
    store.phaseDurationsMs[phase] += Math.max(0, durationMs);
}

function resumeActivePhase(store: RequestTimingStore, timestampMs: number) {
    const activePhase = store.activePhases.at(-1);
    if (!activePhase) {
        return;
    }

    activePhase.startedAtMs = timestampMs;
}

function enterPhase(store: RequestTimingStore, phase: ServerTimingPhase) {
    const timestampMs = nowMs();
    pauseActivePhase(store, timestampMs);
    store.activePhases.push({
        name: phase,
        startedAtMs: timestampMs
    });
}

function exitPhase(store: RequestTimingStore, phase: ServerTimingPhase) {
    const timestampMs = nowMs();
    const activePhase = store.activePhases.at(-1);
    if (!activePhase || activePhase.name !== phase) {
        return;
    }

    store.phaseDurationsMs[phase] += Math.max(
        0,
        timestampMs - activePhase.startedAtMs
    );
    store.activePhases.pop();
    resumeActivePhase(store, timestampMs);
}

function getEventTimingStore(event: H3Event) {
    return (event.context as Record<string, unknown>)[
        REQUEST_TIMING_CONTEXT_KEY
    ] as RequestTimingStore | undefined;
}

function getCurrentEvent() {
    try {
        return useEvent();
    } catch {
        return null;
    }
}

function getCurrentRequestTimingStore() {
    const event = getCurrentEvent();
    if (!event) {
        return null;
    }

    return getEventTimingStore(event) ?? null;
}

function resolveTimingAllowOrigin(event: H3Event) {
    const origin = getRequestHeader(event, 'origin');
    if (origin) {
        return origin;
    }

    const url = getRequestURL(event);
    return `${getRequestProtocol(event)}://${url.host}`;
}

function formatServerTiming(metrics: ServerTimingMetric[]) {
    return metrics
        .map(
            (metric) =>
                `${metric.name};dur=${Math.max(0, Math.round(metric.durationMs))}`
        )
        .join(', ');
}

function appendMetric(metrics: ServerTimingMetric[], name: string, durationMs: number) {
    metrics.push({
        name,
        durationMs: Math.max(0, Math.round(durationMs))
    });
}

function normalizeMetricNameSegment(segment: string) {
    return segment
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function findDynamicRouteTemplate(kind: RequestTimingKind, pathname: string) {
    const routeTemplates = adminServerMetricsRouteTemplates[kind];
    const pathnameSegments = pathname.split('/').filter(Boolean);

    for (const routeTemplate of routeTemplates) {
        if (routeTemplate.segments.length !== pathnameSegments.length) {
            continue;
        }

        let matched = true;
        for (const [index, segment] of routeTemplate.segments.entries()) {
            const pathnameSegment = pathnameSegments[index];
            if (!pathnameSegment) {
                matched = false;
                break;
            }

            if (!segment.startsWith(':') && segment !== pathnameSegment) {
                matched = false;
                break;
            }
        }

        if (matched) {
            return routeTemplate.template;
        }
    }

    return null;
}

function normalizeApiTimingMetricName(pathname: string) {
    const routeTemplate = findDynamicRouteTemplate('api', pathname) ?? pathname;
    const versionPrefix = useConfig().api.versionPrefix;
    const relativePath = routeTemplate.startsWith(`${versionPrefix}/`)
        ? routeTemplate.slice(versionPrefix.length + 1)
        : routeTemplate.replace(/^\//, '');
    const segments = relativePath.split('/').filter(Boolean);
    const metricSegments = segments.map((segment) => {
        if (segment.startsWith(':')) {
            return `by_${normalizeMetricNameSegment(segment.slice(1))}`;
        }

        return normalizeMetricNameSegment(segment);
    });

    return `${SSR_API_METRIC_PREFIX}${metricSegments.join('_')}`;
}

function parseServerTimingHeader(headerValue: string | null | undefined) {
    const metrics = new Map<string, number>();
    if (!headerValue) {
        return metrics;
    }

    for (const rawEntry of headerValue.split(',')) {
        const entry = rawEntry.trim();
        if (!entry) {
            continue;
        }

        const [rawName, ...parameters] = entry.split(';');
        const name = rawName?.trim();
        if (!name) {
            continue;
        }

        const durationParameter = parameters.find((parameter) =>
            parameter.trim().startsWith('dur=')
        );
        if (!durationParameter) {
            continue;
        }

        const durationText = durationParameter.trim().slice(4);
        const durationMs = Number.parseFloat(durationText);
        if (!Number.isFinite(durationMs)) {
            continue;
        }

        metrics.set(name, Math.max(0, durationMs));
    }

    return metrics;
}

function buildServerTimingMetrics(store: RequestTimingStore) {
    const metrics: ServerTimingMetric[] = [];
    const totalDurationMs = Math.max(0, nowMs() - store.startedAtMs);

    appendMetric(metrics, 'total', totalDurationMs);
    appendMetric(metrics, 'auth', store.phaseDurationsMs.auth);
    appendMetric(metrics, 'db', store.phaseDurationsMs.db);
    appendMetric(metrics, 'compute', store.phaseDurationsMs.compute);

    if (store.kind === 'ssr') {
        appendMetric(metrics, 'render', store.phaseDurationsMs.render);
        for (const [index, entry] of store.ssrApiEntries.entries()) {
            appendMetric(metrics, `${entry.metricName}_${index + 1}`, entry.durationMs);
        }
    }

    return metrics;
}

export function initializeRequestTiming(event: H3Event) {
    const kind = resolveRequestTimingKind(event);
    if (!kind) {
        return null;
    }

    const startedAtMs = nowMs();
    const store: RequestTimingStore = {
        kind,
        startedAtMs,
        phaseDurationsMs: {
            auth: 0,
            db: 0,
            compute: 0,
            render: 0
        },
        activePhases: [
            {
                name: 'compute',
                startedAtMs
            }
        ],
        render: {
            startedAtMs: null,
            durationMs: 0,
            finalized: false
        },
        ssrApiEntries: [],
        headersWritten: false
    };

    (event.context as Record<string, unknown>)[REQUEST_TIMING_CONTEXT_KEY] = store;
    return store;
}

export function measureServerTimingPhase<T>(
    phase: ServerTimingPhase,
    callback: () => T
): T;
export function measureServerTimingPhase<T>(
    phase: ServerTimingPhase,
    callback: () => Promise<T>
): Promise<T>;
export function measureServerTimingPhase<T>(
    phase: ServerTimingPhase,
    callback: () => T | Promise<T>
) {
    const store = getCurrentRequestTimingStore();
    if (!store) {
        return callback();
    }

    enterPhase(store, phase);
    try {
        const result = callback();
        if (result && typeof (result as Promise<T>).then === 'function') {
            return (result as Promise<T>).finally(() => {
                exitPhase(store, phase);
            });
        }

        exitPhase(store, phase);
        return result;
    } catch (error) {
        exitPhase(store, phase);
        throw error;
    }
}

export function beginSsrRenderTiming(event: H3Event) {
    const store = getEventTimingStore(event);
    if (
        !store ||
        store.kind !== 'ssr' ||
        store.render.finalized ||
        store.render.startedAtMs !== null
    ) {
        return;
    }

    store.render.startedAtMs = nowMs();
    enterPhase(store, 'render');
}

export function finalizeSsrRenderTiming(event: H3Event) {
    const store = getEventTimingStore(event);
    if (
        !store ||
        store.kind !== 'ssr' ||
        store.render.finalized ||
        store.render.startedAtMs === null
    ) {
        return;
    }

    store.render.durationMs += Math.max(0, nowMs() - store.render.startedAtMs);
    store.render.finalized = true;
    store.render.startedAtMs = null;
    exitPhase(store, 'render');
}

export function appendServerTimingHeaders(event: H3Event) {
    const store = getEventTimingStore(event);
    if (!store || store.headersWritten) {
        return;
    }

    if (store.kind === 'ssr') {
        finalizeSsrRenderTiming(event);
    }

    pauseActivePhase(store, nowMs());
    setHeader(event, 'Server-Timing', formatServerTiming(buildServerTimingMetrics(store)));
    setHeader(event, 'Timing-Allow-Origin', resolveTimingAllowOrigin(event));
    store.headersWritten = true;
}

export function pauseServerTiming() {
    const store = getCurrentRequestTimingStore();
    if (!store) {
        return null;
    }

    pauseActivePhase(store, nowMs());
    return store;
}

export function resumeServerTiming(store: RequestTimingStore | null) {
    if (!store) {
        return;
    }

    resumeActivePhase(store, nowMs());
}

export function recordSsrInternalApiTiming(
    pathname: string,
    headerValue: string | null | undefined,
    fallbackDurationMs: number
) {
    const store = getCurrentRequestTimingStore();
    if (!store || store.kind !== 'ssr' || !isApiRequest(pathname)) {
        return;
    }

    const parsedMetrics = parseServerTimingHeader(headerValue);
    const totalDurationMs = parsedMetrics.get('total') ?? fallbackDurationMs;
    addPhaseDuration(store, 'auth', parsedMetrics.get('auth') ?? 0);
    addPhaseDuration(store, 'db', parsedMetrics.get('db') ?? 0);
    addPhaseDuration(store, 'compute', parsedMetrics.get('compute') ?? 0);

    store.ssrApiEntries.push({
        metricName: normalizeApiTimingMetricName(pathname),
        durationMs: Math.max(0, totalDurationMs)
    });
}
