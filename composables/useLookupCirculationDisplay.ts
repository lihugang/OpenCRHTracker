import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import type { CurrentTrainTimetableData } from '~/types/lookup';
import type { DisplayCirculationNode } from '~/types/lookupCurrentTimetable';
import { buildLookupPath } from '~/utils/lookup/lookupTarget';
import {
    normalizeComparableCode,
    normalizeTrainCodes
} from '~/utils/lookup/timetableDisplay';

export default function useLookupCirculationDisplay(options: {
    trainCode: MaybeRefOrGetter<string>;
    displayCodes: MaybeRefOrGetter<string[] | undefined>;
    timetable: MaybeRefOrGetter<CurrentTrainTimetableData | null>;
    isCurrentView: MaybeRefOrGetter<boolean>;
    timetableFocusTrainCodes: MaybeRefOrGetter<string[]>;
}) {
    const circulation = computed(() =>
        toValue(options.isCurrentView)
            ? (toValue(options.timetable)?.circulation ?? null)
            : null
    );

    const currentCirculationTrainCodeSet = computed(() => {
        if (!toValue(options.isCurrentView)) {
            return new Set<string>();
        }

        const timetable = toValue(options.timetable);
        return new Set(
            normalizeTrainCodes([
                ...(timetable?.allCodes ?? []),
                timetable?.requestTrainCode ?? '',
                ...(toValue(options.displayCodes) ?? []),
                toValue(options.trainCode)
            ])
        );
    });

    const currentCirculationNodeIndex = computed(() => {
        const currentCirculation = circulation.value;
        if (!currentCirculation) {
            return -1;
        }

        const normalizedInternalCode = normalizeComparableCode(
            toValue(options.timetable)?.internalCode
        );
        if (normalizedInternalCode.length > 0) {
            const nodeIndex = currentCirculation.nodes.findIndex(
                (node) =>
                    normalizeComparableCode(node.internalCode) ===
                    normalizedInternalCode
            );
            if (nodeIndex >= 0) {
                return nodeIndex;
            }
        }

        return currentCirculation.nodes.findIndex((node) =>
            node.allCodes.some((code) =>
                currentCirculationTrainCodeSet.value.has(
                    normalizeComparableCode(code)
                )
            )
        );
    });

    const circulationNodes = computed<DisplayCirculationNode[]>(() => {
        const currentCirculation = circulation.value;
        if (!currentCirculation) {
            return [];
        }

        return currentCirculation.nodes.map((node, index) => ({
            key: normalizeComparableCode(node.internalCode) || `node:${index}`,
            allCodes: [...node.allCodes],
            startStation: node.startStation,
            endStation: node.endStation,
            startAt: node.startAt,
            endAt: node.endAt,
            isCurrent: index === currentCirculationNodeIndex.value
        }));
    });

    const circulationSummaryLabel = computed(() => {
        return `${circulationNodes.value.length} 段交路`;
    });

    const circulationNotice = computed(() => {
        return circulation.value?.source === 'inferred'
            ? '当前交路表结果由计算推测得到，仅供参考'
            : '';
    });

    const circulationPdfRequestTrainCode = computed(() => {
        return normalizeComparableCode(
            circulation.value?.nodes[0]?.allCodes[0]
        );
    });

    function resolveCirculationNodeFocusTrainCodes(
        node: DisplayCirculationNode
    ) {
        return normalizeTrainCodes([
            ...node.allCodes,
            ...toValue(options.timetableFocusTrainCodes)
        ]);
    }

    function isCurrentCirculationCode(code: string) {
        return currentCirculationTrainCodeSet.value.has(
            normalizeComparableCode(code)
        );
    }

    function buildCirculationCodeLink(code: string) {
        return buildLookupPath({
            type: 'train',
            code: normalizeComparableCode(code)
        });
    }

    return {
        circulation,
        circulationNodes,
        circulationSummaryLabel,
        circulationNotice,
        circulationPdfRequestTrainCode,
        resolveCirculationNodeFocusTrainCodes,
        isCurrentCirculationCode,
        buildCirculationCodeLink
    };
}
