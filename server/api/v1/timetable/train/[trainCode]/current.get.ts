import { defineEventHandler, getRouterParam } from 'h3';
import useConfig from '~/server/config';
import { getReferenceModelsByTrainCodes } from '~/server/services/referenceModelIndexStore';
import { getTrainCirculationByTrainCodes } from '~/server/services/trainCirculationIndexStore';
import { getTodayScheduleTimetableByTrainCode } from '~/server/services/todayScheduleCache';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { CurrentTrainTimetableData } from '~/types/lookup';
import resolveBureauNameByCode from '~/utils/railway/resolveBureauNameByCode';

export default defineEventHandler(async (event) => {
    const cacheMaxAge = useConfig().api.cache.timetableMaxAgeSeconds;

    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.timetable.train.current.read],
            fixedCost: getFixedCost('timetableTrainCurrent'),
            successHeaders: (successEvent) =>
                setCacheControl(successEvent, cacheMaxAge)
        },
        async () => {
            const trainCode = getRouterParam(event, 'trainCode');

            ensure(
                typeof trainCode === 'string' && trainCode.length > 0,
                400,
                'invalid_param',
                'trainCode 不能为空'
            );

            const timetable = getTodayScheduleTimetableByTrainCode(trainCode);
            ensure(
                timetable && timetable.stops.length > 0,
                404,
                'not_found',
                '当前暂无时刻表'
            );

            const response: CurrentTrainTimetableData = {
                updatedAt: timetable.updatedAt,
                requestTrainCode: trainCode,
                trainCode: timetable.trainCode,
                internalCode: timetable.trainInternalCode,
                allCodes: [...timetable.allCodes],
                bureauCode: timetable.bureauCode,
                bureauName: resolveBureauNameByCode(timetable.bureauCode),
                trainDepartment: timetable.trainDepartment,
                passengerDepartment: timetable.passengerDepartment,
                referenceModels: getReferenceModelsByTrainCodes(
                    timetable.allCodes
                ),
                startStation: timetable.startStation,
                endStation: timetable.endStation,
                startAt: timetable.startAt,
                endAt: timetable.endAt,
                circulation: getTrainCirculationByTrainCodes(
                    timetable.allCodes
                ),
                stops: timetable.stops.map((stop) => ({
                    ...stop
                }))
            };

            return response;
        }
    );
});
