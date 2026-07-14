import { defineEventHandler, getRouterParam } from 'h3';
import useConfig from '~/server/config';
import { loadProbeAssets } from '~/server/services/probeAssetStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import setCacheControl from '~/server/utils/api/response/setCacheControl';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import type { EmuAllocationProfileResponse } from '~/types/lookup';

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

            const assets = await loadProbeAssets();
            const canonicalEmuCode =
                assets.canonicalEmuCodeByAnyCode.get(requestEmuCode) ??
                requestEmuCode;
            const record = assets.emuList.find(
                (item) =>
                    normalizeCode(`${item.model}-${item.trainSetNo}`) ===
                    canonicalEmuCode
            );

            ensure(
                record,
                404,
                'allocation_not_found',
                '未找到该动车组配属信息'
            );

            const response: EmuAllocationProfileResponse = {
                requestEmuCode,
                emuCode: canonicalEmuCode,
                model: record.model,
                trainSetNo: record.trainSetNo,
                bureau: record.bureau,
                trainDepot: record.trainDepot,
                depot: record.depot,
                subModel: record.subModel,
                customType: record.customType,
                trainsetManufacturer: record.trainsetManufacturer,
                trailerManufacturer: record.trailerManufacturer,
                manufactureMonth: record.manufactureMonth,
                designMaxSpeed: record.designMaxSpeed,
                operatingMaxSpeed: record.operatingMaxSpeed,
                isPublic: record.isPublic,
                railwayTravelCodeEnabled: record.railwayTravelCodeEnabled,
                firstClassPowerLegrest: record.firstClassPowerLegrest,
                toiletStatus: record.toiletStatus,
                socketLocation: record.socketLocation,
                businessSeatType: record.businessSeatType,
                modelRemark: record.modelRemark,
                note: record.note,
                tags: [...record.tags],
                alias: [...record.alias],
                coachLayouts: record.coachLayouts.map((layout) => ({
                    ...layout
                }))
            };

            return response;
        }
    );
});
