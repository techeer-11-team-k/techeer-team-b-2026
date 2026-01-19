// ===================================
// 전역 변수
// ===================================
let isRunning = false;
let totalDeployments = 0;
let successfulDeployments = 0;

// ===================================
// DOM 요소 참조
// ===================================
const startButton = document.getElementById('start-pipeline');
const resetButton = document.getElementById('reset-pipeline');
const clearLogsButton = document.getElementById('clear-logs');
const consoleOutput = document.getElementById('console-output');
const branchSelect = document.getElementById('branch-select');

const frontendCheck = document.getElementById('frontend-check');
const backendCheck = document.getElementById('backend-check');
const mobileCheck = document.getElementById('mobile-check');

// 스테이지 요소
const stages = {
    commit: {
        stage: document.getElementById('stage-commit'),
        status: document.getElementById('status-commit'),
        details: document.getElementById('details-commit')
    },
    trigger: {
        stage: document.getElementById('stage-trigger'),
        status: document.getElementById('status-trigger'),
        details: document.getElementById('details-trigger')
    },
    ci: {
        stage: document.getElementById('stage-ci'),
        status: document.getElementById('status-ci'),
        details: document.getElementById('details-ci')
    },
    cd: {
        stage: document.getElementById('stage-cd'),
        status: document.getElementById('status-cd'),
        details: document.getElementById('details-cd')
    },
    notify: {
        stage: document.getElementById('stage-notify'),
        status: document.getElementById('status-notify'),
        details: document.getElementById('details-notify')
    }
};

// 통계 요소
const statsElements = {
    totalDeployments: document.getElementById('total-deployments'),
    successRate: document.getElementById('success-rate'),
    avgTime: document.getElementById('avg-time'),
    lastDeploy: document.getElementById('last-deploy')
};

