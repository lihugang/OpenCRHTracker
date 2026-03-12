import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    EmuHistoryRecord,
    EmuHistoryResponse,
    LookupTarget,
    RecentAssignmentGroup,
    RecentAssignmentsState,
    TrainHistoryRecord,
    TrainHistoryResponse
} from '~/types/lookup';
import {
    groupEmuAssignments,
    groupTrainAssignments
} from '~/utils/assignmentGroups';
import getApiErrorMessage from '~/utils/getApiErrorMessage';

const LOOKBACK_DAYS = 30;
const LOOKBACK_SECONDS = LOOKBACK_DAYS * 24 * 60 * 60;
const REQUEST_LIMIT = 200;
const MAX_PAGES = 20;

function getNowSeconds() {
    return Math.floor(Date.now() / 1000);
}

async function fetchTrainHistoryPages(target: LookupTarget) {
    const items: TrainHistoryRecord[] = [];
    const start = getNowSeconds() - LOOKBACK_SECONDS;
    const end = getNowSeconds();
    let cursor = '';
    let pageCount = 0;

    while (pageCount < MAX_PAGES) {
        const response = await $fetch<TrackerApiResponse<TrainHistoryResponse>>(
            `/api/v1/history/train/${encodeURIComponent(target.code)}`,
            {
                query: {
                    start,
                    end,
                    limit: REQUEST_LIMIT,
                    cursor: cursor || undefined
                }
            }
        );

        if (!response.ok) {
            throw {
                data: response
            };
        }

        items.push(...response.data.items);
        cursor = response.data.nextCursor ?? '';
        pageCount += 1;

        if (!cursor) {
            break;
        }
    }

    return items;
}

async function fetchEmuHistoryPages(target: LookupTarget) {
    const items: EmuHistoryRecord[] = [];
    const start = getNowSeconds() - LOOKBACK_SECONDS;
    const end = getNowSeconds();
    let cursor = '';
    let pageCount = 0;

    while (pageCount < MAX_PAGES) {
        const response = await $fetch<TrackerApiResponse<EmuHistoryResponse>>(
            `/api/v1/history/emu/${encodeURIComponent(target.code)}`,
            {
                query: {
                    start,
                    end,
                    limit: REQUEST_LIMIT,
                    cursor: cursor || undefined
                }
            }
        );

        if (!response.ok) {
            throw {
                data: response
            };
        }

        items.push(...response.data.items);
        cursor = response.data.nextCursor ?? '';
        pageCount += 1;

        if (!cursor) {
            break;
        }
    }

    return items;
}

export function useRecentAssignments(
    targetSource: MaybeRefOrGetter<LookupTarget | null>
) {
    const state = ref<RecentAssignmentsState>('idle');
    const groups = ref<RecentAssignmentGroup[]>([]);
    const errorMessage = ref('');

    const summary = computed(() => {
        const target = toValue(targetSource);

        if (!target) {
            return '';
        }

        if (state.value === 'loading') {
            return `正在整理 ${target.code} 最近 ${LOOKBACK_DAYS} 天的担当情况…`;
        }

        if (state.value === 'success') {
            return `最近 ${LOOKBACK_DAYS} 天共整理出 ${groups.value.length} 组担当结果`;
        }

        if (state.value === 'empty') {
            return `最近 ${LOOKBACK_DAYS} 天暂未查询到担当结果`;
        }

        return '';
    });

    async function reload() {
        const target = toValue(targetSource);
        if (!target) {
            state.value = 'empty';
            groups.value = [];
            errorMessage.value = '';
            return;
        }

        state.value = 'loading';
        groups.value = [];
        errorMessage.value = '';

        try {
            groups.value =
                target.type === 'train'
                    ? groupTrainAssignments(
                          await fetchTrainHistoryPages(target)
                      )
                    : groupEmuAssignments(await fetchEmuHistoryPages(target));
            state.value = groups.value.length > 0 ? 'success' : 'empty';
        } catch (error) {
            state.value = 'error';
            errorMessage.value = getApiErrorMessage(
                error,
                '近日担当列表加载失败，请稍后重试。'
            );
        }
    }

    watch(
        () => {
            const target = toValue(targetSource);
            return target ? `${target.type}:${target.code}` : '';
        },
        async () => {
            await reload();
        },
        {
            immediate: true
        }
    );

    return {
        state,
        groups,
        errorMessage,
        summary,
        reload
    };
}
