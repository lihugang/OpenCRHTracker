import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    CurrentTrainTimetableData,
    RecentAssignmentsState
} from '~/types/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

const cachedTimetables = new Map<string, CurrentTrainTimetableData>();

function isNotFoundResponse(
    response: TrackerApiResponse<CurrentTrainTimetableData>
): response is Extract<
    TrackerApiResponse<CurrentTrainTimetableData>,
    { ok: false }
> {
    return !response.ok && response.error === 'not_found';
}

function isNotFoundError(error: unknown) {
    if (typeof error !== 'object' || error === null || !('response' in error)) {
        return false;
    }

    const response = (
        error as {
            response?: {
                status?: unknown;
                _data?: unknown;
            };
        }
    ).response;
    const status = typeof response?.status === 'number' ? response.status : 0;
    const payload = response?._data as
        | Partial<TrackerApiResponse<CurrentTrainTimetableData>>
        | undefined;

    return status === 404 && payload?.error === 'not_found';
}

export default function useCurrentTrainTimetable(
    trainCodeSource: MaybeRefOrGetter<string>,
    activeSource: MaybeRefOrGetter<boolean>
) {
    const requestFetch: TrackedRequestFetch = import.meta.server
        ? useTrackedRequestFetch()
        : ($fetch as TrackedRequestFetch);
    const state = ref<RecentAssignmentsState>('idle');
    const timetable = ref<CurrentTrainTimetableData | null>(null);
    const errorMessage = ref('');
    const normalizedTrainCode = computed(() =>
        String(toValue(trainCodeSource) ?? '')
            .trim()
            .toUpperCase()
    );
    let requestToken = 0;

    watch(
        () => [toValue(activeSource), normalizedTrainCode.value] as const,
        async ([isActive, trainCode]) => {
            requestToken += 1;
            const activeToken = requestToken;

            if (!isActive) {
                state.value = 'idle';
                errorMessage.value = '';
                return;
            }

            if (trainCode.length === 0) {
                timetable.value = null;
                state.value = 'empty';
                errorMessage.value = '';
                return;
            }

            const cachedTimetable = cachedTimetables.get(trainCode);
            if (cachedTimetable) {
                timetable.value = cachedTimetable;
                state.value =
                    cachedTimetable.stops.length > 0 ? 'success' : 'empty';
                errorMessage.value = '';
                return;
            }

            timetable.value = null;
            state.value = 'loading';
            errorMessage.value = '';

            try {
                const response = await requestFetch<
                    TrackerApiResponse<CurrentTrainTimetableData>
                >(
                    '/api/v1/timetable/train/' +
                        encodeURIComponent(trainCode) +
                        '/current'
                );

                if (!response.ok) {
                    if (isNotFoundResponse(response)) {
                        timetable.value = null;
                        state.value = 'empty';
                        errorMessage.value = '';
                        return;
                    }

                    throw {
                        data: response
                    };
                }

                if (activeToken !== requestToken) {
                    return;
                }

                cachedTimetables.set(trainCode, response.data);
                timetable.value = response.data;
                state.value =
                    response.data.stops.length > 0 ? 'success' : 'empty';
            } catch (error) {
                if (activeToken !== requestToken) {
                    return;
                }

                if (isNotFoundError(error)) {
                    timetable.value = null;
                    state.value = 'empty';
                    errorMessage.value = '';
                    return;
                }

                timetable.value = null;
                state.value = 'error';
                errorMessage.value = getApiErrorMessage(
                    error,
                    '当前时刻表加载失败，请稍后重试。'
                );
            }
        },
        {
            immediate: true
        }
    );

    return {
        state,
        timetable,
        errorMessage,
        normalizedTrainCode
    };
}
