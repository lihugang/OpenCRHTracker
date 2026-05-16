const OFFICIAL_HOSTNAME_BYTES = [
    new Uint8Array([
        99, 114, 104, 46, 108, 105, 104, 117, 103, 97, 110, 103, 46, 116, 111,
        112
    ]),
    new Uint8Array([99, 114, 104, 100, 97, 116, 97, 46, 116, 111, 112])
];

const OFFICIAL_HOSTNAMES = OFFICIAL_HOSTNAME_BYTES.map((bytes) =>
    new TextDecoder().decode(bytes).toLowerCase()
);
const OFFICIAL_HOSTNAME = OFFICIAL_HOSTNAMES[0]!;

function isOfficialHostname(currentHostname: string) {
    return OFFICIAL_HOSTNAMES.some(
        (officialHostname) =>
            currentHostname === officialHostname ||
            currentHostname.endsWith(`.${officialHostname}`)
    );
}

export default function useOfficialInstance() {
    const requestUrl = useRequestURL();
    const currentHostname = (requestUrl.hostname || '').toLowerCase();
    const isDevelopment = import.meta.dev;
    const isOfficialInstance =
        isDevelopment || isOfficialHostname(currentHostname);

    return {
        currentHostname,
        officialHostname: OFFICIAL_HOSTNAME,
        officialOrigin: `https://${OFFICIAL_HOSTNAME}`,
        isDevelopment,
        isOfficialInstance,
        shouldShowUnofficialWarning: !isOfficialInstance
    };
}
