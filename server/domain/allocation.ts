import { loadProbeAssets } from '~/server/services/probeAssetStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import { asEmuId, getEmuId, type EmuId } from '~/server/libs/database/emu';
import normalizeCode from '~/server/utils/12306/normalizeCode';

export interface EmuAllocationDomainResult {
    emuId: EmuId;
    model: string;
    trainSetNo: string;
    bureau: string;
    trainDepot: string;
    depot: string;
    subModel: string;
    customType: string;
    trainsetManufacturer: string;
    trailerManufacturer: string;
    manufactureMonth: string;
    designMaxSpeed: number;
    operatingMaxSpeed: number;
    isPublic: boolean;
    railwayTravelCodeEnabled: boolean;
    firstClassPowerLegrest: boolean;
    toiletStatus: string;
    socketLocation: string;
    businessSeatType: string;
    modelRemark: string;
    note: string;
    tags: string[];
    alias: string[];
    coachLayouts: Array<Record<string, unknown>>;
}

export async function getEmuAllocation(
    requestEmuCode: string
): Promise<EmuAllocationDomainResult> {
    const normalizedRequestCode = normalizeCode(requestEmuCode);
    if (normalizedRequestCode.length === 0) {
        throw new ApiRequestError(400, 'invalid_param', 'emuCode 不能为空');
    }

    const assets = await loadProbeAssets();
    const canonicalEmuCode =
        assets.canonicalEmuCodeByAnyCode.get(normalizedRequestCode) ??
        normalizedRequestCode;
    const record = assets.emuList.find(
        (item) =>
            normalizeCode(`${item.model}-${item.trainSetNo}`) ===
            canonicalEmuCode
    );

    if (!record) {
        throw new ApiRequestError(
            404,
            'allocation_not_found',
            '未找到该动车组配属信息'
        );
    }

    const emuId = getEmuId(canonicalEmuCode);
    if (emuId === null) {
        throw new ApiRequestError(
            404,
            'allocation_not_found',
            '未找到该动车组配属信息'
        );
    }

    return {
        emuId: asEmuId(emuId),
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
        coachLayouts: record.coachLayouts.map((layout) => ({ ...layout }))
    };
}
