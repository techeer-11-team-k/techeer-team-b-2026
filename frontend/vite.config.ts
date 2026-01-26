import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        watch: {
          usePolling: true,
          interval: 1000,
        },
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icons/*.svg', 'icons/*.png'],
          // 개발 모드에서도 PWA 활성화
          devOptions: {
            enabled: true,
            type: 'module',
          },
          manifest: {
            name: '스위트홈 - 프리미엄 부동산 자산 관리',
            short_name: '스위트홈',
            description: '프리미엄 부동산 자산 관리',
            lang: 'ko',
            theme_color: '#3182F6',
            background_color: '#f8fafc',
            display: 'standalone',
            scope: '/',
            start_url: '/',
            orientation: 'portrait-primary',
            icons: [
              {
                src: '/icons/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/icons/icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/icons/icon-maskable-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable'
              },
              {
                src: '/icons/icon-maskable-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
              }
            ]
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB (기본값 2 MB에서 증가)
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/cdn\.(tailwindcss|jsdelivr)\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'cdn-cache',
                  expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: { statuses: [0, 200] }
                }
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
