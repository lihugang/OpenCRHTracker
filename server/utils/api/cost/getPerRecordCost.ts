import useConfig from '~/server/config';
import type { PerRecordCostKey } from '~/server/utils/api/cost/CostTypes';

export default function getPerRecordCost(
    recordCount: number,
    key: PerRecordCostKey
) {
    const config = useConfig();
    const rule = config.cost.perRecord[key];
    if (recordCount <= 0) {
        return 0;
    }

    const rawCost = recordCount * rule.unitCost;
    if (rule.rounding === 'ceil') {
        return Math.ceil(rawCost);
    }

    return Math.ceil(rawCost);
}
