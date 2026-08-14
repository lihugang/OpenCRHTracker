import {
    deleteAdminOfficialCirculation as deleteAdminOfficialCirculationFromStore,
    searchAdminOfficialCirculations
} from '~/server/services/adminOfficialCirculationStore';

export function getAdminOfficialCirculations(keyword: string) {
    return searchAdminOfficialCirculations(keyword);
}

export function deleteAdminOfficialCirculation(entryKey: string) {
    return deleteAdminOfficialCirculationFromStore(entryKey);
}
