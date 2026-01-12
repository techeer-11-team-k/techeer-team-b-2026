// 사용자가 제공한 간단한 버전의 WebView 컴포넌트
import React from 'react';
import { WebView } from 'react-native-webview';

const WebviewContainer = () => {
  const uri = __DEV__ 
    ? 'http://localhost:5173'  // 개발 환경
    : 'https://your-production-url.com';  // 프로덕션 환경

  return (
    <WebView
      source={{ uri }}
    />
  );
};

export default WebviewContainer;
