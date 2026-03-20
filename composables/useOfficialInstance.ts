const OFFICIAL_HOSTNAME_BYTES = new Uint8Array([
    99, 114, 104, 46, 108, 105, 104, 117, 103, 97, 110, 103, 46, 116, 111,
    112
]);

const OFFICIAL_HOSTNAME = new TextDecoder()
    .decode(OFFICIAL_HOSTNAME_BYTES)
    .toLowerCase();

export default function useOfficialInstance() {
    const requestUrl = useRequestURL();
    const currentHostname = (requestUrl.hostname || '').toLowerCase();
    const isDevelopment = import.meta.dev;
    const isOfficialInstance =
        isDevelopment || currentHostname === OFFICIAL_HOSTNAME;

    return {
        currentHostname,
        officialHostname: OFFICIAL_HOSTNAME,
        officialOrigin: `https://${OFFICIAL_HOSTNAME}`,
        isDevelopment,
        isOfficialInstance,
        shouldShowUnofficialWarning: !isOfficialInstance
    };
}
