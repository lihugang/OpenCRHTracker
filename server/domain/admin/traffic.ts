import { getAdminTrafficSnapshot } from '~/server/services/adminTrafficStore';

export function getAdminTraffic() {
    return getAdminTrafficSnapshot();
}
