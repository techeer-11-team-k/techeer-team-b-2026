
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import path from 'path';

  export default defineConfig({
    plugins: [react()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        'vaul@1.1.2': 'vaul',
        'sonner@2.0.3': 'sonner',
        'recharts@2.15.2': 'recharts',
        'react-resizable-panels@2.1.7': 'react-resizable-panels',
        'react-hook-form@7.55.0': 'react-hook-form',
        'react-day-picker@8.10.1': 'react-day-picker',
        'next-themes@0.4.6': 'next-themes',
        'lucide-react@0.487.0': 'lucide-react',
        'input-otp@1.4.2': 'input-otp',
        'figma:asset/f50330cf8eedd4191cc6fb784733e002b991b7cb.png': path.resolve(__dirname, './src/assets/f50330cf8eedd4191cc6fb784733e002b991b7cb.png'),
        'embla-carousel-react@8.6.0': 'embla-carousel-react',
        'cmdk@1.1.1': 'cmdk',
        'class-variance-authority@0.7.1': 'class-variance-authority',
        '@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip',
        '@radix-ui/react-toggle@1.1.2': '@radix-ui/react-toggle',
        '@radix-ui/react-toggle-group@1.1.2': '@radix-ui/react-toggle-group',
        '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
        '@radix-ui/react-switch@1.1.3': '@radix-ui/react-switch',
        '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
        '@radix-ui/react-slider@1.2.3': '@radix-ui/react-slider',
        '@radix-ui/react-separator@1.1.2': '@radix-ui/react-separator',
        '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
        '@radix-ui/react-scroll-area@1.2.3': '@radix-ui/react-scroll-area',
        '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
        '@radix-ui/react-progress@1.1.2': '@radix-ui/react-progress',
        '@radix-ui/react-popover@1.1.6': '@radix-ui/react-popover',
        '@radix-ui/react-navigation-menu@1.2.5': '@radix-ui/react-navigation-menu',
        '@radix-ui/react-menubar@1.1.6': '@radix-ui/react-menubar',
        '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
        '@radix-ui/react-hover-card@1.1.6': '@radix-ui/react-hover-card',
        '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
        '@radix-ui/react-context-menu@2.2.6': '@radix-ui/react-context-menu',
        '@radix-ui/react-collapsible@1.1.3': '@radix-ui/react-collapsible',
        '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
        '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
        '@radix-ui/react-aspect-ratio@1.1.2': '@radix-ui/react-aspect-ratio',
        '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
        '@radix-ui/react-accordion@1.2.3': '@radix-ui/react-accordion',
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'build',
      // 청크 최적화
      rollupOptions: {
        output: {
          manualChunks: {
            // React 관련
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            // Clerk 인증
            'auth': ['@clerk/clerk-react'],
            // UI 라이브러리
            'ui': ['lucide-react', 'framer-motion'],
            // 차트 라이브러리 (큰 번들)
            'charts': ['recharts', 'highcharts'],
            // 유틸리티
            'utils': ['axios', 'date-fns'],
          },
        },
      },
      // 청크 사이즈 경고 임계값 늘리기
      chunkSizeWarningLimit: 1000,
      // 소스맵 비활성화 (프로덕션 빌드 속도 향상)
      sourcemap: false,
      // minify 최적화
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true, // console.log 제거
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0', // 모든 네트워크 인터페이스에서 접근 허용 (모바일 앱 접근용)
      open: true,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'rivermoon.p-e.kr',
        '.rivermoon.p-e.kr', // 서브도메인 포함
      ],
      watch: {
        // 파일 감시 최적화: 불필요한 파일/폴더 제외
        // chokidar 패턴 사용 (glob 패턴)
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.env*',
          '**/package-lock.json',
          '**/yarn.lock',
          '**/pnpm-lock.yaml',
          '**/coverage/**',
          '**/.vscode/**',
          '**/.idea/**',
          '**/backup/**',
          '**/*.md',
          '**/Attributions.md',
          '**/DEPLOYMENT_GUIDE.md',
          '**/README.md',
          '**/guidelines/**',
        ],
        // 폴링 모드 사용 (파일 디스크립터 문제 해결)
        // usePolling: true는 더 많은 CPU를 사용하지만 파일 디스크립터 제한 문제를 피할 수 있음
        usePolling: true,
        // 감시 간격 (밀리초) - 폴링 모드에서만 사용
        interval: 1000,
        // 바이너리 파일 제외
        binaryInterval: 3000,
      },
    },
    // 최적화 설정
    optimizeDeps: {
      // 사전 번들링할 의존성
      include: [
        'react',
        'react-dom',
        '@clerk/clerk-react',
        'axios',
        'highcharts',
        'highcharts/highcharts-more',
        'd3',
      ],
      // 제외할 의존성
      exclude: [],
    },
  });