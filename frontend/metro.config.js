const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// NativeWind v2는 별도 설정이 필요할 수 있습니다
// 일단 기본 설정으로 진행
module.exports = config;
