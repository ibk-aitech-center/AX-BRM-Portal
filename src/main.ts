// 폰트 — 전부 로컬 번들 (폐쇄망). Vite 가 woff2 를 dist/assets 로 복사한다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource-variable/noto-serif-kr';
import 'd2coding/d2coding-subset.css';
// CSS 4레이어 (DESIGN_GUIDELINES §15)
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/utilities.css';

import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { bootstrapSession } from './services/session';

bootstrapSession();
createApp(App).use(router).mount('#app');
