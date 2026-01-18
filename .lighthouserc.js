/**
 * Lighthouse CI 설정
 * 
 * 성능 측정 자동화를 위한 설정 파일
 */
module.exports = {
  ci: {
    collect: {
      // 테스트할 URL
      url: ['http://localhost:3000'],
      // 각 URL당 실행 횟수 (평균값 사용)
      numberOfRuns: 3,
      // 설정
      settings: {
        // 모바일 시뮬레이션
        preset: 'desktop',
        // 네트워크 속도
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
      },
    },
    assert: {
      // 성능 기준 설정
      assertions: {
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
        
        // 핵심 웹 바이탈
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        
        // 리소스 크기
        'total-byte-weight': ['warn', { maxNumericValue: 3000000 }], // 3MB
        'dom-size': ['warn', { maxNumericValue: 1500 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
