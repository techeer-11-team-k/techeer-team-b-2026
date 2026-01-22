// 간단한 이미지 생성 스크립트
const fs = require('fs');
const path = require('path');

// assets 디렉토리 확인
const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 간단한 SVG를 PNG로 변환하는 대신, 
// Expo가 기본 이미지를 사용하도록 app.json 수정이 더 나을 수 있습니다.
// 하지만 일단 기본 아이콘을 생성하기 위해 간단한 SVG를 만들어봅시다.

console.log('Assets directory created:', assetsDir);
console.log('Note: You need to add actual image files:');
console.log('  - icon.png (1024x1024)');
console.log('  - splash.png (1242x2436)');
console.log('  - adaptive-icon.png (1024x1024)');
console.log('  - favicon.png (48x48)');
