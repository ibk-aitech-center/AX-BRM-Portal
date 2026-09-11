/**
 * 상담 흐름도 (flow.html) 앱 엔트리 — 로직은 src/flow-core.js (standalone 내보내기와 공유)
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/utilities.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import 'd2coding/d2coding-subset.css';

import { mountFlow } from './flow-core.js';

mountFlow(document.getElementById('flow-app')!);
