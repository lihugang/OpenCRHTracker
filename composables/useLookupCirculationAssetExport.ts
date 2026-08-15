import { ref, toValue, type MaybeRefOrGetter } from 'vue';
import type { CirculationExportFormat } from '~/types/lookupCurrentTimetable';
import { fetchTrainCirculationImageRaw } from '~/utils/api/v2/domain/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import { exportBlobFile } from '~/utils/clientFileExport';
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

    async function fetchAssetBlob(
        format: CirculationExportFormat,
        requestTrainCode: string
    ) {
        return (await fetchTrainCirculationImageRaw(
            requestTrainCode,
            format,
            'blob'
        )) as Blob;
    }

    async function exportCirculationAsset(format: CirculationExportFormat) {
        if (!import.meta.client || circulationExportState.value !== null) {
            return;
        }

        circulationExportState.value = format;
        circulationExportErrorMessage.value = '';

        try {
            const fileName = getExportFileName(format);
            const requestTrainCode = normalizeComparableCode(
                toValue(options.requestTrainCode)
            );
            if (requestTrainCode.length === 0) {
                throw new Error('当前暂无可导出的交路图');
            }

            const blob = await fetchAssetBlob(format, requestTrainCode);
            const result = await exportBlobFile({
                blob,
                fileName,
                mimeType: format === 'pdf' ? 'application/pdf' : 'image/png'
            });
            if (result === 'cancelled') {
                return;
            }
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
