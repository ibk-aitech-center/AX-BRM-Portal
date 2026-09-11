import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SSO연동가이드 §9 — 로컬 목업 팝업(popup.html)은 유효한 토큰을 담고 있으므로
 * 운영 산출물(dist)에 절대 포함되면 안 된다. 빌드 종료 시 자동 삭제한다.
 * "사람이 지우기로 한 규칙은 언젠가 잊힌다."
 */
function stripDevOnlyAssets(): Plugin {
  return {
    name: 'strip-dev-only-assets',
    apply: 'build',
    closeBundle() {
      const target = path.resolve('dist', 'popup.html');
      if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
        console.log('[strip-dev-only-assets] removed dist/popup.html');
      }
    },
  };
}

export default defineConfig({
  plugins: [vue(), stripDevOnlyAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        flow: fileURLToPath(new URL('./flow.html', import.meta.url)), // 상담 흐름도 (질문·판정 데이터에서 자동 생성)
      },
    },
  },
});
