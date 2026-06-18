import {
    nextTick,
    onBeforeUnmount,
    ref,
    toValue,
    watch,
    type MaybeRefOrGetter
} from 'vue';
import type {
    PDFDocumentLoadingTask,
    PDFDocumentProxy,
    RenderTask
} from 'pdfjs-dist/types/src/display/api';
import useLookupCirculationAssetExport from '~/composables/useLookupCirculationAssetExport';
import useLookupCirculationPdfFullscreenControls from '~/composables/useLookupCirculationPdfFullscreenControls';
import type { TrackerApiResponse } from '~/types/homepage';
import type { CirculationPdfState } from '~/types/lookupCurrentTimetable';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import { normalizeComparableCode } from '~/utils/lookup/timetableDisplay';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

interface CirculationPdfRenderTarget {
    container: HTMLDivElement;
    canvas: HTMLCanvasElement;
    renderScaleMultiplier: number;
    maxPixelArea: number;
    maxDimension: number;
}

const PREVIEW_RENDER_SCALE_MULTIPLIER = 2.25;
const FULLSCREEN_RENDER_SCALE_MULTIPLIER = 2.5;
const PREVIEW_MAX_PIXEL_AREA = 10_000_000;
const FULLSCREEN_MAX_PIXEL_AREA = 30_000_000;
const MAX_DIMENSION = 8192;

