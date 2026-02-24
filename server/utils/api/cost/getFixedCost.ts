import useConfig from '~/server/config';
import type { FixedCostKey } from '~/server/utils/api/cost/CostTypes';

export default function getFixedCost(key: FixedCostKey) {
    const config = useConfig();
    return config.cost.fixed[key];
}
