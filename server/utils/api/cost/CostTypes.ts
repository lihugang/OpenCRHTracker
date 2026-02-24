import useConfig from '~/server/config';

export type FixedCostKey = keyof ReturnType<typeof useConfig>['cost']['fixed'];
export type PerRecordCostKey = keyof ReturnType<
    typeof useConfig
>['cost']['perRecord'];
