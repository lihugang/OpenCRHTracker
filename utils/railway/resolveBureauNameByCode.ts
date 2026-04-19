const BUREAU_NAME_BY_CODE: Record<string, string> = {
    B: '哈尔滨局集团',
    C: '呼和浩特局集团',
    F: '郑州局集团',
    G: '南昌局集团',
    H: '上海局集团',
    J: '兰州局集团',
    K: '济南局集团',
    M: '昆明局集团',
    N: '武汉局集团',
    O: '青藏集团',
    P: '北京局集团',
    Q: '广州局集团',
    R: '乌鲁木齐局集团',
    T: '沈阳局集团',
    V: '太原局集团',
    W: '成都局集团',
    Y: '西安局集团',
    Z: '南宁局集团'
};

export default function resolveBureauNameByCode(code: string) {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length === 0) {
        return '';
    }

    return BUREAU_NAME_BY_CODE[normalizedCode] ?? '';
}
