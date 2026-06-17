import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import type {
    CurrentTrainTimetableData,
    HistoricalTimetableData
} from '~/types/lookup';
import type {
    DisplayTimetableData,
    DisplayTimetableStop
} from '~/types/lookupCurrentTimetable';
import {
    formatStopDistance as formatDisplayStopDistance,
    formatStopSectionSpeed as formatDisplayStopSectionSpeed,
    formatStopTime as formatDisplayStopTime,
    formatStopWicket,
    getUpdatedDateLabel,
    isFiniteNumber,
    isStartStop,
    normalizeTrainCodes
} from '~/utils/lookup/timetableDisplay';

const currentColumns = ['站序', '车次', '站名', '到点', '开点', '检票口'];
const distanceColumns = ['里程', '区间均速'];
const historyColumns = ['站序', '车次', '站名', '到点', '开点'];

export default function useLookupTimetableDisplay(options: {
    trainCode: MaybeRefOrGetter<string>;
    displayCodes: MaybeRefOrGetter<string[] | undefined>;
    timetable: MaybeRefOrGetter<CurrentTrainTimetableData | null>;
    selectedHistoricalContent: MaybeRefOrGetter<HistoricalTimetableData | null>;
    isCurrentView: MaybeRefOrGetter<boolean>;
}) {
    const displayedTimetable = computed<DisplayTimetableData | null>(() => {
        if (toValue(options.isCurrentView)) {
            const timetable = toValue(options.timetable);
            if (!timetable) {
                return null;
            }

            return {
                allCodes: [...timetable.allCodes],
                startStation: timetable.startStation,
                endStation: timetable.endStation,
                stops: timetable.stops.map((stop) => ({
                    stationNo: stop.stationNo,
                    stationName: stop.stationName,
                    stationTrainCode: stop.stationTrainCode,
                    arriveAt: stop.arriveAt,
                    departAt: stop.departAt,
                    wicket: stop.wicket,
                    distance: stop.distance,
                    platformNo: stop.platformNo,
                    isStart: stop.isStart
                })),
                updatedAt: timetable.updatedAt,
                circulation: timetable.circulation,
                bureauName: timetable.bureauName,
                trainDepartment: timetable.trainDepartment,
                passengerDepartment: timetable.passengerDepartment,
                internalCode: timetable.internalCode,
                requestTrainCode: timetable.requestTrainCode,
                isHistorical: false
            };
        }

        const historicalTimetable = toValue(options.selectedHistoricalContent);
        if (!historicalTimetable) {
            return null;
        }

        const trainCode = toValue(options.trainCode);
        return {
            allCodes: [trainCode],
            startStation: historicalTimetable.startStation ?? '--',
            endStation: historicalTimetable.endStation ?? '--',
            stops: historicalTimetable.stops.map((stop) => ({
                stationNo: stop.stationNo,
                stationName: stop.stationName,
                stationTrainCode: stop.stationTrainCode,
                arriveAt: stop.arriveOffset,
                departAt: stop.departOffset,
                wicket: null,
                distance: null,
                platformNo: null,
                isStart: stop.isStart
            })),
            updatedAt: null,
            circulation: null,
            bureauName: '',
            trainDepartment: '',
            passengerDepartment: '',
            internalCode: '',
            requestTrainCode: trainCode,
            isHistorical: true
        };
    });

    const modalTitle = computed(() => {
        if (displayedTimetable.value) {
            return displayedTimetable.value.allCodes.join(' / ');
        }

        const displayCodes = toValue(options.displayCodes);
        if (Array.isArray(displayCodes) && displayCodes.length > 0) {
            return displayCodes.join(' / ');
        }

        return toValue(options.trainCode) || '当前时刻表';
    });

    const timetableNotice = computed(() => {
        const displayCodes = toValue(options.displayCodes);
        const displayCode =
            displayedTimetable.value?.allCodes[0] ??
            displayCodes?.[0] ??
            toValue(options.trainCode);
        const updatedDateLabel = getUpdatedDateLabel(
            displayedTimetable.value?.updatedAt ?? null
        );

        if (updatedDateLabel.length === 0) {
            return `当前展示的是 ${displayCode} 次列车时刻表数据，仅供参考`;
        }

        return `当前展示的是${updatedDateLabel} ${displayCode} 次列车时刻表数据，仅供参考`;
    });

    const timetableFocusTrainCodes = computed(() => {
        return normalizeTrainCodes([
            ...(displayedTimetable.value?.allCodes ?? []),
            ...(toValue(options.displayCodes) ?? []),
            toValue(options.trainCode)
        ]);
    });

    const responsibilitySummary = computed(() => {
        if (!toValue(options.isCurrentView)) {
            return '';
        }

        const timetable = toValue(options.timetable);
        const bureauName = timetable?.bureauName.trim() ?? '';
        if (bureauName.length === 0) {
            return '';
        }

        const trainDepartment = timetable?.trainDepartment.trim() ?? '';
        const passengerDepartment = timetable?.passengerDepartment.trim() ?? '';
        const leadingText = [bureauName, trainDepartment]
            .filter((part) => part.length > 0)
            .join(', ');

        if (passengerDepartment.length === 0) {
            return leadingText;
        }

        return `${leadingText}, ${passengerDepartment}`;
    });

    const shouldShowDistanceColumns = computed(() => {
        if (!toValue(options.isCurrentView) || !displayedTimetable.value) {
            return false;
        }

        return displayedTimetable.value.stops.every((stop, index) => {
            if (isStartStop(stop, index)) {
                return true;
            }

            return isFiniteNumber(stop.distance);
        });
    });

    const visibleColumns = computed(() => {
        if (!toValue(options.isCurrentView)) {
            return historyColumns;
        }

        return shouldShowDistanceColumns.value
            ? [...currentColumns, ...distanceColumns]
            : currentColumns;
    });

    const timetableSummaryLabel = computed(() => {
        return `${displayedTimetable.value?.stops.length ?? 0} 站`;
    });

    function resolveStopFocusTrainCodes(stop: DisplayTimetableStop) {
        return normalizeTrainCodes([
            stop.stationTrainCode,
            ...timetableFocusTrainCodes.value
        ]);
    }

    function formatStopTime(value: number | null) {
        return formatDisplayStopTime(
            value,
            displayedTimetable.value?.isHistorical ?? false
        );
    }

    function formatStopDistance(stop: DisplayTimetableStop, index: number) {
        return formatDisplayStopDistance(stop, index);
    }

    function formatStopSectionSpeed(stop: DisplayTimetableStop, index: number) {
        return formatDisplayStopSectionSpeed(
            displayedTimetable.value?.stops ?? [],
            stop,
            index
        );
    }

    return {
        displayedTimetable,
        modalTitle,
        timetableNotice,
        timetableFocusTrainCodes,
        responsibilitySummary,
        shouldShowDistanceColumns,
        visibleColumns,
        timetableSummaryLabel,
        resolveStopFocusTrainCodes,
        formatStopTime,
        formatStopWicket,
        formatStopDistance,
        formatStopSectionSpeed
    };
}
