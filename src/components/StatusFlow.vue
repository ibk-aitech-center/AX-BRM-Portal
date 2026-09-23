<script setup lang="ts">
/**
 * 상태 구성 — 그래프는 100% 띠 **하나**뿐이다 (2026-09-08 재설계).
 *  이전엔 묶음 타일 + 띠 + 상태별 가로 막대까지 같은 숫자를 세 번 그렸다. 패널이 전체 폭을 쓰게 되자 빈 데가 커지고
 *  "무엇을 보라는 건지"가 흐려졌다. 지금은:
 *   · 띠: 요청 흐름 순서(신청 완료 → 검토 중 → 보완 요청 → 진행 확정 → 개발 중 → 완료)로 앞→뒤로 갈수록 짙어진다. 곁길(안내 종결·협의 종결)은 띠 끝.
 *         충분히 넓은 조각에는 건수를 안에 적는다.
 *   · 범례: 세 묶음(진행 중(보완 요청 포함) / 완료·종결 / 협의 종결) 열로 나눠, 묶음 합계와 그 안의 상태별 건수·비율을 한 표로 보여 준다.
 *         → 묶음 요약과 상태별 상세가 한 자리에 있고, 색 칩이 띠와 범례를 잇는다.
 */
import { computed } from 'vue';
import type { StatBucket } from '@/types';
const props = defineProps<{ items: StatBucket[] }>();

const ORDER = ['submitted', 'reviewing', 'hold', 'accepted', 'developing', 'done', 'guided', 'rejected']; // 프로세스 순서: 요청 → 검토 → (필요시) 보완 요청 → 확정 → 개발 중 → 완료 (2026-09-11)
const COLOR: Record<string, string> = {
  submitted: '#D2E7E5', reviewing: '#A9CFCC', accepted: '#7FB7B4', developing: '#4A8E90', done: '#17545A',
  hold: '#E4D3A8', guided: '#9AAAAD', rejected: '#6B7F84',
};
/** 짙은 조각은 흰 글씨, 옅은 조각은 잉크 글씨 */
const DARK = new Set(['developing', 'done', 'rejected']);
const GROUPS: { label: string; keys: string[]; hint: string }[] = [
  { label: '진행 중', keys: ['submitted', 'reviewing', 'hold', 'accepted', 'developing'], hint: '접수 뒤 아직 끝나지 않은 건 (보완 요청 포함)' },
  { label: '완료·종결', keys: ['done', 'guided'], hint: '오픈했거나 행내 도구 안내로 마친 건' },
  { label: '협의 종결', keys: ['rejected'], hint: '개발 없이 협의·안내로 마무리한 건' },
];

const byKey = computed(() => Object.fromEntries(props.items.map((b) => [b.key, b])) as Record<string, StatBucket>);
const sorted = computed(() => [...props.items].filter((b) => b.n > 0).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)));
const total = computed(() => props.items.reduce((s, b) => s + b.n, 0));
const pct = (n: number) => (total.value ? Math.round((n / total.value) * 1000) / 10 : 0);
const share = (n: number) => (total.value ? (n / total.value) * 100 : 0);
const groups = computed(() => GROUPS.map((g) => {
  const rows = g.keys.map((k) => byKey.value[k]).filter((b): b is StatBucket => !!b && b.n > 0);
  return { ...g, rows, n: rows.reduce((s, b) => s + b.n, 0) };
}));
const color = (k: string) => COLOR[k] ?? '#C9D6D6';
</script>

<template>
  <div class="sf">
    <p v-if="!total" class="text-muted text-sm">아직 데이터가 없어요</p>
    <template v-else>
      <!-- 그래프 1개: 100% 띠. 조각이 넓으면(≥7%) 건수를 안에 쓴다 -->
      <div class="sf-band" role="img" :aria-label="sorted.map((b) => `${b.label || b.key} ${b.n}건 (${pct(b.n)}%)`).join(', ')">
        <span v-for="(b, i) in sorted" :key="b.key" class="sf-seg" :class="{ dark: DARK.has(b.key) }" :style="{ '--w': share(b.n) + '%', '--c': color(b.key), '--i': i }" :title="`${b.label || b.key} · ${b.n}건 (${pct(b.n)}%)`">
          <span v-if="share(b.n) >= 7" class="sf-seg-n num">{{ b.n }}</span>
        </span>
      </div>

      <!-- 범례 = 묶음 요약 + 상태별 상세 (한 표) -->
      <div class="sf-legend">
        <section v-for="g in groups" :key="g.label" class="sf-grp" :aria-label="g.label">
          <header class="sf-grp-head">
            <span class="sf-grp-label">{{ g.label }}</span>
            <span class="sf-grp-n"><b class="num">{{ g.n }}</b><span class="text-muted">건</span> <small class="num text-muted">{{ pct(g.n) }}%</small></span>
          </header>
          <ul v-if="g.rows.length" class="sf-rows" role="list">
            <li v-for="b in g.rows" :key="b.key" class="sf-row">
              <i class="sf-chip" :style="{ background: color(b.key) }" aria-hidden="true"></i>
              <span class="sf-label truncate">{{ b.label || b.key }}</span>
              <b class="sf-n num">{{ b.n }}</b>
              <small class="sf-pct num text-muted">{{ pct(b.n) }}%</small>
            </li>
          </ul>
          <p v-else class="sf-empty text-muted">{{ g.hint }} — 없음</p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sf { display: flex; flex-direction: column; gap: 18px; }

.sf-band { display: flex; height: 30px; border-radius: 8px; overflow: hidden; background: var(--surface-2); gap: 2px; }
.sf-seg { flex: 0 0 var(--w); background: var(--c); min-width: 3px; display: flex; align-items: center; justify-content: center; transform-origin: 0 50%; animation: seg-in .6s var(--ease-out) both; animation-delay: calc(var(--i) * 60ms + 100ms); }
.sf-seg-n { font-size: 12.5px; font-weight: 700; color: var(--text); }
.sf-seg.dark .sf-seg-n { color: #fff; }
@keyframes seg-in { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }

/* 범례 — 세 묶음이 나란히. 묶음 헤더가 요약 숫자, 아래가 상태별 상세 */
.sf-legend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.sf-grp { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-2); min-width: 0; }
.sf-grp-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--line); }
.sf-grp-label { font-size: 12.5px; font-weight: 700; color: var(--text-sub); }
.sf-grp-n b { font-size: 20px; font-weight: 700; line-height: 1; }
.sf-grp-n small { font-size: 11.5px; margin-left: 4px; }
.sf-rows { display: flex; flex-direction: column; gap: 6px; }
.sf-row { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto 44px; gap: 8px; align-items: center; font-size: 13.5px; }
.sf-chip { width: 10px; height: 10px; border-radius: 3px; }
.sf-label { color: var(--text); }
.sf-n { text-align: right; font-weight: 700; }
.sf-pct { text-align: right; font-size: 12px; }
.sf-empty { font-size: 12.5px; margin: 0; }
@media (max-width: 800px) { .sf-legend { grid-template-columns: 1fr; } }
</style>
