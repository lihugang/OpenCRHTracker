import tailwindcss from '@tailwindcss/vite';
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2025-05-15',
    devtools: { enabled: false },
    app: {
        head: {
            htmlAttrs: {
                lang: 'zh-CN'
            },
            link: [
                {
                    rel: 'apple-touch-icon',
                    href: '/icons/apple-touch-icon-180x180.png'
                }
            ],
            meta: [
                {
                    name: 'viewport',
                    content:
                        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
                },
                {
                    name: 'apple-mobile-web-app-capable',
                    content: 'yes'
                },
                {
                    name: 'apple-mobile-web-app-status-bar-style',
                    content: 'black-translucent'
                },
                {
                    name: 'theme-color',
                    content: '#fff8e1'
                }
            ]
        },
        layoutTransition: {
            name: 'layout',
            mode: 'out-in'
        }
    },
    runtimeConfig: {
        public: {
            siteUrl: process.env.NUXT_PUBLIC_SITE_URL || ''
        }
    },
    nitro: {
        esbuild: {
            options: {
                target: 'esnext'
            }
        }
    },
    vite: {
        server: {
            watch: {
                ignored: ['**/db/**']
            }
        },
        plugins: [tailwindcss() as any]
    },
    css: ['~/assets/css/tailwind.css'],
    modules: ['nuxt-security', '@vite-pwa/nuxt'],

    security: {
        headers: {
            contentSecurityPolicy: {
                'default-src': ["'self'"],
                'script-src': [
                    "'self'",
                    "'unsafe-inline'",
                    "'strict-dynamic'",
                    "'nonce-{{nonce}}'",
                    "'unsafe-eval'"
                ],
                'style-src': ["'self'", "'unsafe-inline'"],
                'img-src': ["'self'", 'data:'],
                'font-src': ["'self'"],
                'connect-src': ["'self'"],
                'object-src': ["'none'"],
                'frame-ancestors': ["'none'"],
                'worker-src': ["'self'", 'blob:']
            },
            xFrameOptions: 'DENY',
            xContentTypeOptions: 'nosniff',
            referrerPolicy: 'strict-origin-when-cross-origin',
            strictTransportSecurity: false
        },
        corsHandler: false,
        csrf: true,
        requestSizeLimiter: {
            maxRequestSizeInBytes: 1024 * 1024, // 1M
            maxUploadFileRequestInBytes: 1024 * 1024 // 1M
        },
        rateLimiter: false
    },

    pwa: {
        registerType: 'autoUpdate',
        manifest: {
            name: 'Open China Railway HighSpeed Train Tracker',
            short_name: 'Open CRH Tracker',
            description: '查询中国动车组担当及交路信息',
            lang: 'zh-CN',
            icons: [
                {
                    src: '/icons/icon-72x72.png',
                    sizes: '72x72',
                    type: 'image/png'
                },
                {
                    src: '/icons/icon-96x96.png',
                    sizes: '96x96',
                    type: 'image/png'
                },
                {
                    src: '/icons/icon-128x128.png',
                    sizes: '128x128',
                    type: 'image/png'
                },
                {
                    src: '/icons/icon-144x144.png',
                    sizes: '144x144',
                    type: 'image/png'
                },
                {
                    src: '/icons/icon-152x152.png',
                    sizes: '152x152',
                    type: 'image/png'
                },
                {
                    src: '/icons/icon-180x180-maskable.png',
                    sizes: '180x180',
                    type: 'image/png',
                    purpose: 'maskable'
                },
                {
                    src: '/icons/icon-192x192.png',
                    sizes: '192x192',
                    type: 'image/png'
                },
                {
                    src: '/icons/icon-384x384.png',
                    sizes: '384x384',
                    type: 'image/png'
                },
                {
                    src: '/icons/icon-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any'
                },
                {
                    src: '/icons/icon-512x512-maskable.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable'
                },
                {
                    src: '/icons/icon-1600x1600.png',
                    sizes: '1600x1600',
                    type: 'image/png'
                }
            ],
            start_url: '/',
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: '#fff8e1'
        },
        workbox: {
            globPatterns: ['**/*.{js,css,png,svg,ico,html}'],
            navigateFallback: '/',
            runtimeCaching: [
                {
                    urlPattern: ({ request }) => request.mode === 'navigate',
                    handler: 'NetworkFirst',
                    options: {
                        cacheName: 'pages-cache',
                        networkTimeoutSeconds: 5,
                        expiration: {
                            maxEntries: 20,
                            maxAgeSeconds: 60 * 60 * 24 * 7
                        }
                    }
                },
                {
                    urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
                    handler: 'NetworkFirst',
                    options: {
                        cacheName: 'api-cache',
                        expiration: {
                            maxEntries: 1000,
                            maxAgeSeconds: 60 * 60 * 24 * 3
                        },
                        cacheableResponse: {
                            statuses: [0, 299]
                        },
                        networkTimeoutSeconds: 30
                    }
                },
                {
                    urlPattern: ({ request }) =>
                        request.destination === 'image',
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'image-cache',
                        expiration: {
                            maxEntries: 1000,
                            maxAgeSeconds: 60 * 60 * 24 * 7
                        }
                    }
                }
            ]
        },
        devOptions: {
            enabled: true,
            type: 'module'
        },
        strategies: 'injectManifest',
        srcDir: 'service-worker',
        filename: 'sw.ts'
    }
});
