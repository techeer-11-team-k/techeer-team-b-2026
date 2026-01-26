import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, StatusBar, Platform, ActivityIndicator, Text, AppState } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

// 개발/프로덕션 모두 Vercel URL 사용 (가이드 Step 7)
const WEB_APP_URL = 'https://techeer-team-b-2026.vercel.app';

const WebviewContainer = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const webViewRef = useRef<WebView>(null);

  // 로딩 타임아웃 설정 (30초 후 자동 해제)
  const setLoadingWithTimeout = (isLoading: boolean) => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    setLoading(isLoading);

    if (isLoading) {
      // 30초 후에도 로딩이 끝나지 않으면 강제로 해제
      loadingTimeoutRef.current = setTimeout(() => {
        console.warn('⚠️ 로딩 타임아웃 - 로딩 상태를 강제로 해제합니다');
        setLoading(false);
      }, 30000);
    }
  };

  // 앱 상태 변경 감지 (탭 전환 시)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // 앱이 다시 활성화되면 로딩 상태 확인
        console.log('📱 앱이 다시 활성화됨');
        // WebView가 이미 로드되어 있다면 로딩 상태 해제
        if (webViewRef.current) {
          // 약간의 지연 후 로딩 상태 해제 (WebView가 준비될 시간 제공)
          setTimeout(() => {
            setLoading(false);
          }, 1000);
        }
      }
    });

    return () => {
      subscription.remove();
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  const handleLoadStart = () => {
    console.log('🔄 WebView 로딩 시작');
    console.log('📍 URL:', WEB_APP_URL);
    console.log('📱 Platform:', Platform.OS);
    console.log('🔧 __DEV__:', __DEV__);
    setLoadingWithTimeout(true);
    setError(null);
  };

  const handleLoadEnd = () => {
    console.log('✅ WebView 로딩 완료');
    setLoadingWithTimeout(false);
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('❌ WebView error: ', nativeEvent);
    console.warn('❌ WebView URL: ', WEB_APP_URL);
    console.warn('❌ Platform: ', Platform.OS);
    setError(`페이지를 불러오는 중 오류가 발생했습니다.\nURL: ${WEB_APP_URL}\n오류: ${nativeEvent.description || nativeEvent.message || '알 수 없는 오류'}`);
    setLoadingWithTimeout(false);
  };

  return (
    <View style={styles.container}>
      <ExpoStatusBar style="auto" />
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_APP_URL }}
        style={styles.webview}
        // 웹뷰 설정 옵션들
        allowsBackForwardNavigationGestures={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        // 쿠키 및 세션 관리 (Clerk 인증에 필수)
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        // Clerk 도메인 허용 (인증 모달/팝업용)
        originWhitelist={['*']}
        // iOS에서 스크롤 바 표시
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
        // 안전 영역 처리
        contentInsetAdjustmentBehavior="automatic"
        // Android에서 파일 업로드 허용
        allowFileAccess={true}
        // Android에서 보안 설정
        mixedContentMode="always"
        // Android에서 쿠키 관리자 설정
        {...(Platform.OS === 'android' && {
          androidLayerType: 'hardware',
        })}
        // 이벤트 핸들러
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        // 네트워크 오류 처리
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('❌ HTTP 오류:', nativeEvent.statusCode, WEB_APP_URL);
          if (nativeEvent.statusCode >= 400) {
            setError(`HTTP 오류: ${nativeEvent.statusCode}\nURL: ${WEB_APP_URL}`);
            setLoadingWithTimeout(false);
          }
        }}
        // JavaScript 콘솔 로그 캡처 및 Clerk 디버깅
        onMessage={(event) => {
          const data = event.nativeEvent.data;
          console.log('📱 WebView 메시지:', data);
          
          // Clerk 관련 메시지 필터링
          if (data && typeof data === 'string' && (
            data.includes('Clerk') || 
            data.includes('clerk') || 
            data.includes('auth') ||
            data.includes('login') ||
            data.includes('sign')
          )) {
            console.log('🔐 Clerk 관련 메시지:', data);
          }
        }}
        // JavaScript 콘솔 로그를 네이티브로 전달
        injectedJavaScript={`
          (function() {
            const originalLog = console.log;
            const originalWarn = console.warn;
            const originalError = console.error;
            
            console.log = function(...args) {
              originalLog.apply(console, args);
              window.ReactNativeWebView.postMessage('LOG: ' + args.join(' '));
            };
            
            console.warn = function(...args) {
              originalWarn.apply(console, args);
              window.ReactNativeWebView.postMessage('WARN: ' + args.join(' '));
            };
            
            console.error = function(...args) {
              originalError.apply(console, args);
              window.ReactNativeWebView.postMessage('ERROR: ' + args.join(' '));
            };
            
            // Clerk 관련 이벤트 감지
            window.addEventListener('clerk:loaded', () => {
              window.ReactNativeWebView.postMessage('CLERK_LOADED');
            });
            
            // 페이지 로드 완료 시 Clerk 상태 확인
            window.addEventListener('load', () => {
              setTimeout(() => {
                if (window.Clerk) {
                  window.ReactNativeWebView.postMessage('CLERK_AVAILABLE');
                } else {
                  window.ReactNativeWebView.postMessage('CLERK_NOT_AVAILABLE');
                }
              }, 1000);
            });
          })();
          true;
        `}
        // 네비게이션 상태 변경 추적
        onNavigationStateChange={(navState) => {
          console.log('🧭 네비게이션 변경:', {
            url: navState.url,
            title: navState.title,
            loading: navState.loading,
            canGoBack: navState.canGoBack,
            canGoForward: navState.canGoForward,
          });
          
          // WebView의 로딩 상태와 동기화
          if (navState.loading) {
            setLoadingWithTimeout(true);
          } else {
            // 로딩이 완료되었지만 onLoadEnd가 호출되지 않을 수 있으므로
            // 약간의 지연 후 로딩 상태 해제
            setTimeout(() => {
              setLoadingWithTimeout(false);
            }, 500);
          }
          
          // Clerk 인증 페이지 감지
          if (navState.url && (
            navState.url.includes('clerk.com') ||
            navState.url.includes('clerk.accounts.dev') ||
            navState.url.includes('clerk.dev')
          )) {
            console.log('🔐 Clerk 인증 페이지 감지:', navState.url);
          }
        }}
        // 디버깅용 및 Clerk 인증 모달 허용
        onShouldStartLoadWithRequest={(request) => {
          console.log('🔗 WebView 요청:', request.url);
          // Clerk 도메인 및 인증 관련 URL 허용
          const allowedDomains = [
            'clerk.com',
            'clerk.accounts.dev',
            'clerk.dev',
            'localhost',
            '10.0.2.2',
          ];
          const url = request.url.toLowerCase();
          const isAllowed = allowedDomains.some(domain => url.includes(domain)) || url.startsWith(WEB_APP_URL.toLowerCase());
          
          if (!isAllowed) {
            console.warn('⚠️ 차단된 URL:', request.url);
          }
          
          return true; // 모든 요청 허용 (Clerk 인증 모달을 위해)
        }}
        // 새 창/팝업 허용 (Clerk 인증 모달용)
        setSupportMultipleWindows={false}
        // Android에서 JavaScript 인터페이스 활성화
        {...(Platform.OS === 'android' && {
          setBuiltInZoomControls: false,
          setDisplayZoomControls: false,
        })}
      />
      
      {/* 로딩 인디케이터 */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.loadingText}>로딩 중...</Text>
        </View>
      )}

      {/* 에러 메시지 */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorSubText}>네트워크 연결을 확인하거나 웹 앱이 실행 중인지 확인해주세요.</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#64748b',
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorSubText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
});

export default WebviewContainer;
