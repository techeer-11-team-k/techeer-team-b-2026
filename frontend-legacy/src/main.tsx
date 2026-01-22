import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ClerkAuthProvider } from "./lib/clerk";
import { ErrorBoundary } from "./components/ErrorBoundary";

// 초기 로더 제거 함수
const removeInitialLoader = () => {
  const loader = document.getElementById("initial-loader");
  if (loader) {
    loader.style.opacity = "0";
    loader.style.transition = "opacity 0.2s ease-out";
    setTimeout(() => loader.remove(), 200);
  }
};

// root 요소 확인
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

try {
  const root = createRoot(rootElement);
  root.render(
    <ErrorBoundary>
      <ClerkAuthProvider>
        <App />
      </ClerkAuthProvider>
    </ErrorBoundary>
  );
  
  // React 앱이 마운트되면 초기 로더 제거
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      removeInitialLoader();
    });
  });
} catch (error) {
  console.error("❌ 앱 렌더링 실패:", error);
  removeInitialLoader();
  rootElement.innerHTML = `
    <div style="padding: 20px; font-family: sans-serif;">
      <h1 style="color: red;">앱 로딩 실패</h1>
      <p>오류: ${error instanceof Error ? error.message : String(error)}</p>
      <p>브라우저 콘솔을 확인해주세요.</p>
    </div>
  `;
}