export default function useLookupCirculationPdf(options: {
    shouldLoadPreview: MaybeRefOrGetter<boolean>;
    requestTrainCode: MaybeRefOrGetter<string>;
    fallbackTrainCode: MaybeRefOrGetter<string>;
}) {
    const circulationPdfState = ref<CirculationPdfState>('idle');
    const circulationPdfFullscreenState = ref<CirculationPdfState>('idle');
    const circulationPreviewErrorMessage = ref('');
    const isCirculationPdfPreviewOpen = ref(false);
    const circulationPdfCanvasContainer = ref<HTMLDivElement | null>(null);
    const circulationPdfCanvas = ref<HTMLCanvasElement | null>(null);
    const fullscreenCanvasContainer = ref<HTMLDivElement | null>(null);
    const fullscreenViewport = ref<HTMLDivElement | null>(null);
    const fullscreenCanvas = ref<HTMLCanvasElement | null>(null);
    const circulationPdfObjectUrl = ref<string | null>(null);

    const {
        circulationExportState,
        circulationExportErrorMessage,
        exportCirculationAsset
    } = useLookupCirculationAssetExport({
        requestTrainCode: options.requestTrainCode,
        fallbackTrainCode: options.fallbackTrainCode
    });

    let requestToken = 0;
    let previewLastRenderKey = '';
    let previewPendingRenderKey = '';
    let fullscreenLastRenderKey = '';
    let fullscreenPendingRenderKey = '';
    let previewResizeObserver: ResizeObserver | null = null;
    let fullscreenResizeObserver: ResizeObserver | null = null;
    let previewRenderTask: RenderTask | null = null;
    let fullscreenRenderTask: RenderTask | null = null;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let pdfDocument: PDFDocumentProxy | null = null;
    let pdfJsModulePromise: Promise<PdfJsModule> | null = null;
    let pdfJsWorkerUrlPromise: Promise<string> | null = null;
    let fullscreenOrientation: 'portrait' | 'landscape' = 'landscape';

    const fullscreenControls = useLookupCirculationPdfFullscreenControls({
        state: circulationPdfFullscreenState,
        viewport: fullscreenViewport,
        requestRender: () => {
            void requestFullscreenRender(requestToken);
        }
    });

    function openCirculationPdfPreview() {
        if (circulationPdfState.value !== 'ready') {
            return;
        }

        isCirculationPdfPreviewOpen.value = true;
    }

    function closeCirculationPdfPreview() {
        isCirculationPdfPreviewOpen.value = false;
    }

    function getFullscreenOrientation() {
        if (!import.meta.client) {
            return 'landscape' as const;
        }

        return window.innerHeight > window.innerWidth
            ? 'portrait'
            : 'landscape';
    }

    async function loadPdfJsModule() {
        if (!pdfJsModulePromise) {
            pdfJsModulePromise = import('pdfjs-dist/legacy/build/pdf.mjs');
        }
        if (!pdfJsWorkerUrlPromise) {
            pdfJsWorkerUrlPromise =
                import('pdfjs-dist/legacy/build/pdf.worker.mjs?url').then(
                    (module) => module.default
                );
        }

        const [pdfjs, workerSrc] = await Promise.all([
            pdfJsModulePromise,
            pdfJsWorkerUrlPromise
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        return pdfjs;
    }

    function resetCanvas(
        canvas: HTMLCanvasElement | null,
        mode: 'preview' | 'fullscreen'
    ) {
        if (!canvas) {
            resetRenderKeys(mode);
            return;
        }

        const context = canvas.getContext('2d');
        if (context) {
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);
        }

        canvas.width = 0;
        canvas.height = 0;
        canvas.style.width = '';
        canvas.style.height = '';
        resetRenderKeys(mode);
    }

    function resetRenderKeys(mode: 'preview' | 'fullscreen') {
        if (mode === 'preview') {
            previewLastRenderKey = '';
            previewPendingRenderKey = '';
            return;
        }

        fullscreenLastRenderKey = '';
        fullscreenPendingRenderKey = '';
        fullscreenControls.resetRenderState();
    }

    function stopPreviewResizeObserver() {
        previewResizeObserver?.disconnect();
        previewResizeObserver = null;
    }

    function stopFullscreenResizeObserver() {
        fullscreenResizeObserver?.disconnect();
        fullscreenResizeObserver = null;
    }

    async function cancelRenderTask(mode: 'preview' | 'fullscreen') {
        const renderTask =
            mode === 'preview' ? previewRenderTask : fullscreenRenderTask;
        if (!renderTask) {
            return;
        }

        if (mode === 'preview') {
            previewRenderTask = null;
        } else {
            fullscreenRenderTask = null;
        }

        renderTask.cancel();

        try {
            await renderTask.promise;
        } catch {
            // Ignore cancellation cleanup failures from abandoned render tasks.
        }
    }

    async function revokeObjectUrl() {
        const objectUrl = circulationPdfObjectUrl.value;
        circulationPdfObjectUrl.value = null;
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    }

    async function destroyDocument() {
        const activeLoadingTask = loadingTask;
        const activeDocument = pdfDocument;
        loadingTask = null;
        pdfDocument = null;

        if (activeLoadingTask) {
            try {
                await activeLoadingTask.destroy();
            } catch {
                // Ignore cleanup failures from abandoned PDF tasks.
            }
            return;
        }

        if (activeDocument) {
            try {
                await activeDocument.destroy();
            } catch {
                // Ignore cleanup failures from abandoned PDF documents.
            }
        }
    }

    async function cleanupPreview(options?: {
        invalidateRequest?: boolean;
        resetState?: boolean;
    }) {
        if (options?.invalidateRequest !== false) {
            requestToken += 1;
        }

        stopPreviewResizeObserver();
        stopFullscreenResizeObserver();
        await cancelRenderTask('preview');
        await cancelRenderTask('fullscreen');
        await destroyDocument();
        await revokeObjectUrl();
        resetCanvas(circulationPdfCanvas.value, 'preview');
        resetCanvas(fullscreenCanvas.value, 'fullscreen');
        fullscreenControls.resetZoom();
        isCirculationPdfPreviewOpen.value = false;

        if (options?.resetState !== false) {
            circulationPdfState.value = 'idle';
            circulationPdfFullscreenState.value = 'idle';
        }
    }

    function isCancellationError(error: unknown) {
        return (
            error instanceof Error &&
            (error.name === 'RenderingCancelledException' ||
                error.name === 'AbortException' ||
                /cancel/i.test(error.message))
        );
    }

    function getRenderTarget(mode: 'preview' | 'fullscreen') {
        if (mode === 'preview') {
            const container = circulationPdfCanvasContainer.value;
            const canvas = circulationPdfCanvas.value;
            if (!container || !canvas) {
                return null;
            }

            return {
                container,
                canvas,
                renderScaleMultiplier: PREVIEW_RENDER_SCALE_MULTIPLIER,
                maxPixelArea: PREVIEW_MAX_PIXEL_AREA,
                maxDimension: MAX_DIMENSION
            } satisfies CirculationPdfRenderTarget;
        }

        const container = fullscreenCanvasContainer.value;
        const canvas = fullscreenCanvas.value;
        if (!container || !canvas) {
            return null;
        }

        return {
            container,
            canvas,
            renderScaleMultiplier: FULLSCREEN_RENDER_SCALE_MULTIPLIER,
            maxPixelArea: FULLSCREEN_MAX_PIXEL_AREA,
            maxDimension: MAX_DIMENSION
        } satisfies CirculationPdfRenderTarget;
    }

    function buildFullscreenRenderKey(input: {
        containerWidth: number;
        containerHeight: number;
        rotation: number;
        viewportDisplayWidth: number;
        viewportDisplayHeight: number;
    }) {
        return [
            input.containerWidth,
            input.containerHeight,
            input.rotation,
            Math.round(input.viewportDisplayWidth),
            Math.round(input.viewportDisplayHeight),
            fullscreenControls.zoom.value.toFixed(3),
            Math.round(fullscreenControls.viewportOffsetX.value),
            Math.round(fullscreenControls.viewportOffsetY.value)
        ].join(':');
    }

    function buildPreviewRenderKey(input: {
        containerWidth: number;
        viewportWidth: number;
        viewportHeight: number;
        outputScale: number;
    }) {
        return [
            input.containerWidth,
            Math.round(input.viewportWidth),
            Math.round(input.viewportHeight),
            input.outputScale.toFixed(3)
        ].join(':');
    }

    function clampOutputScale(
        viewportWidth: number,
        viewportHeight: number,
        desiredOutputScale: number,
        target: CirculationPdfRenderTarget
    ) {
        const maxScaleByArea = Math.sqrt(
            target.maxPixelArea / Math.max(1, viewportWidth * viewportHeight)
        );
        const maxScaleByWidth =
            target.maxDimension / Math.max(1, viewportWidth);
        const maxScaleByHeight =
            target.maxDimension / Math.max(1, viewportHeight);

        return Math.max(
            1,
            Math.min(
                desiredOutputScale,
                maxScaleByArea,
                maxScaleByWidth,
                maxScaleByHeight
            )
        );
    }

    async function resolveFullscreenRenderMetrics(
        document: PDFDocumentProxy,
        target: CirculationPdfRenderTarget
    ): Promise<{
        containerWidth: number;
        containerHeight: number;
        orientation: 'portrait' | 'landscape';
        rotation: number;
        viewportDisplayWidth: number;
        viewportDisplayHeight: number;
        renderKey: string;
    } | null> {
        const containerWidth = Math.max(
            0,
            Math.floor(target.container.clientWidth)
        );
        const containerHeight = Math.max(
            0,
            Math.floor(target.container.clientHeight)
        );
        const orientation = getFullscreenOrientation();
        const rotation = orientation === 'portrait' ? 90 : 0;
        const page = await document.getPage(1);
        const baseViewport = page.getViewport({ scale: 1, rotation });
        const viewportDisplayWidth = Math.min(
            containerWidth,
            containerHeight * (baseViewport.width / baseViewport.height)
        );
        const viewportDisplayHeight =
            viewportDisplayWidth / (baseViewport.width / baseViewport.height);

        if (
            containerWidth <= 0 ||
            containerHeight <= 0 ||
            viewportDisplayWidth <= 0 ||
            viewportDisplayHeight <= 0
        ) {
            return null;
        }

        return {
            containerWidth,
            containerHeight,
            orientation,
            rotation,
            viewportDisplayWidth,
            viewportDisplayHeight,
            renderKey: buildFullscreenRenderKey({
                containerWidth,
                containerHeight,
                rotation,
                viewportDisplayWidth,
                viewportDisplayHeight
            })
        };
    }

    async function requestFullscreenRender(activeRequestToken: number) {
        if (!import.meta.client || activeRequestToken !== requestToken) {
            return;
        }

        const document = pdfDocument;
        const target = getRenderTarget('fullscreen');
        if (!document || !target) {
            return;
        }

        const metrics = await resolveFullscreenRenderMetrics(document, target);
        if (!metrics || activeRequestToken !== requestToken) {
            return;
        }

        if (
            metrics.renderKey === fullscreenLastRenderKey ||
            metrics.renderKey === fullscreenPendingRenderKey
        ) {
            return;
        }

        fullscreenPendingRenderKey = metrics.renderKey;

        try {
            await renderPageToTarget({
                requestToken: activeRequestToken,
                mode: 'fullscreen'
            });
        } finally {
            if (
                fullscreenPendingRenderKey === metrics.renderKey &&
                fullscreenLastRenderKey !== metrics.renderKey
            ) {
                fullscreenPendingRenderKey = '';
            }
        }
    }

    async function requestPreviewRender(activeRequestToken: number) {
        if (!import.meta.client || activeRequestToken !== requestToken) {
            return;
        }

        const target = getRenderTarget('preview');
        if (!pdfDocument || !target) {
            return;
        }

        const containerWidth = Math.max(
            0,
            Math.floor(target.container.clientWidth)
        );
        if (containerWidth <= 0 || previewPendingRenderKey.length > 0) {
            return;
        }

        await renderPageToTarget({
            requestToken: activeRequestToken,
            mode: 'preview'
        });
    }

    async function renderPageToTarget(options: {
        requestToken: number;
        mode: 'preview' | 'fullscreen';
    }) {
        const activeRequestToken = options.requestToken;
        const mode = options.mode;
        if (!import.meta.client || activeRequestToken !== requestToken) {
            return;
        }

        const document = pdfDocument;
        const target = getRenderTarget(mode);
        if (!document || !target) {
            if (mode === 'fullscreen' && isCirculationPdfPreviewOpen.value) {
                circulationPdfFullscreenState.value = 'error';
            }
            return;
        }

        let containerWidth = Math.max(
            0,
            Math.floor(target.container.clientWidth)
        );
        let containerHeight = 0;
        let orientation: 'portrait' | 'landscape' = 'landscape';
        let rotation = 0;
        let viewportDisplayWidth = containerWidth;
        let viewportDisplayHeight = 0;
        let renderKey = '';

        if (mode === 'fullscreen') {
            const metrics = await resolveFullscreenRenderMetrics(
                document,
                target
            );
            if (!metrics) {
                fullscreenPendingRenderKey = '';
                return;
            }

            containerWidth = metrics.containerWidth;
            containerHeight = metrics.containerHeight;
            orientation = metrics.orientation;
            rotation = metrics.rotation;
            viewportDisplayWidth = metrics.viewportDisplayWidth;
            viewportDisplayHeight = metrics.viewportDisplayHeight;
            renderKey = metrics.renderKey;
        }

        if (
            containerWidth <= 0 ||
            (mode === 'fullscreen' &&
                (containerHeight <= 0 ||
                    viewportDisplayWidth <= 0 ||
                    viewportDisplayHeight <= 0))
        ) {
            if (mode === 'fullscreen') {
                fullscreenPendingRenderKey = '';
            }
            return;
        }

        await cancelRenderTask(mode);

        try {
            const page = await document.getPage(1);
            if (activeRequestToken !== requestToken) {
                if (mode === 'fullscreen') {
                    fullscreenPendingRenderKey = '';
                }
                return;
            }

            const pageBaseViewport = page.getViewport({
                scale: 1,
                rotation
            });
            const fitScale =
                mode === 'fullscreen'
                    ? Math.min(
                          viewportDisplayWidth / pageBaseViewport.width,
                          viewportDisplayHeight / pageBaseViewport.height
                      )
                    : containerWidth / pageBaseViewport.width;
            const viewport = page.getViewport({
                scale:
                    fitScale *
                    (mode === 'fullscreen' ? fullscreenControls.zoom.value : 1),
                rotation
            });
            const renderSurfaceWidth =
                mode === 'fullscreen' ? viewportDisplayWidth : viewport.width;
            const renderSurfaceHeight =
                mode === 'fullscreen' ? viewportDisplayHeight : viewport.height;
            const desiredOutputScale =
                (window.devicePixelRatio || 1) * target.renderScaleMultiplier;
            const outputScale = clampOutputScale(
                renderSurfaceWidth,
                renderSurfaceHeight,
                desiredOutputScale,
                target
            );

            if (mode === 'preview') {
                renderKey = buildPreviewRenderKey({
                    containerWidth,
                    viewportWidth: renderSurfaceWidth,
                    viewportHeight: renderSurfaceHeight,
                    outputScale
                });

                if (
                    renderKey === previewLastRenderKey ||
                    renderKey === previewPendingRenderKey
                ) {
                    return;
                }

                previewPendingRenderKey = renderKey;
            }

            const context = target.canvas.getContext('2d');
            if (!context) {
                return;
            }

            target.canvas.width = Math.max(
                1,
                Math.floor(renderSurfaceWidth * outputScale)
            );
            target.canvas.height = Math.max(
                1,
                Math.floor(renderSurfaceHeight * outputScale)
            );
            target.canvas.style.width = `${Math.floor(renderSurfaceWidth)}px`;
            target.canvas.style.height = `${Math.floor(renderSurfaceHeight)}px`;

            if (mode === 'fullscreen') {
                fullscreenControls.contentWidth.value = viewport.width;
                fullscreenControls.contentHeight.value = viewport.height;
                fullscreenControls.viewportWidth.value = viewportDisplayWidth;
                fullscreenControls.viewportHeight.value = viewportDisplayHeight;
                const clampedOffset = fullscreenControls.clampScroll(
                    viewportDisplayWidth,
                    viewportDisplayHeight,
                    viewport.width,
                    viewport.height,
                    fullscreenControls.viewportOffsetX.value,
                    fullscreenControls.viewportOffsetY.value
                );
                fullscreenControls.viewportOffsetX.value =
                    clampedOffset.offsetX;
                fullscreenControls.viewportOffsetY.value =
                    clampedOffset.offsetY;
            }

            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, target.canvas.width, target.canvas.height);

            const renderTask = page.render({
                canvas: null,
                canvasContext: context,
                viewport,
                transform:
                    mode === 'fullscreen'
                        ? [
                              outputScale,
                              0,
                              0,
                              outputScale,
                              -fullscreenControls.viewportOffsetX.value *
                                  outputScale,
                              -fullscreenControls.viewportOffsetY.value *
                                  outputScale
                          ]
                        : outputScale === 1
                          ? undefined
                          : [outputScale, 0, 0, outputScale, 0, 0],
                background:
                    mode === 'fullscreen'
                        ? 'rgba(255,255,255,0)'
                        : 'rgb(255,255,255)'
            });

            if (mode === 'preview') {
                previewRenderTask = renderTask;
            } else {
                fullscreenRenderTask = renderTask;
            }

            try {
                await renderTask.promise;
            } finally {
                if (
                    (mode === 'preview' && previewRenderTask === renderTask) ||
                    (mode === 'fullscreen' &&
                        fullscreenRenderTask === renderTask)
                ) {
                    if (mode === 'preview') {
                        previewRenderTask = null;
                    } else {
                        fullscreenRenderTask = null;
                    }
                }
            }

            if (activeRequestToken !== requestToken) {
                return;
            }

            if (mode === 'preview') {
                previewLastRenderKey = renderKey;
                previewPendingRenderKey = '';
            } else {
                fullscreenLastRenderKey = renderKey;
                fullscreenPendingRenderKey = '';
            }

            if (mode === 'fullscreen') {
                fullscreenOrientation = orientation;
                circulationPdfFullscreenState.value = 'ready';
            }
        } catch (error) {
            if (mode === 'preview') {
                previewPendingRenderKey = '';
            } else {
                fullscreenPendingRenderKey = '';
            }

            if (
                activeRequestToken !== requestToken ||
                isCancellationError(error)
            ) {
                return;
            }

            if (mode === 'preview') {
                circulationPreviewErrorMessage.value = getApiErrorMessage(
                    error,
                    '交路图预览渲染失败'
                );
                circulationPdfState.value = 'error';
                await cleanupPreview({
                    invalidateRequest: false,
                    resetState: false
                });
                return;
            }

            circulationPdfFullscreenState.value = 'error';
            stopFullscreenResizeObserver();
            await cancelRenderTask('fullscreen');
            resetCanvas(fullscreenCanvas.value, 'fullscreen');
        }
    }

    async function startPreviewResizeObserver(activeRequestToken: number) {
        await nextTick();
        if (!import.meta.client || activeRequestToken !== requestToken) {
            return;
        }

        const container = circulationPdfCanvasContainer.value;
        if (!container) {
            return;
        }

        stopPreviewResizeObserver();
        previewResizeObserver = new ResizeObserver(() => {
            if (activeRequestToken !== requestToken) {
                return;
            }

            void requestPreviewRender(activeRequestToken);
        });
        previewResizeObserver.observe(container);
        void requestPreviewRender(activeRequestToken);
    }

    async function startFullscreenResizeObserver(activeRequestToken: number) {
        await nextTick();
        if (!import.meta.client || activeRequestToken !== requestToken) {
            return;
        }

        const container = fullscreenCanvasContainer.value;
        if (!container) {
            return;
        }

        stopFullscreenResizeObserver();
        fullscreenResizeObserver = new ResizeObserver(() => {
            if (activeRequestToken !== requestToken) {
                return;
            }

            const nextOrientation = getFullscreenOrientation();
            if (nextOrientation !== fullscreenOrientation) {
                fullscreenControls.resetZoom();
            }

            void requestFullscreenRender(activeRequestToken);
        });
        fullscreenResizeObserver.observe(container);
        void requestFullscreenRender(activeRequestToken);
    }

    async function createPreviewHttpError(response: Response) {
        const fallbackMessage = `HTTP ${response.status}`;

        try {
            const payload = (await response.json()) as Partial<
                TrackerApiResponse<never>
            >;
            if (
                payload &&
                payload.ok === false &&
                typeof payload.data === 'string' &&
                payload.data.length > 0
            ) {
                return new Error(payload.data);
            }
        } catch {
            // Ignore malformed error bodies and keep the HTTP fallback.
        }

        return new Error(fallbackMessage);
    }

    async function loadPreview(requestTrainCode: string) {
        if (!import.meta.client) {
            return;
        }

        const activeRequestToken = ++requestToken;
        circulationPdfState.value = 'loading';
        circulationPreviewErrorMessage.value = '';
        await cleanupPreview({
            invalidateRequest: false,
            resetState: false
        });

        try {
            const response = await fetch(
                `/api/v1/timetable/train/${encodeURIComponent(requestTrainCode)}/circulation/image?format=pdf&binary=true`,
                {
                    credentials: 'same-origin'
                }
            );
            if (activeRequestToken !== requestToken) {
                return;
            }

            if (!response.ok) {
                throw await createPreviewHttpError(response);
            }

            const pdfBytes = new Uint8Array(await response.arrayBuffer());
            if (
                activeRequestToken !== requestToken ||
                pdfBytes.byteLength === 0
            ) {
                return;
            }

            const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
            circulationPdfObjectUrl.value = URL.createObjectURL(pdfBlob);

            const pdfjs = await loadPdfJsModule();
            if (activeRequestToken !== requestToken) {
                return;
            }

            loadingTask = pdfjs.getDocument({ data: pdfBytes });
            pdfDocument = await loadingTask.promise;
            if (activeRequestToken !== requestToken) {
                return;
            }

            circulationPdfState.value = 'ready';
            circulationPdfFullscreenState.value = 'idle';
            await startPreviewResizeObserver(activeRequestToken);
        } catch (error) {
            if (activeRequestToken !== requestToken) {
                return;
            }

            circulationPreviewErrorMessage.value = getApiErrorMessage(
                error,
                '交路图预览加载失败，请稍后重试。'
            );
            circulationPdfState.value = 'error';
            circulationPdfFullscreenState.value = 'error';
            await cleanupPreview({
                invalidateRequest: false,
                resetState: false
            });
        }
    }

    watch(
        [
            () => toValue(options.shouldLoadPreview),
            () => normalizeComparableCode(toValue(options.requestTrainCode))
        ],
        async (
            [shouldLoad, requestTrainCode],
            [previousShouldLoad, previousTrainCode]
        ) => {
            if (!import.meta.client) {
                return;
            }

            if (!shouldLoad) {
                await cleanupPreview();
                return;
            }

            if (
                shouldLoad &&
                (!previousShouldLoad || previousTrainCode !== requestTrainCode)
            ) {
                await loadPreview(requestTrainCode);
            }
        },
        { immediate: true }
    );

    watch(
        () => isCirculationPdfPreviewOpen.value,
        async (isOpen) => {
            if (!import.meta.client) {
                return;
            }

            if (!isOpen) {
                stopFullscreenResizeObserver();
                await cancelRenderTask('fullscreen');
                resetCanvas(fullscreenCanvas.value, 'fullscreen');
                fullscreenControls.resetZoom();
                circulationPdfFullscreenState.value = 'idle';
                return;
            }

            if (circulationPdfState.value !== 'ready' || !pdfDocument) {
                circulationPdfFullscreenState.value = 'error';
                return;
            }

            resetCanvas(fullscreenCanvas.value, 'fullscreen');
            fullscreenControls.resetZoom();
            fullscreenOrientation = getFullscreenOrientation();
            circulationPdfFullscreenState.value = 'loading';
            await nextTick();
            await startFullscreenResizeObserver(requestToken);
        }
    );

    onBeforeUnmount(() => {
        fullscreenControls.handleMouseUp();
        void cleanupPreview();
    });

    return {
        circulationPdfState,
        circulationPdfFullscreenState,
        circulationExportState,
        circulationExportErrorMessage,
        circulationPreviewErrorMessage,
        isCirculationPdfPreviewOpen,
        fullscreenViewportStyle: fullscreenControls.viewportStyle,
        circulationPdfCanvasContainer,
        circulationPdfCanvas,
        fullscreenCanvasContainer,
        fullscreenViewport,
        fullscreenCanvas,
        exportCirculationAsset,
        openCirculationPdfPreview,
        closeCirculationPdfPreview,
        handleFullscreenWheel: fullscreenControls.handleWheel,
        handleFullscreenMouseDown: fullscreenControls.handleMouseDown,
        handleFullscreenTouchStart: fullscreenControls.handleTouchStart,
        handleFullscreenTouchMove: fullscreenControls.handleTouchMove,
        handleFullscreenTouchEnd: fullscreenControls.handleTouchEnd,
        cleanupPreview
    };
}
