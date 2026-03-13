import { ref } from 'vue';

function getCurrentUnixSeconds() {
    return Math.floor(Date.now() / 1000);
}

export default function useCurrentUnixSeconds() {
    return ref(getCurrentUnixSeconds());
}
