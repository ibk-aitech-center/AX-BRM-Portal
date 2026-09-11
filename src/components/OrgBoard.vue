<script setup lang="ts">
/**
 * 요청 부서별 현황 — 본부부서가 70여 개라 "다 보이면서도 조잡하지 않게"가 목표.
 *  · 상단 요약: 참여 부서 수, 상위 3개 부서 집중도(전체의 %), 아직 신청이 없는 부서 수(전체 부서 수를 알 때만)
 *  · 보기 전환(세그먼트): [상위 10] 진행 상황이 쪼개진 가로 누적 막대 — 대기·진행·완료종결·보류반려
 *                        [전체]   부서 타일 그리드(건수 내림차순, 이름 검색) — 타일마다 건수와 완료 비율 띠
 *  · 색: 브랜드 1색의 진하기로 진행 단계(대기 옅음 → 완료 짙음), 보류·반려만 회색. 텍스트는 텍스트 토큰.
 */
import { ref, computed } from 'vue';
import type { OrgBucket } from '@/types';
import SegControl from '@/components/SegControl.vue';

const props = withDefaults(defineProps<{ items: OrgBucket[]; total?: number; orgCount?: number | null }>(), { total: 0, orgCount: null });

const view = ref<'top' | 'all'>('top');
const viewOpts = [{ value: 'top', label: '상위 10' }, { value: 'all', label: '전체' }];
const q = ref('');

const sorted = computed(() => [...props.items].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key, 'ko')));
const top = computed(() => sorted.value.slice(0, 10));
const filtered = computed(() => { const s = q.value.trim(); return s ? sorted.value.filter((o) => o.key.includes(s)) : sorted.value; });
const max = computed(() => Math.max(1, ...props.items.map((o) => o.n)));
const sum = computed(() => props.total || props.items.reduce((s, o) => s + o.n, 0));
const pct = (n: number, d = sum.value) => (d ? Math.round((n / d) * 100) : 0);
const top3Share = computed(() => pct(sorted.value.slice(0, 3).reduce((s, o) => s + o.n, 0)));
const silent = computed(() => (props.orgCount ? Math.max(0, props.orgCount - props.items.length) : null));

// 누적 막대 조각 — 진행 순서대로
const SEGS: { k: keyof OrgBucket; label: string; c: string }[] = [
  { k: 'closed', label: '완료·종결', c: 'var(--brand-500)' },
  { k: 'active', label: '진행 중', c: 'var(--brand-300)' },
  { k: 'awaiting', label: '검토 대기', c: 'var(--brand-100)' },
  { k: 'stalled', label: '반려', c: 'var(--ink-300)' },
];
const segTitle = (o: OrgBucket) => SEGS.map((s) => `${s.label} ${o[s.k]}`).join(' · ');
</script>

