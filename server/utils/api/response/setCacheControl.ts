import { setHeader, type H3Event } from 'h3';

export default function setCacheControl(event: H3Event, maxAgeSeconds: number) {
    setHeader(event, 'Cache-Control', `public, max-age=${maxAgeSeconds}`);
}
