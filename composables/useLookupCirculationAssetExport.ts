import { ref, toValue, type MaybeRefOrGetter } from 'vue';
import type { CirculationExportFormat } from '~/types/lookupCurrentTimetable';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import { normalizeComparableCode } from '~/utils/lookup/timetableDisplay';

export default function useLookupCirculationAssetExport(options: {
    requestTrainCode: MaybeRefOrGetter<string>;
    fallbackTrainCode: MaybeRefOrGetter<string>;
}) {
    const circulationExportState = ref<CirculationExportFormat | null>(null);
    const circulationExportErrorMessage = ref('');

    function getExportFileName(format: CirculationExportFormat) {
        const baseTrainCode =
            normalizeComparableCode(toValue(options.requestTrainCode)) ||
            normalizeComparableCode(toValue(options.fallbackTrainCode)) ||
            'train-circulation';

        return `${baseTrainCode}-circulation.${format}`;
    }

    function buildAssetBinaryUrl(format: CirculationExportFormat) {
        const requestTrainCode = normalizeComparableCode(
            toValue(options.requestTrainCode)
        );
        if (requestTrainCode.length === 0) {
            throw new Error('当前暂无可导出的交路图');
        }

        return `/api/v1/timetable/train/${encodeURIComponent(requestTrainCode)}/circulation/image?format=${encodeURIComponent(format)}&binary=true`;
    }

    async function fetchAssetBlob(url: string) {
        const response = await fetch(url, {
            credentials: 'same-origin'
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.blob();
    }

    async function triggerBrowserDownloadFromBlob(
        blob: Blob,
        fileName: string
    ) {
        const objectUrl = URL.createObjectURL(blob);

        try {
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = fileName;
            anchor.rel = 'noopener';
            anchor.style.display = 'none';
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
        } finally {
            window.setTimeout(() => {
                URL.revokeObjectURL(objectUrl);
            }, 1000);
        }
    }

    async function triggerBrowserDownloadFromUrl(
        url: string,
        fileName: string
    ) {
        const resolvedUrl = new URL(url, window.location.href);
        if (resolvedUrl.origin !== window.location.origin) {
            const blob = await fetchAssetBlob(resolvedUrl.toString());
            await triggerBrowserDownloadFromBlob(blob, fileName);
            return;
        }

        const anchor = document.createElement('a');
        anchor.href = resolvedUrl.toString();
        anchor.download = fileName;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
    }

    function isMobileDownloadContext() {
        if (!import.meta.client) {
            return false;
        }

        if (window.matchMedia('(max-width: 767px)').matches) {
            return true;
        }

        if (window.matchMedia('(pointer: coarse)').matches) {
            return true;
        }

        const viewportWidth = Math.max(
            window.innerWidth || 0,
            screen.width || 0
        );
        if (
            navigator.maxTouchPoints > 0 &&
            viewportWidth > 0 &&
            viewportWidth <= 1024
        ) {
            return true;
        }

        return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    }

    function isUserCancelledShare(error: unknown) {
        return (
            error instanceof DOMException &&
            (error.name === 'AbortError' || error.name === 'NotAllowedError')
        );
    }

    async function shareAssetFile(
        url: string,
        format: CirculationExportFormat,
        fileName: string
    ) {
        if (!import.meta.client || typeof navigator.share !== 'function') {
            return false;
        }

        const blob = await fetchAssetBlob(url);
        const file = new File([blob], fileName, {
            type: format === 'pdf' ? 'application/pdf' : 'image/png'
        });
        const sharePayload = {
            files: [file],
            title: fileName
        };

        if (
            typeof navigator.canShare === 'function' &&
            !navigator.canShare(sharePayload)
        ) {
            return false;
        }

        await navigator.share(sharePayload);
        return true;
    }

    async function exportCirculationAsset(format: CirculationExportFormat) {
        if (!import.meta.client || circulationExportState.value !== null) {
            return;
        }

        circulationExportState.value = format;
        circulationExportErrorMessage.value = '';

        try {
            const downloadUrl = buildAssetBinaryUrl(format);
            const fileName = getExportFileName(format);

            if (!isMobileDownloadContext()) {
                await triggerBrowserDownloadFromUrl(downloadUrl, fileName);
                return;
            }

            try {
                const shared = await shareAssetFile(
                    downloadUrl,
                    format,
                    fileName
                );
                if (shared) {
                    return;
                }
            } catch (error) {
                if (isUserCancelledShare(error)) {
                    return;
                }
            }

            const blob = await fetchAssetBlob(downloadUrl);
            await triggerBrowserDownloadFromBlob(blob, fileName);
        } catch (error) {
            circulationExportErrorMessage.value = getApiErrorMessage(
                error,
                '交路图导出失败，请稍后重试。'
            );
        } finally {
            circulationExportState.value = null;
        }
    }

    return {
        circulationExportState,
        circulationExportErrorMessage,
        exportCirculationAsset
    };
}