<template>
  <div class="ob">
    <div class="ob-sum">
      <div class="ob-stat"><b class="num">{{ items.length }}</b><span>참여 부서</span><small v-if="orgCount" class="text-muted">/ {{ orgCount }}개</small></div>
      <div class="ob-stat"><b class="num">{{ top3Share }}<small>%</small></b><span>상위 3개 부서 비중</span></div>
      <div class="ob-stat"><b class="num">{{ sorted[0]?.n ?? 0 }}</b><span>최다 부서 건수</span><small v-if="sorted[0]" class="text-muted truncate">{{ sorted[0].key }}</small></div>
      <div v-if="silent !== null" class="ob-stat"><b class="num">{{ silent }}</b><span>아직 신청 없는 부서</span></div>
    </div>

    <div class="ob-tools">
      <SegControl v-model="view" :options="viewOpts" size="sm" aria-label="부서 보기" />
      <input v-if="view === 'all'" v-model="q" class="input ob-q" type="search" placeholder="부서 이름 검색" aria-label="부서 이름 검색" />
      <ul class="ob-legend" aria-hidden="true"><li v-for="s in SEGS" :key="s.k"><i :style="{ background: s.c }"></i>{{ s.label }}</li></ul>
    </div>

    <Transition name="swap" mode="out-in">
      <!-- 상위 10: 부서 이름 · 누적 막대 · 건수 · 비중 -->
      <ol v-if="view === 'top'" key="top" class="ob-top" role="list">
        <li v-for="(o, i) in top" :key="o.key" class="ob-row" :style="{ '--i': i }">
          <span class="ob-rank num">{{ i + 1 }}</span>
          <span class="ob-name truncate" :title="o.key">{{ o.key }}</span>
          <span class="ob-bar" :title="segTitle(o)" :style="{ width: (o.n / max * 100) + '%' }">
            <i v-for="s in SEGS" :key="s.k" :style="{ flex: `${o[s.k]} 0 0`, background: s.c }"></i>
          </span>
          <b class="ob-n num">{{ o.n }}</b>
          <small class="ob-pct num text-muted">{{ pct(o.n) }}%</small>
        </li>
        <li v-if="!top.length" class="text-muted text-sm">아직 데이터가 없어요</li>
      </ol>

      <!-- 전체: 타일 그리드 — 이름 · 건수 · 완료 비율 띠 -->
      <div v-else key="all" class="ob-grid-wrap">
        <div v-if="filtered.length" class="ob-grid">
          <div v-for="(o, i) in filtered" :key="o.key" class="ob-tile" :style="{ '--i': Math.min(i, 40) }" :title="segTitle(o)">
            <span class="ob-tile-name truncate">{{ o.key }}</span>
            <span class="ob-tile-n"><b class="num">{{ o.n }}</b><small class="text-muted">건</small></span>
            <span class="ob-tile-bar"><i v-for="s in SEGS" :key="s.k" :style="{ flex: `${o[s.k]} 0 0`, background: s.c }"></i></span>
          </div>
        </div>
        <p v-else class="text-muted text-sm">"{{ q }}" 에 맞는 부서가 없어요</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ob { display: flex; flex-direction: column; gap: 16px; }
.ob-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.ob-stat { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-2); min-width: 0; }
.ob-stat b { font-size: 24px; font-weight: 700; line-height: 1.1; }
.ob-stat b small { font-size: 14px; font-weight: 600; margin-left: 1px; }
.ob-stat span { font-size: 12.5px; color: var(--text-sub); font-weight: 600; }
.ob-stat small { font-size: 11.5px; }

.ob-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ob-q { min-height: 32px; padding: 4px 12px; font-size: 13px; width: 200px; }
.ob-legend { display: flex; gap: 12px; margin-left: auto; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; }
.ob-legend li { display: inline-flex; align-items: center; gap: 5px; }
.ob-legend i { width: 10px; height: 10px; border-radius: 3px; }

.ob-top { display: flex; flex-direction: column; gap: 4px; }
.ob-row { display: grid; grid-template-columns: 22px minmax(120px, 220px) 1fr 36px 46px; gap: 12px; align-items: center; padding: 7px 4px; font-size: 13.5px; animation: ob-in .4s var(--ease-out) both; animation-delay: calc(var(--i) * 40ms + 100ms); }
.ob-rank { font-size: 12px; color: var(--text-muted); text-align: right; }
.ob-name { color: var(--text); font-weight: 600; }
.ob-bar { display: flex; height: 14px; border-radius: 4px; overflow: hidden; gap: 1px; transform-origin: 0 50%; animation: ob-grow .6s var(--ease-out) both; animation-delay: calc(var(--i) * 40ms + 200ms); min-width: 3px; }
.ob-bar i { display: block; height: 100%; }
.ob-n { text-align: right; font-weight: 700; }
.ob-pct { text-align: right; font-size: 12px; }
@keyframes ob-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes ob-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* 전체 타일: 70개도 한눈에 — 스크롤은 카드 안에서만 */
.ob-grid-wrap { max-height: 480px; overflow: auto; margin: 0 -6px; padding: 0 6px; }
.ob-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)); gap: 8px; }
.ob-tile { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; padding: 10px 12px 9px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); animation: ob-in .35s var(--ease-out) both; animation-delay: calc(var(--i) * 18ms); transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
.ob-tile:hover { border-color: var(--line-strong); box-shadow: 0 1px 4px rgba(27,43,44,.06); }
.ob-tile-name { font-size: 12.5px; font-weight: 600; color: var(--text); }
.ob-tile-n b { font-size: 15px; font-weight: 700; }
.ob-tile-n small { font-size: 11px; margin-left: 1px; }
.ob-tile-bar { grid-column: 1 / -1; display: flex; height: 4px; border-radius: 2px; overflow: hidden; gap: 1px; background: var(--surface-2); }
.ob-tile-bar i { display: block; height: 100%; }
</style>
