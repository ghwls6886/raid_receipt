import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';
import App from './App.tsx';
import { AppProvider } from '@/app/providers/AppProvider';

// 개발 환경일 때 페이지 타이틀에 [DEV] 추가
if (import.meta.env.DEV) {
  document.title = `[DEV] ${document.title}`;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root 엘리먼트를 찾을 수 없습니다.');

createRoot(rootEl).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
