import getLogger from '~/server/libs/log4js';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { rescheduleTaskUntilScheduleReady } from '~/server/services/scheduleReadinessGuard';
import {
    enqueueOrReuseStationBoardFetchTask,
    resolveStationTelecodeByStationName
} from '~/server/services/stationBoardTaskDispatch';
import { getTodayScheduleTimetableByTrainCode } from '~/server/services/todayScheduleCache';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import {
    appendRouteRefreshQueueTrainCodes,
    loadPublishedScheduleState
} from '~/server/utils/12306/scheduleProbe/stateStore';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import useConfig from '~/server/config';

export const REFRESH_TRAIN_CIRCULATION_TASK_EXECUTOR =
    'refresh_train_circulation';

const logger = getLogger('task-executor:refresh-train-circulation');

let registered = false;

interface RefreshTrainCirculationTaskArgs {
    trainCode: string;
}

function parseTaskArgs(raw: unknown): RefreshTrainCirculationTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const trainCode = normalizeCode(
        String((raw as { trainCode?: unknown }).trainCode ?? '')
    );
    if (trainCode.length === 0) {
        throw new Error('task arguments trainCode must be a non-empty string');
    }

    return {
        trainCode
    };
}

function resolveDepartureStationName(trainCode: string) {
    const timetable = getTodayScheduleTimetableByTrainCode(trainCode);
    if (!timetable) {
        throw new Error(
            '当前时刻表中不存在该车次，或该车次尚未完成线路信息刷新'
        );
    }

    const startStationName = timetable.startStation.trim();
    if (startStationName.length > 0) {
        return startStationName;
    }

    const fallbackStop =
        timetable.stops.find((stop) => stop.isStart) ??
        timetable.stops[0] ??
        null;
    const fallbackStationName = fallbackStop?.stationName.trim() ?? '';
    if (fallbackStationName.length > 0) {
        return fallbackStationName;
    }

    throw new Error('该车次当前缺少始发站信息，请先执行线路刷新');
}

async function executeRefreshTrainCirculationTask(rawArgs: unknown) {
    const args = parseTaskArgs(rawArgs);
    const readiness = rescheduleTaskUntilScheduleReady(
        REFRESH_TRAIN_CIRCULATION_TASK_EXECUTOR,
        args
    );
    if (!readiness.ready) {
        logger.info(
            `schedule_refresh_pending_reschedule executor=${REFRESH_TRAIN_CIRCULATION_TASK_EXECUTOR} trainCode=${args.trainCode} reason=${readiness.state.reason} nextExecutionTime=${readiness.nextExecutionTime ?? 'null'} taskId=${readiness.rescheduledTaskId ?? 'null'} action=${readiness.action ?? 'null'}`
        );
        return;
    }
    const scheduleFilePath = useConfig().data.assets.schedule.file;
    const state = loadPublishedScheduleState(scheduleFilePath);
    if (!state) {
        throw new Error('当前已发布时刻表暂不可用');
    }

    const currentDate = getCurrentDateString();
    if (state.date !== currentDate) {
        throw new Error('当前已发布时刻表尚未更新到今天');
    }

    const stationName = resolveDepartureStationName(args.trainCode);
    const executionTime = getNowSeconds();
    const appendedQueueEntries = appendRouteRefreshQueueTrainCodes(
        scheduleFilePath,
        state.date,
        [args.trainCode],
        executionTime
    );
    const telecodeResolution =
        await resolveStationTelecodeByStationName(stationName);

    if (telecodeResolution.status === 'not_found') {
        throw new Error(`未找到始发站“${stationName}”的电报码`);
    }

    if (telecodeResolution.status === 'ambiguous') {
        throw new Error(
            `始发站“${stationName}”存在多个电报码：${telecodeResolution.ambiguousTelecodes.join(' / ')}`
        );
    }

    const stationBoardTask = enqueueOrReuseStationBoardFetchTask({
        serviceDate: state.date,
        stationName,
        stationTelecode: telecodeResolution.stationTelecode,
        executionTime
    });

    logger.info(
        `done trainCode=${args.trainCode} stationName=${stationName} stationTelecode=${telecodeResolution.stationTelecode} action=${stationBoardTask.action} stationBoardTaskId=${stationBoardTask.schedulerTaskId} queueAppended=${appendedQueueEntries.length}`
    );
}

export function registerRefreshTrainCirculationTaskExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(
        REFRESH_TRAIN_CIRCULATION_TASK_EXECUTOR,
        async (args) => {
            await executeRefreshTrainCirculationTask(args);
        }
    );
    registered = true;
    logger.info(
        `registered executor=${REFRESH_TRAIN_CIRCULATION_TASK_EXECUTOR}`
    );
}
