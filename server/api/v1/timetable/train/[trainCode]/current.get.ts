import { defineEventHandler, getRouterParam } from 'h3';
import useConfig from '~/server/config';
import { getCurrentTrainTimetable } from '~/server/domain/timetable';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    formatExternalTrainCode,
    parseExternalTrainCodeOrThrow
} from '~/server/utils/internal/boundaries';

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

            const timetable = await getCurrentTrainTimetable(
                parseExternalTrainCodeOrThrow(trainCode, 'trainCode')
            );

            return {
                updatedAt: timetable.updatedAt,
                requestTrainCode: trainCode,
                trainCode: formatExternalTrainCode(timetable.trainCode),
                internalCode: timetable.internalCode,
                allCodes: timetable.allCodes.map(formatExternalTrainCode),
                bureauCode: timetable.bureauCode,
                bureauName: timetable.bureauName,
                trainDepartment: timetable.trainDepartment,
                passengerDepartment: timetable.passengerDepartment,
                referenceModels: timetable.referenceModels,
                startStation: timetable.startStation,
                endStation: timetable.endStation,
                startAt: timetable.startAt,
                endAt: timetable.endAt,
                circulation: timetable.circulation,
                stops: timetable.stops.map((stop) => ({
                    ...stop,
                    stationTrainCode: formatExternalTrainCode(
                        stop.stationTrainCode
                    )
                }))
            };
        }
    );
});
