import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type {
    CurrentTrainTimetableData,
    RecentAssignmentsState
} from '~/types/lookup';
import { V2ApiError } from '~/utils/api/v2/V2ApiError';
import { fetchCurrentTrainTimetable } from '~/utils/api/v2/domain/lookup';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

export default function useCurrentTrainTimetable(
    trainCodeSource: MaybeRefOrGetter<string>,
    activeSource: MaybeRefOrGetter<boolean>
) {
    const state = ref<RecentAssignmentsState>('idle');
    const timetable = ref<CurrentTrainTimetableData | null>(null);
    const errorMessage = ref('');
    const normalizedTrainCode = computed(() =>
        String(toValue(trainCodeSource) ?? '')
            .trim()
            .toUpperCase()
    );
    let requestToken = 0;
    const cachedTimetables = new Map<string, CurrentTrainTimetableData>();
    const pendingTimetables = new Map<
        string,
        Promise<CurrentTrainTimetableData>
    >();

    watch(
        () => [toValue(activeSource), normalizedTrainCode.value] as const,
        async ([isActive, trainCode]) => {
            requestToken += 1;
            const activeToken = requestToken;

            if (!isActive) {
                cachedTimetables.clear();
                pendingTimetables.clear();
                timetable.value = null;
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
                let pending = pendingTimetables.get(trainCode);
                if (!pending) {
                    pending = fetchCurrentTrainTimetable(trainCode);
                    pendingTimetables.set(trainCode, pending);
                }
                const data = await pending;
                if (activeToken !== requestToken) {
                    return;
                }

                cachedTimetables.set(trainCode, data);
                timetable.value = data;
                state.value = data.stops.length > 0 ? 'success' : 'empty';
            } catch (error) {
                if (activeToken !== requestToken) {
                    return;
                }

                if (error instanceof V2ApiError && error.code === 'not_found') {
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
            } finally {
                pendingTimetables.delete(trainCode);
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
