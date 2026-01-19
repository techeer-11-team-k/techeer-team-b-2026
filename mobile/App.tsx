import React, { useState } from 'react';
import { StyleSheet, View, StatusBar, Platform, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

// 웹 앱 URL - 개발 환경에서는 localhost, 프로덕션에서는 실제 URL
// Docker로 실행 중인 프론트엔드는 포트 3000에서 실행됨
// 
// ⚠️ Android Studio 에뮬레이터: 10.0.2.2 사용 (호스트 머신의 localhost)
// ⚠️ 실제 기기: 컴퓨터의 로컬 IP 주소 사용 (예: 192.168.1.100)
// 
// 현재 확인된 IP: 192.168.45.162 (실제 기기 테스트 시 사용)
const LOCAL_IP = '192.168.45.162'; // 👈 실제 기기 테스트 시 여기를 컴퓨터의 로컬 IP로 변경

// 환경 변수로 IP 오버라이드 가능 (선택사항)
const OVERRIDE_IP = process.env.EXPO_PUBLIC_LOCAL_IP;

// 프로덕션 웹앱 URL - 환경 변수로 설정 가능
// EAS Build 시 환경 변수로 설정하거나, 여기에 직접 입력
const PRODUCTION_WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://your-production-url.com';

const getWebAppUrl = () => {
  // 프로덕션 환경에서는 환경 변수 또는 하드코딩된 URL 사용
  if (!__DEV__) {
    return PRODUCTION_WEB_APP_URL;
  }

  // 환경 변수로 IP가 설정되어 있으면 사용
  const ip = OVERRIDE_IP || LOCAL_IP;

  if (Platform.OS === 'android') {
    // Android Studio 에뮬레이터는 10.0.2.2를 통해 호스트 머신에 접근
    // 하지만 Expo Go는 실제 기기에서 실행되므로 로컬 IP를 사용해야 함
    // 에뮬레이터가 아닌 실제 기기에서는 로컬 IP 사용
    // Expo Go는 실제 기기에서만 실행되므로 로컬 IP 사용
    return `http://${ip}:3000`;
  }

  // iOS 시뮬레이터나 웹은 localhost 사용
  // 실제 기기는 로컬 IP 사용
  // 실제 기기에서 테스트할 때는 아래 주석을 해제하고 LOCAL_IP를 사용하세요
  // Expo Go로 실제 기기에서 테스트할 때는 로컬 IP를 사용해야 함
  if (Platform.OS === 'ios' && !Platform.isPad) {
    // 실제 iOS 기기인 경우 (시뮬레이터가 아닌 경우)
    // Expo Go는 실제 기기이므로 로컬 IP 사용
    return `http://${ip}:3000`;
  }
  
  return 'http://localhost:3000';
};

const WEB_APP_URL = getWebAppUrl();

const WebviewContainer = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleLoadStart = () => {
    console.log('🔄 WebView 로딩 시작');
    console.log('📍 URL:', WEB_APP_URL);
    console.log('📱 Platform:', Platform.OS);
    console.log('🔧 __DEV__:', __DEV__);
    setLoading(true);
    setError(null);
  };

  const handleLoadEnd = () => {
    console.log('✅ WebView 로딩 완료');
    setLoading(false);
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('❌ WebView error: ', nativeEvent);
    console.warn('❌ WebView URL: ', WEB_APP_URL);
    console.warn('❌ Platform: ', Platform.OS);
    setError(`페이지를 불러오는 중 오류가 발생했습니다.\nURL: ${WEB_APP_URL}\n오류: ${nativeEvent.description || nativeEvent.message || '알 수 없는 오류'}`);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <ExpoStatusBar style="auto" />
      <WebView
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
        allowsFileAccess={true}
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
            setLoading(false);
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
