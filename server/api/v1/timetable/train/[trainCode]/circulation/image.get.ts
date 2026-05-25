import { defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3';
import useConfig from '~/server/config';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import {
    renderTrainCirculationImage,
    toTrainCirculationImageData,
    type TrainCirculationImageFormat,
    type TrainCirculationImageRenderResult
} from '~/server/services/trainCirculationImageService';

function parseBinaryFlag(value: unknown): boolean {
    if (value === undefined) {
        return false;
    }
    if (value === '1' || value === 'true') {
        return true;
    }
    if (value === '0' || value === 'false') {
        return false;
    }

    throw new Error('binary');
}

function parseFormat(value: unknown): TrainCirculationImageFormat {
    if (value === undefined) {
        return 'png';
    }
    if (value === 'png' || value === 'pdf') {
        return value;
    }

    throw new Error('format');
}

export default defineEventHandler(async (event) => {
    const cacheMaxAge = useConfig().api.cache.timetableMaxAgeSeconds;

    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.timetable.train.current.read],
            fixedCost: getFixedCost('trainCirculationImage'),
            rawSuccessResponse: (successEvent, data) => {
                const successQuery = getQuery(successEvent);
                const binaryRequested =
                    successQuery.binary === '1' ||
                    successQuery.binary === 'true';

                if (!binaryRequested) {
                    return {
                        ok: true,
                        data: toTrainCirculationImageData(data),
                        error: ''
                    };
                }

                setHeader(successEvent, 'Content-Type', data.binaryContentType);
                return data.binaryContent;
            },
            successHeaders: (successEvent) =>
                setCacheControl(successEvent, cacheMaxAge)
        },
        async (): Promise<TrainCirculationImageRenderResult> => {
            const trainCode = getRouterParam(event, 'trainCode');
            const query = getQuery(event);

            ensure(
                typeof trainCode === 'string' && trainCode.length > 0,
                400,
                'invalid_param',
                'trainCode 不能为空'
            );

            let binaryRequested = false;
            let format: TrainCirculationImageFormat = 'png';
            try {
                binaryRequested = parseBinaryFlag(query.binary);
            } catch {
                ensure(false, 400, 'invalid_param', 'binary 必须是 true/false');
            }
            try {
                format = parseFormat(query.format);
            } catch {
                ensure(false, 400, 'invalid_param', 'format 必须是 png 或 pdf');
            }

            return renderTrainCirculationImage(trainCode, binaryRequested, format);
        }
    );
});
