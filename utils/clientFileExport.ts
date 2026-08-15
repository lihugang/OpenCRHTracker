export type ClientFileExportResult = 'shared' | 'downloaded' | 'cancelled';

export interface ClientFileExportOptions {
    blob: Blob;
    fileName: string;
    mimeType?: string;
    shareTitle?: string;
}

function isMobileDownloadContext() {
    if (!import.meta.client) {
        return false;
    }

    if (window.matchMedia('(max-width: 767px)').matches) {
        return true;
    }

    if (window.matchMedia('(pointer: coarse)').matches) {
        return true;
    }

    const viewportWidth = Math.max(window.innerWidth || 0, screen.width || 0);
    if (
        navigator.maxTouchPoints > 0 &&
        viewportWidth > 0 &&
        viewportWidth <= 1024
    ) {
        return true;
    }

    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isUserCancelledShare(error: unknown) {
    return (
        error instanceof DOMException &&
        (error.name === 'AbortError' || error.name === 'NotAllowedError')
    );
}

async function triggerBrowserDownloadFromBlob(blob: Blob, fileName: string) {
    const objectUrl = URL.createObjectURL(blob);

    try {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        window.setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
        }, 1000);
    }
}

export async function exportBlobFile(
    options: ClientFileExportOptions
): Promise<ClientFileExportResult> {
    const { blob, fileName, mimeType, shareTitle } = options;

    if (
        isMobileDownloadContext() &&
        typeof navigator.share === 'function' &&
        typeof File !== 'undefined'
    ) {
        const file = new File([blob], fileName, {
            type: mimeType || blob.type || 'application/octet-stream'
        });
        const sharePayload: ShareData = {
            files: [file],
            title: shareTitle || fileName
        };

        try {
            if (
                typeof navigator.canShare !== 'function' ||
                navigator.canShare(sharePayload)
            ) {
                await navigator.share(sharePayload);
                return 'shared';
            }
        } catch (error) {
            if (isUserCancelledShare(error)) {
                return 'cancelled';
            }
        }
    }

    await triggerBrowserDownloadFromBlob(blob, fileName);
    return 'downloaded';
}
