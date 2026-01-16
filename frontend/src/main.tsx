import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ClerkAuthProvider } from "./lib/clerk";
import { ErrorBoundary } from "./components/ErrorBoundary";

// root 요소 확인
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

try {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <ClerkAuthProvider>
        <App />
      </ClerkAuthProvider>
    </ErrorBoundary>
  );
} catch (error) {
  console.error("❌ 앱 렌더링 실패:", error);
  rootElement.innerHTML = `
    <div style="padding: 20px; font-family: sans-serif;">
      <h1 style="color: red;">앱 로딩 실패</h1>
      <p>오류: ${error instanceof Error ? error.message : String(error)}</p>
      <p>브라우저 콘솔을 확인해주세요.</p>
    </div>
  `;
}