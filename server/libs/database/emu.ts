import useDatabase from '~/server/libs/database/common';

export function useEmuDatabase() {
    return useDatabase('EMUTracked');
}