// ===================================
// 유틸리티 함수
// ===================================
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ko-KR');
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = `[${timestamp}] ${message}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function updateStageStatus(stageName, status, details = null) {
    const stage = stages[stageName];
    stage.status.textContent = status;
    stage.status.className = `stage-status ${status.toLowerCase()}`;
    stage.stage.className = `pipeline-stage ${status.toLowerCase()}`;
    
    if (details) {
        stage.details.innerHTML = details;
        stage.details.classList.add('active');
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateStats() {
    statsElements.totalDeployments.textContent = totalDeployments;
    const rate = totalDeployments > 0 
        ? Math.round((successfulDeployments / totalDeployments) * 100)
        : 100;
    statsElements.successRate.textContent = `${rate}%`;
    statsElements.lastDeploy.textContent = new Date().toLocaleTimeString('ko-KR');
}

// ===================================
// 파이프라인 단계별 실행
// ===================================
async function runStage1Commit() {
    log('🚀 파이프라인 시작', 'info');
    updateStageStatus('commit', 'Running');
    log('💻 로컬에서 코드 작성 완료');
    await delay(1000);
    
    const branch = branchSelect.value;
    const branchName = branch === 'feature' ? 'feature/new-feature' 
                     : branch === 'dev' ? 'dev'
                     : 'main';
    
    log(`📝 Git 커밋 생성: "feat: 새 기능 추가"`);
    await delay(800);
    log(`📤 ${branchName} 브랜치에 푸시 중...`);
    await delay(1200);
    log(`✅ Git 푸시 완료`, 'success');
    
    updateStageStatus('commit', 'Success', `
        <ul>
            <li>✅ 브랜치: ${branchName}</li>
            <li>✅ 커밋: feat: 새 기능 추가</li>
            <li>✅ 푸시 완료</li>
        </ul>
    `);
}

async function runStage2Trigger() {
    await delay(500);
    updateStageStatus('trigger', 'Running');
    log('⚡ GitHub Actions 워크플로우 감지');
    await delay(1000);
    
    const components = [];
    if (frontendCheck.checked) components.push('Frontend');
    if (backendCheck.checked) components.push('Backend');
    if (mobileCheck.checked) components.push('Mobile');
    
    log(`📋 변경 감지: ${components.join(', ')}`);
    await delay(800);
    log('🔧 워크플로우 파일 로드');
    await delay(700);
    log('🚀 CI/CD 파이프라인 시작', 'success');
    
    updateStageStatus('trigger', 'Success', `
        <ul>
            <li>✅ GitHub Actions 트리거됨</li>
            <li>✅ 변경 감지: ${components.join(', ')}</li>
            <li>✅ 워크플로우 실행 준비 완료</li>
        </ul>
    `);
}

async function runStage3CI() {
    await delay(500);
    updateStageStatus('ci', 'Running');
    log('🧪 CI (Continuous Integration) 단계 시작');
    
    const detailsHTML = ['<ul>'];
    
    // 프론트엔드 CI
    if (frontendCheck.checked) {
        log('⚛️ 프론트엔드 CI 시작');
        await delay(1000);
        log('  ├─ ESLint 검사 실행 중...');
        await delay(1500);
        log('  ├─ ✅ ESLint: 0 errors, 0 warnings', 'success');
        await delay(800);
        log('  ├─ TypeScript 타입 체크...');
        await delay(1200);
        log('  ├─ ✅ TypeScript: 타입 검사 통과', 'success');
        await delay(800);
        log('  ├─ npm run build 실행...');
        await delay(2000);
        log('  └─ ✅ 빌드 성공 (3.2s)', 'success');
        detailsHTML.push('<li>✅ 프론트엔드: 린트, 타입 체크, 빌드 통과</li>');
    }
    
    // 백엔드 CI
    if (backendCheck.checked) {
        log('🐍 백엔드 CI 시작');
        await delay(1000);
        log('  ├─ Flake8 린트 검사...');
        await delay(1200);
        log('  ├─ ✅ Flake8: 0 violations', 'success');
        await delay(800);
        log('  ├─ Pytest 단위 테스트...');
        await delay(2500);
        log('  ├─ ✅ 15 passed, 0 failed', 'success');
        await delay(800);
        log('  ├─ Docker 이미지 빌드...');
        await delay(2000);
        log('  └─ ✅ Docker 빌드 성공', 'success');
        detailsHTML.push('<li>✅ 백엔드: 린트, 테스트, Docker 빌드 통과</li>');
    }
    
    // 모바일 CI
    if (mobileCheck.checked) {
        log('📱 모바일 CI 시작');
        await delay(1000);
        log('  ├─ TypeScript 타입 체크...');
        await delay(1500);
        log('  ├─ ✅ 타입 체크 통과', 'success');
        await delay(800);
        log('  └─ ✅ 모바일 CI 완료', 'success');
        detailsHTML.push('<li>✅ 모바일: 타입 체크 통과</li>');
    }
    
    detailsHTML.push('</ul>');
    log('✅ 모든 CI 체크 통과', 'success');
    updateStageStatus('ci', 'Success', detailsHTML.join(''));
}

async function runStage4CD() {
    const branch = branchSelect.value;
    
    // feature 브랜치는 배포 안 함
    if (branch === 'feature') {
        log('ℹ️ feature 브랜치는 자동 배포하지 않습니다', 'info');
        updateStageStatus('cd', 'Success', `
            <ul>
                <li>ℹ️ CI 체크만 수행됨</li>
                <li>ℹ️ 배포는 dev/main 브랜치에만 실행</li>
            </ul>
        `);
        return;
    }
    
    await delay(500);
    updateStageStatus('cd', 'Running');
    log('🚀 CD (Continuous Deployment) 단계 시작');
    
    const detailsHTML = ['<ul>'];
    const envName = branch === 'dev' ? 'Staging' : 'Production';
    
    // 프론트엔드 배포
    if (frontendCheck.checked) {
        log(`⚛️ 프론트엔드 ${envName} 배포 시작`);
        await delay(1000);
        log('  ├─ Vercel에 연결 중...');
        await delay(1500);
        log('  ├─ 빌드 결과 업로드...');
        await delay(2000);
        log(`  ├─ ✅ Vercel ${envName} 배포 완료`, 'success');
        await delay(500);
        const url = branch === 'dev' 
            ? 'https://your-project-dev.vercel.app'
            : 'https://your-project.vercel.app';
        log(`  └─ 🌐 URL: ${url}`, 'success');
        detailsHTML.push(`<li>✅ 프론트엔드 → Vercel ${envName}</li>`);
    }
    
    // 백엔드 배포
    if (backendCheck.checked) {
        log(`🐍 백엔드 ${envName} 배포 시작`);
        await delay(1000);
        log('  ├─ AWS ECR에 Docker 이미지 푸시...');
        await delay(2500);
        log('  ├─ ✅ 이미지 푸시 완료', 'success');
        await delay(1000);
        log('  ├─ ECS 서비스 업데이트 중...');
        await delay(3000);
        log('  ├─ ✅ ECS 서비스 업데이트 완료', 'success');
        await delay(500);
        log('  └─ 🏥 헬스 체크 통과', 'success');
        detailsHTML.push(`<li>✅ 백엔드 → AWS ECS ${envName}</li>`);
    }
    
    // 모바일 배포 (태그가 있을 때만)
    if (mobileCheck.checked && branch === 'main') {
        log('📱 모바일 앱 빌드는 태그 생성 시 실행됩니다', 'info');
        detailsHTML.push('<li>ℹ️ 모바일: 태그 생성 시 EAS Build 실행</li>');
    }
    
    detailsHTML.push('</ul>');
    log(`✅ ${envName} 배포 완료`, 'success');
    updateStageStatus('cd', 'Success', detailsHTML.join(''));
}

async function runStage5Notify() {
    await delay(500);
    updateStageStatus('notify', 'Running');
    log('📢 배포 알림 발송 중...');
    await delay(1000);
    
    const branch = branchSelect.value;
    const envName = branch === 'dev' ? 'Staging' : 'Production';
    
    log('📧 Slack 알림 발송...');
    await delay(800);
    log(`✅ Slack: "${envName} 배포 완료" 메시지 전송됨`, 'success');
    await delay(500);
    log('📊 GitHub PR에 상태 업데이트...');
    await delay(700);
    log('✅ GitHub: 모든 체크 통과 표시', 'success');
    await delay(500);
    log('🎉 파이프라인 실행 완료!', 'success');
    
    updateStageStatus('notify', 'Success', `
        <ul>
            <li>✅ Slack 알림 발송 완료</li>
            <li>✅ GitHub PR 상태 업데이트</li>
            <li>✅ 배포 로그 저장</li>
        </ul>
    `);
    
    // 통계 업데이트
    totalDeployments++;
    successfulDeployments++;
    updateStats();
}

// ===================================
// 메인 파이프라인 실행
// ===================================
async function runPipeline() {
    if (isRunning) return;
    
    // 선택된 컴포넌트 확인
    if (!frontendCheck.checked && !backendCheck.checked && !mobileCheck.checked) {
        alert('최소 하나의 컴포넌트를 선택해주세요!');
        return;
    }
    
    isRunning = true;
    startButton.disabled = true;
    startButton.textContent = '⏳ 실행 중...';
    
    try {
        // 모든 스테이지 초기화
        Object.values(stages).forEach(stage => {
            stage.status.textContent = '대기 중';
            stage.status.className = 'stage-status';
            stage.stage.className = 'pipeline-stage';
            stage.details.classList.remove('active');
        });
        
        // 파이프라인 실행
        await runStage1Commit();
        await runStage2Trigger();
        await runStage3CI();
        await runStage4CD();
        await runStage5Notify();
        
        log('🎊 전체 파이프라인 성공적으로 완료!', 'success');
    } catch (error) {
        log(`❌ 오류 발생: ${error.message}`, 'error');
        totalDeployments++;
        updateStats();
    } finally {
        isRunning = false;
        startButton.disabled = false;
        startButton.textContent = '🚀 파이프라인 시작';
    }
}

// ===================================
// 리셋 기능
// ===================================
function resetPipeline() {
    if (isRunning) {
        alert('파이프라인이 실행 중입니다!');
        return;
    }
    
    // 모든 스테이지 초기화
    Object.values(stages).forEach(stage => {
        stage.status.textContent = '대기 중';
        stage.status.className = 'stage-status';
        stage.stage.className = 'pipeline-stage';
        stage.details.classList.remove('active');
        stage.details.innerHTML = '';
    });
    
    // 로그 초기화
    consoleOutput.innerHTML = '<div class="console-line">$ 파이프라인 시작 대기 중...</div>';
    
    log('🔄 파이프라인 초기화 완료', 'info');
}

// ===================================
// 로그 지우기
// ===================================
function clearLogs() {
    consoleOutput.innerHTML = '<div class="console-line">$ 로그가 지워졌습니다...</div>';
    log('🗑️ 로그 초기화', 'info');
}

// ===================================
// 이벤트 리스너
// ===================================
startButton.addEventListener('click', runPipeline);
resetButton.addEventListener('click', resetPipeline);
clearLogsButton.addEventListener('click', clearLogs);

// ===================================
// 초기화
// ===================================
window.addEventListener('DOMContentLoaded', () => {
    log('👋 HOMU CI/CD 파이프라인 시뮬레이터에 오신 것을 환영합니다!', 'info');
    log('✨ 컴포넌트를 선택하고 "파이프라인 시작" 버튼을 클릭하세요', 'info');
    updateStats();
});

// ===================================
// 키보드 단축키
// ===================================
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter: 파이프라인 시작
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runPipeline();
    }
    // Ctrl/Cmd + R: 리셋
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        resetPipeline();
    }
});
