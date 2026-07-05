import useConfig from '~/server/config';
import {
    reconcileFuturePendingTaskByExecutorAndArgs,
    type EnqueueTaskOptions
} from '~/server/services/taskQueue';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { ensureScheduleDocumentMigrated } from '~/server/utils/12306/scheduleProbe/stateStore';
import {
    loadScheduleStateSummaries,
    type ScheduleStateSummary
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
import type { ScheduleState } from '~/server/utils/12306/scheduleProbe/types';

export type ScheduleReadinessReason =
    | 'schedule_not_found'
    | 'schedule_not_current'
    | 'schedule_building_running'
    | 'schedule_not_done'
    | 'schedule_missing_usable_timetable';

export interface ScheduleReadinessPendingState {
    ready: false;
    reason: ScheduleReadinessReason;
    currentDate: string;
    publishedDate: string | null;
    publishedStatus: ScheduleState['status'] | null;
    publishedPhase: ScheduleState['progress']['phase'] | null;
    buildingDate: string | null;
    buildingStatus: ScheduleState['status'] | null;
}

export interface ScheduleReadinessReadyState {
    ready: true;
    currentDate: string;
    publishedDate: string;
}

export type ScheduleReadinessState =
    | ScheduleReadinessReadyState
    | ScheduleReadinessPendingState;

export type ScheduleReadinessRescheduleResult =
    | {
          ready: true;
          state: ScheduleReadinessReadyState;
          rescheduledTaskId: null;
          action: null;
          nextExecutionTime: null;
          removedTaskIds: [];
          reusedExecutionTime: null;
      }
    | {
          ready: false;
          state: ScheduleReadinessPendingState;
          rescheduledTaskId: number;
          action: 'created' | 'replaced_overdue' | 'reused_future';
          nextExecutionTime: number;
          removedTaskIds: number[];
          reusedExecutionTime: number | null;
      };

function buildPendingState(
    reason: ScheduleReadinessReason,
    currentDate: string,
    published: ScheduleStateSummary | null,
    building: ScheduleStateSummary | null
): ScheduleReadinessPendingState {
    return {
        ready: false,
        reason,
        currentDate,
        publishedDate: published?.date ?? null,
        publishedStatus: published?.status ?? null,
        publishedPhase: published?.phase ?? null,
        buildingDate: building?.date ?? null,
        buildingStatus: building?.status ?? null
    };
}

export function getScheduleReadinessState(): ScheduleReadinessState {
    const currentDate = getCurrentDateString();
    const migrated = ensureScheduleDocumentMigrated();
    const summaries = migrated ? loadScheduleStateSummaries() : [];
    const published =
        summaries.find((summary) => summary.kind === 'published') ?? null;
    const building =
        summaries.find((summary) => summary.kind === 'building') ?? null;

    if (!published) {
        return buildPendingState(
            'schedule_not_found',
            currentDate,
            published,
            building
        );
    }

    if (published.date !== currentDate) {
        return buildPendingState(
            'schedule_not_current',
            currentDate,
            published,
            building
        );
    }

    if (building?.date === currentDate && building.status === 'running') {
        return buildPendingState(
            'schedule_building_running',
            currentDate,
            published,
            building
        );
    }

    if (published.status === 'running' || published.phase !== 'done') {
        return buildPendingState(
            'schedule_not_done',
            currentDate,
            published,
            building
        );
    }

    if (published.usableTimetableCount <= 0) {
        return buildPendingState(
            'schedule_missing_usable_timetable',
            currentDate,
            published,
            building
        );
    }

    return {
        ready: true,
        currentDate,
        publishedDate: published.date
    };
}

export function rescheduleTaskUntilScheduleReady(
    executor: string,
    args: unknown,
    options: EnqueueTaskOptions = {}
): ScheduleReadinessRescheduleResult {
    const state = getScheduleReadinessState();
    if (state.ready) {
        return {
            ready: true,
            state,
            rescheduledTaskId: null,
            action: null,
            nextExecutionTime: null,
            removedTaskIds: [],
            reusedExecutionTime: null
        } satisfies ScheduleReadinessRescheduleResult;
    }

    const delaySeconds =
        useConfig().task.scheduleReadiness.rescheduleDelaySeconds;
    const nextExecutionTime = getNowSeconds() + delaySeconds;
    const result = reconcileFuturePendingTaskByExecutorAndArgs(
        executor,
        args,
        nextExecutionTime,
        options
    );

    return {
        ready: false,
        state,
        rescheduledTaskId: result.taskId,
        action: result.action,
        nextExecutionTime,
        removedTaskIds: result.removedTaskIds,
        reusedExecutionTime: result.reusedExecutionTime
    } satisfies ScheduleReadinessRescheduleResult;
}
