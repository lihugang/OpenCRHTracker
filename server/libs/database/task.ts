import useDatabase from '~/server/libs/database/common';

export function useTaskDatabase() {
    return useDatabase('task');
}
