import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import type { CirculationPdfState } from '~/types/lookupCurrentTimetable';

const FULLSCREEN_MAX_ZOOM = 8;
const FULLSCREEN_WHEEL_ZOOM_STEP = 0.2;

export default function useLookupCirculationPdfFullscreenControls(options: {
    state: MaybeRefOrGetter<CirculationPdfState>;
    viewport: Ref<HTMLDivElement | null>;
    requestRender: () => void;
}) {
    const zoom = ref(1);
    const viewportOffsetX = ref(0);
    const viewportOffsetY = ref(0);
    const contentWidth = ref(0);
    const contentHeight = ref(0);
    const viewportWidth = ref(0);
    const viewportHeight = ref(0);
    let pinchStartDistance = 0;
    let pinchStartZoom = 1;
    let pinchAnchorX = 0;
    let pinchAnchorY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartOffsetX = 0;
    let panStartOffsetY = 0;

    const viewportStyle = computed(() => {
        if (viewportWidth.value <= 0 || viewportHeight.value <= 0) {
            return {};
        }

        return {
            width: `${Math.round(viewportWidth.value)}px`,
            height: `${Math.round(viewportHeight.value)}px`
        };
    });

    function resetZoom() {
        zoom.value = 1;
        viewportOffsetX.value = 0;
        viewportOffsetY.value = 0;
        pinchStartDistance = 0;
        pinchStartZoom = 1;
        pinchAnchorX = 0;
        pinchAnchorY = 0;
        isPanning = false;
    }

    function resetRenderState() {
        pinchAnchorX = 0;
        pinchAnchorY = 0;
        viewportOffsetX.value = 0;
        viewportOffsetY.value = 0;
        contentWidth.value = 0;
        contentHeight.value = 0;
        viewportWidth.value = 0;
        viewportHeight.value = 0;
    }

    function clampZoom(nextZoom: number) {
        if (!Number.isFinite(nextZoom)) {
            return 1;
        }

        return Math.min(FULLSCREEN_MAX_ZOOM, Math.max(1, nextZoom));
    }

    function getTouchDistance(touches: TouchList) {
        if (touches.length < 2) {
            return 0;
        }

        const first = touches[0]!;
        const second = touches[1]!;
        return Math.hypot(
            first.clientX - second.clientX,
            first.clientY - second.clientY
        );
    }

    function getTouchCenter(touches: TouchList) {
        if (touches.length < 2) {
            return null;
        }

        const first = touches[0]!;
        const second = touches[1]!;

        return {
            clientX: (first.clientX + second.clientX) / 2,
            clientY: (first.clientY + second.clientY) / 2
        };
    }

    function getContainerRelativePoint(clientX: number, clientY: number) {
        const activeViewport = options.viewport.value;
        if (!activeViewport) {
            return null;
        }

        const rect = activeViewport.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function clampScroll(
        containerWidth: number,
        containerHeight: number,
        nextContentWidth: number,
        nextContentHeight: number,
        nextOffsetX: number,
        nextOffsetY: number
    ) {
        const maxOffsetX = Math.max(0, nextContentWidth - containerWidth);
        const maxOffsetY = Math.max(0, nextContentHeight - containerHeight);

        return {
            offsetX: Math.min(maxOffsetX, Math.max(0, nextOffsetX)),
            offsetY: Math.min(maxOffsetY, Math.max(0, nextOffsetY))
        };
    }

    function applyZoomAtPoint(
        nextZoom: number,
        anchorX: number,
        anchorY: number
    ) {
        if (
            toValue(options.state) !== 'ready' ||
            viewportWidth.value <= 0 ||
            viewportHeight.value <= 0
        ) {
            return;
        }

        const previousZoom = zoom.value;
        const clampedZoom = clampZoom(nextZoom);
        if (clampedZoom === previousZoom) {
            return;
        }

        if (contentWidth.value <= 0 || contentHeight.value <= 0) {
            return;
        }

        const zoomRatio = clampedZoom / previousZoom;
        const nextContentWidth = contentWidth.value * zoomRatio;
        const nextContentHeight = contentHeight.value * zoomRatio;
        const nextOffsetX =
            (viewportOffsetX.value + anchorX) * zoomRatio - anchorX;
        const nextOffsetY =
            (viewportOffsetY.value + anchorY) * zoomRatio - anchorY;

        zoom.value = clampedZoom;

        const clampedOffset = clampScroll(
            viewportWidth.value,
            viewportHeight.value,
            nextContentWidth,
            nextContentHeight,
            nextOffsetX,
            nextOffsetY
        );
        viewportOffsetX.value = clampedOffset.offsetX;
        viewportOffsetY.value = clampedOffset.offsetY;
        options.requestRender();
    }

    function panTo(clientX: number, clientY: number) {
        if (toValue(options.state) !== 'ready') {
            return;
        }

        if (viewportWidth.value <= 0 || viewportHeight.value <= 0) {
            return;
        }

        const clampedOffset = clampScroll(
            viewportWidth.value,
            viewportHeight.value,
            contentWidth.value,
            contentHeight.value,
            panStartOffsetX - (clientX - panStartX),
            panStartOffsetY - (clientY - panStartY)
        );
        viewportOffsetX.value = clampedOffset.offsetX;
        viewportOffsetY.value = clampedOffset.offsetY;
        options.requestRender();
    }

    function handleMouseMove(event: MouseEvent) {
        if (!isPanning) {
            return;
        }

        panTo(event.clientX, event.clientY);
    }

    function handleMouseUp() {
        if (!import.meta.client) {
            return;
        }

        isPanning = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }

    function handleMouseDown(event: MouseEvent) {
        if (toValue(options.state) !== 'ready' || event.button !== 0) {
            return;
        }

        if (!import.meta.client) {
            return;
        }

        event.preventDefault();
        isPanning = true;
        panStartX = event.clientX;
        panStartY = event.clientY;
        panStartOffsetX = viewportOffsetX.value;
        panStartOffsetY = viewportOffsetY.value;
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    function handleWheel(event: WheelEvent) {
        if (toValue(options.state) !== 'ready') {
            return;
        }

        event.preventDefault();
        const anchorPoint = getContainerRelativePoint(
            event.clientX,
            event.clientY
        );
        if (!anchorPoint) {
            return;
        }

        const zoomDelta =
            event.deltaY < 0
                ? FULLSCREEN_WHEEL_ZOOM_STEP
                : -FULLSCREEN_WHEEL_ZOOM_STEP;
        applyZoomAtPoint(zoom.value + zoomDelta, anchorPoint.x, anchorPoint.y);
    }

    function handleTouchStart(event: TouchEvent) {
        if (toValue(options.state) !== 'ready') {
            return;
        }

        if (event.touches.length === 1) {
            const first = event.touches[0]!;
            isPanning = true;
            panStartX = first.clientX;
            panStartY = first.clientY;
            panStartOffsetX = viewportOffsetX.value;
            panStartOffsetY = viewportOffsetY.value;
            pinchStartDistance = 0;
            pinchStartZoom = zoom.value;
            return;
        }

        if (event.touches.length !== 2) {
            return;
        }

        event.preventDefault();
        const center = getTouchCenter(event.touches);
        if (!center) {
            return;
        }

        const anchorPoint = getContainerRelativePoint(
            center.clientX,
            center.clientY
        );
        if (!anchorPoint) {
            return;
        }

        pinchStartDistance = getTouchDistance(event.touches);
        pinchStartZoom = zoom.value;
        pinchAnchorX = anchorPoint.x;
        pinchAnchorY = anchorPoint.y;
        isPanning = false;
    }

    function handleTouchMove(event: TouchEvent) {
        if (toValue(options.state) !== 'ready') {
            return;
        }

        if (event.touches.length === 1 && isPanning) {
            event.preventDefault();
            const first = event.touches[0]!;
            panTo(first.clientX, first.clientY);
            return;
        }

        if (event.touches.length !== 2) {
            return;
        }

        if (pinchStartDistance <= 0) {
            pinchStartDistance = getTouchDistance(event.touches);
            pinchStartZoom = zoom.value;
            return;
        }

        event.preventDefault();
        const nextDistance = getTouchDistance(event.touches);
        if (nextDistance <= 0) {
            return;
        }

        const center = getTouchCenter(event.touches);
        if (!center) {
            return;
        }

        const anchorPoint = getContainerRelativePoint(
            center.clientX,
            center.clientY
        );
        if (!anchorPoint) {
            return;
        }

        pinchAnchorX = anchorPoint.x;
        pinchAnchorY = anchorPoint.y;

        const nextZoom = pinchStartZoom * (nextDistance / pinchStartDistance);
        applyZoomAtPoint(nextZoom, pinchAnchorX, pinchAnchorY);
    }

    function handleTouchEnd(event: TouchEvent) {
        if (event.touches.length >= 2) {
            pinchStartDistance = getTouchDistance(event.touches);
            pinchStartZoom = zoom.value;
            return;
        }

        if (event.touches.length === 1) {
            const first = event.touches[0]!;
            isPanning = true;
            panStartX = first.clientX;
            panStartY = first.clientY;
            panStartOffsetX = viewportOffsetX.value;
            panStartOffsetY = viewportOffsetY.value;
            pinchStartDistance = 0;
            pinchStartZoom = zoom.value;
            return;
        }

        pinchStartDistance = 0;
        pinchStartZoom = zoom.value;
        pinchAnchorX = 0;
        pinchAnchorY = 0;
        isPanning = false;
    }

    return {
        zoom,
        viewportOffsetX,
        viewportOffsetY,
        contentWidth,
        contentHeight,
        viewportWidth,
        viewportHeight,
        viewportStyle,
        resetZoom,
        resetRenderState,
        clampScroll,
        handleMouseUp,
        handleMouseDown,
        handleWheel,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd
    };
}
