import {
    getAdminConfigFiles as getAdminConfigFilesFromStore,
    getAdminConfigFileDocument,
    runAdminConfigFileAction,
    updateAdminConfigFileDocument
} from '~/server/services/adminConfigFileStore';
import type { AdminConfigFileActionRequest } from '~/types/admin';

export function getAdminConfigFiles() {
    return getAdminConfigFilesFromStore();
}

export function postAdminConfigFiles(
    input: AdminConfigFileActionRequest,
    actorUserId: string
) {
    return runAdminConfigFileAction(input, actorUserId);
}

export function getAdminConfigFile(target: string) {
    return getAdminConfigFileDocument(target);
}

export function putAdminConfigFile(
    target: string,
    input: { content: string; expectedRevision: string },
    actorUserId: string
) {
    return updateAdminConfigFileDocument(target, input, actorUserId);
}
