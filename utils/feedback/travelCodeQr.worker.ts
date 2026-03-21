import jsQR from 'jsqr';

interface DecodeRequestMessage {
    id: number;
    buffer: ArrayBuffer;
    width: number;
    height: number;
}

interface DecodeResponseMessage {
    id: number;
    rawValue: string;
    error?: string;
}

self.onmessage = (event: MessageEvent<DecodeRequestMessage>) => {
    const { id, buffer, width, height } = event.data;

    try {
        const result = jsQR(new Uint8ClampedArray(buffer), width, height);
        const message: DecodeResponseMessage = {
            id,
            rawValue: result?.data ?? ''
        };
        self.postMessage(message);
    } catch (error) {
        const message: DecodeResponseMessage = {
            id,
            rawValue: '',
            error: error instanceof Error ? error.message : 'decode_failed'
        };
        self.postMessage(message);
    }
};
