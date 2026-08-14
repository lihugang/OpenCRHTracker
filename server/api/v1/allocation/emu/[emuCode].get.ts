import { defineEventHandler, getRouterParam } from 'h3';
import useConfig from '~/server/config';
import { getEmuAllocation } from '~/server/domain/allocation';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { formatExternalEmuCode } from '~/server/utils/internal/boundaries';

export default defineEventHandler(async (event) => {
    const cacheMaxAge = useConfig().api.cache.searchIndexMaxAgeSeconds;

    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.allocation.emu.read],
            fixedCost: getFixedCost('allocationEmu'),
            successHeaders: (successEvent) =>
                setCacheControl(successEvent, cacheMaxAge)
        },
        async () => {
            const rawEmuCode = getRouterParam(event, 'emuCode');

            ensure(
                typeof rawEmuCode === 'string' && rawEmuCode.length > 0,
                400,
                'invalid_param',
                'emuCode 不能为空'
            );

            const requestEmuCode = normalizeCode(rawEmuCode);
            ensure(
                requestEmuCode.length > 0,
                400,
                'invalid_param',
                'emuCode 不能为空'
            );

            const profile = await getEmuAllocation(requestEmuCode);

            return {
                requestEmuCode,
                emuCode: formatExternalEmuCode(profile.emuId),
                model: profile.model,
                trainSetNo: profile.trainSetNo,
                bureau: profile.bureau,
                trainDepot: profile.trainDepot,
                depot: profile.depot,
                subModel: profile.subModel,
                customType: profile.customType,
                trainsetManufacturer: profile.trainsetManufacturer,
                trailerManufacturer: profile.trailerManufacturer,
                manufactureMonth: profile.manufactureMonth,
                designMaxSpeed: profile.designMaxSpeed,
                operatingMaxSpeed: profile.operatingMaxSpeed,
                isPublic: profile.isPublic,
                railwayTravelCodeEnabled: profile.railwayTravelCodeEnabled,
                firstClassPowerLegrest: profile.firstClassPowerLegrest,
                toiletStatus: profile.toiletStatus,
                socketLocation: profile.socketLocation,
                businessSeatType: profile.businessSeatType,
                modelRemark: profile.modelRemark,
                note: profile.note,
                tags: profile.tags,
                alias: profile.alias,
                coachLayouts: profile.coachLayouts
            };
        }
    );
});
