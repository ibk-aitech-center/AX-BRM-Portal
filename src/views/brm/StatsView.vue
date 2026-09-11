<script setup lang="ts">
/**
 * 통계 대시보드 — 부서 관리자·운영자가 한 화면에서 "지금 어떤 상태인지"를 읽는 페이지.
 * 구성(위→아래, 중요한 것부터):
 *  1) 인사 줄 + 기간 세그먼트  2) KPI 4장(이전 기간 대비 증감·스파크라인)
 *  3) 월별 추이(넓게) + 지금 챙길 것(파생 인사이트)  4) 요청 부서별(전체 폭 — 본부부서 70여 개: 상위 10 누적 막대 / 전체 타일 + 검색)
 *  5) AX-BRM 담당자별 처리 현황(전체 폭 — 담당자 행 + 미지정 묶음)  6) 완료 건 종결 분류(목업 제공 여부 · 배포 위치 · 완성 형태 · 교차표)
 *  7) 상태 구성(100% 띠 + 묶음 요약) + 요청 유형 분포(채널·갈래·데이터 케이스·연계)
 * 데이터 원칙(lieflat): 단위는 셀 수 있게(눈금 = 1건, 범례 문구는 화면에 쓰지 않음), 색은 브랜드 1색 + 회색, 텍스트는 텍스트 토큰.
 * 양이 늘어도 견디도록: 월은 기간 전체를 채우고(빈 달 0), 부서는 상위 10 + 전체 타일(카드 안 스크롤).
 * 기간을 바꾸면 이전 수치를 그대로 둔 채 가는 진행선만 보이고, 새 데이터가 오면 swap 트랜지션으로 교체(차트 드로우인 재생).
 */
import { ref, computed, onMounted, watch } from 'vue';
import { api, humanMessage, downloadWithAuth } from '@/services/api';
import { toast } from '@/services/toast';
import { session } from '@/services/session';
import type { Stats, StatBucket } from '@/types';
import { STATUS } from '@shared/statuses.js';
import BrmShell from '@/components/BrmShell.vue';
import SegControl from '@/components/SegControl.vue';
import CountUp from '@/components/CountUp.vue';
import Sparkline from '@/components/Sparkline.vue';
import RungColumns from '@/components/RungColumns.vue';
import TickRows from '@/components/TickRows.vue';
import StatusFlow from '@/components/StatusFlow.vue';
import OrgBoard from '@/components/OrgBoard.vue';
import AssigneeBoard from '@/components/AssigneeBoard.vue';
import ClosureBoard from '@/components/ClosureBoard.vue';


const stats = ref<Stats | null>(null);
/** 요청 유형 분포 4개는 같은 방식으로 그린다 — 네 분포의 최댓값을 공유해 막대 길이를 서로 비교할 수 있게 하고,
 *  하나라도 눈금(1칸=1건) 한도를 넘으면 넷 다 비례 막대로 바꾼다 (블록마다 다른 차트가 섞이지 않도록) */
const MIX_UNIT_MAX = 24;
const mixMax = computed(() => {
  const st = stats.value; if (!st) return 1;
  return Math.max(1, ...[st.byChannel, st.byTrack, st.byDataCase, st.byIntegration].flat().map((i) => i.n));
});
const mixUnit = computed(() => mixMax.value <= MIX_UNIT_MAX);
const prev = ref<Stats | null>(null);   // 직전 같은 길이 기간 — 증감 비교용
const loading = ref(true);
const error = ref('');
const today = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const presetFrom = (months: number) => iso(new Date(today.getFullYear(), today.getMonth() - months + 1, 1));
const from = ref(presetFrom(12));
const to = ref(iso(today));

const DAY = 86400000;
function q(f: Date, t: Date) { return `from=${f.toISOString()}&to=${t.toISOString()}`; }
async function load() {
  loading.value = true; error.value = '';
  const f = new Date(from.value), t = new Date(to.value); t.setDate(t.getDate() + 1);
  const span = Math.max(DAY, t.getTime() - f.getTime());
  try {
    const [cur, pv] = await Promise.all([
      api.get<Stats>(`/api/stats?${q(f, t)}`),
      api.get<Stats>(`/api/stats?${q(new Date(f.getTime() - span), f)}`).catch(() => null),
    ]);
    stats.value = cur; prev.value = pv;
  } catch (e) { error.value = humanMessage(e); }
  finally { loading.value = false; }
}
onMounted(load);
watch([from, to], load);

// 기간 프리셋 — 단일 선택(세그먼트). 날짜를 손으로 고치면 '직접 입력'으로 넘어간다
const PRESETS = [3, 6, 12];
const rangeOpts = [...PRESETS.map((m) => ({ value: String(m), label: `${m}개월` })), { value: 'custom', label: '직접 입력' }];
const range = computed<string>({
  get: () => { const m = PRESETS.find((m) => from.value === presetFrom(m) && to.value === iso(today)); return m ? String(m) : 'custom'; },
  set: (v) => { const m = Number(v); if (m) { from.value = presetFrom(m); to.value = iso(today); } },
});
const dataKey = computed(() => stats.value ? `${stats.value.range.from}~${stats.value.range.to}` : '');
const rangeLabel = computed(() => { const m = Number(range.value); return m ? `최근 ${m}개월` : `${from.value} ~ ${to.value}`; });
const greeting = computed(() => { const h = today.getHours(); return h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후예요' : '좋은 저녁이에요'; });

/* ── 파생 데이터 ── */
// 월별: 기간 안의 모든 달을 채워 빈 달도 0으로 보이게
const months = computed<StatBucket[]>(() => {
  const s = stats.value; if (!s) return [];
  const have = new Map(s.byMonth.map((b) => [b.key, b.n]));
  const out: StatBucket[] = [];
  const f = new Date(from.value), t = new Date(to.value);
  for (let d = new Date(f.getFullYear(), f.getMonth(), 1); d <= t && out.length < 60; d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, n: have.get(key) ?? 0 });
  }
  return out.length ? out : s.byMonth;
});
const closedOf = (s: Stats) => s.totals.done + s.totals.guided;
const statusN = (s: Stats, key: string) => s.byStatus.find((b) => b.key === key)?.n ?? 0;
/** '현재 진행 중' 인사이트의 상태 묶음 — 검토 대기(submitted)도, 완료·반려·종결도 아닌 건.
 *  프로세스: 요청 → 검토 → (필요시) 보완 요청 → 확정 → 개발 중 → 완료. 보완 요청은 검토 단계의 하나라 진행 중에 들어간다 (2026-09-11).
 *  접수함 '진행 중' 묶음과 같은 정의(KPI '진행 중'은 여기에 검토 대기를 더한 수). 접수함 링크(?status=)와 문구가 이 목록 하나를 같이 쓴다 */
const IN_PROGRESS_STATUSES = ['reviewing', 'hold', 'accepted', 'developing'] as const;
const IN_PROGRESS_LABEL = IN_PROGRESS_STATUSES.map((k) => STATUS[k].label).join(' · ');
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
/** '진행 중' 타일 보조 문구 — 대기와 보완 요청은 각각 "아직 안 잡은 것"·"요청자 답을 기다리는 것"이라 따로 밝힌다 */
function openSub(s: Stats) {
  const parts: string[] = [];
  if (s.totals.awaiting) parts.push(`검토 대기 ${s.totals.awaiting}`);
  const hold = statusN(s, 'hold'); if (hold) parts.push(`보완 요청 ${hold}`);
  return parts.length ? `그중 ${parts.join(' · ')}` : '검토 대기·보완 요청 없음';
}
const peakMonth = computed(() => months.value.reduce<StatBucket | null>((m, b) => (b.n > (m?.n ?? 0) ? b : m), null));
const monthLabel = (k: string) => { const [y, m] = k.split('-'); return `${y}년 ${Number(m)}월`; };

// 증감: 이전 기간과 비교. 값이 없으면 표시 안 함
type Delta = { d: number; up: boolean | null; text: string } | null;
function delta(cur: number | null, pv: number | null | undefined, unit = '건'): Delta {
  if (cur == null || pv == null || !prev.value) return null;
  const d = Math.round((cur - pv) * 10) / 10;
  return { d, up: d === 0 ? null : d > 0, text: d === 0 ? `이전과 같음` : `${d > 0 ? '+' : ''}${d}${unit}` };
}
/** 분포 블록의 모수 — 접수 총계와 다를 때(판정이 없는 옛 건 등) 제목에 밝힌다 */
const mixSum = (items: { n: number }[]) => items.reduce((n, b) => n + b.n, 0);
const kpis = computed(() => {
  const s = stats.value; if (!s) return [];
  const p = prev.value?.totals;
  return [
    { l: '접수', v: s.totals.submitted, u: '건', sub: p ? `이전 기간 ${p.submitted}건` : '기간 안에 신청된 요청', delta: delta(s.totals.submitted, p?.submitted), spark: true },
    // 진행 중은 상태 구성의 '진행 중' 묶음과 같은 수(보완 요청 포함). 반려는 별도라고 밝혀 접수 = 진행 중 + 완료·종결 + 반려 가 읽히게
    { l: '진행 중', v: s.totals.open, u: '건', sub: openSub(s), delta: delta(s.totals.open, p?.open), warn: s.totals.awaiting > 0 },
    { l: '완료·종결', v: closedOf(s), u: '건', sub: s.totals.submitted ? `접수의 ${pct(closedOf(s), s.totals.submitted)}%` : '–', delta: delta(closedOf(s), p ? closedOf(prev.value!) : null) },
    // 반려를 타일로 — 접수 = 진행 중 + 완료·종결 + 반려 가 타일 넷으로 바로 맞아떨어진다 (2026-09-08, 5장 구성 · 2026-09-11 보완 요청은 진행 중으로)
    { l: '반려', v: s.totals.stalled, u: '건', sub: s.totals.submitted ? `접수의 ${pct(s.totals.stalled, s.totals.submitted)}%` : '반려 없음', delta: delta(s.totals.stalled, p?.stalled), lowerBetter: true },
    { l: '첫 의견까지', v: s.totals.avgFirstReviewDays, u: '일', sub: s.totals.avgDoneDays != null ? `완료까지 평균 ${s.totals.avgDoneDays}일` : '완료 사례 없음', delta: delta(s.totals.avgFirstReviewDays, p?.avgFirstReviewDays, '일'), lowerBetter: true },
  ];
});

// 지금 챙길 것 — 숫자에서 바로 읽히는 문장들. 많아도 5개까지만
type Insight = { tag: string; tone: 'warning' | 'danger' | 'brand' | 'neutral' | 'success'; text: string; to?: string };
const insights = computed<Insight[]>(() => {
  const s = stats.value; if (!s) return [];
  const out: Insight[] = [];
  const hold = s.byStatus.find((b) => b.key === 'hold')?.n ?? 0;
  if (s.totals.awaiting) out.push({ tag: '대기', tone: 'warning', text: `${s.totals.awaiting}건이 첫 검토를 기다리고 있어요. 접수함 '검토 대기'에서 바로 볼 수 있어요.`, to: '/brm?status=submitted' });
  // 현재 진행 중 — 대기 바로 아래. 0건이어도 보여 준다(없다는 것도 읽을 정보). 링크는 접수함을 같은 세 상태로 걸러 연다
  const inProgress = IN_PROGRESS_STATUSES.reduce((n, k) => n + statusN(s, k), 0);
  out.push(inProgress
    ? { tag: '진행', tone: 'brand', text: `현재 진행 중인 건이 ${inProgress}건이에요 (${IN_PROGRESS_LABEL}).`, to: `/brm?status=${IN_PROGRESS_STATUSES.join(',')}` }
    : { tag: '진행', tone: 'neutral', text: `현재 진행 중인 건이 없어요 (${IN_PROGRESS_LABEL} 모두 0건).` });
  // 보완 요청 — 공이 요청자에게 간 건. 진행 중과 따로 세어 "우리가 기다리는 것"이 보이게
  if (hold) out.push({ tag: '보완', tone: 'neutral', text: `보완 요청 ${hold}건 — 요청자의 보완을 기다리고 있어요. 오래 멈춰 있으면 연락해 주세요.`, to: '/brm?status=hold' });
  if (s.totals.avgFirstReviewDays != null) {
    const pv = prev.value?.totals.avgFirstReviewDays;
    const cmp = pv != null ? (s.totals.avgFirstReviewDays < pv ? ` 이전 기간(${pv}일)보다 빨라졌어요.` : s.totals.avgFirstReviewDays > pv ? ` 이전 기간(${pv}일)보다 느려졌어요.` : ' 이전 기간과 같아요.') : '';
    out.push({ tag: '속도', tone: s.totals.avgFirstReviewDays > 3 ? 'danger' : 'success', text: `첫 의견까지 평균 ${s.totals.avgFirstReviewDays}일이에요.${cmp}` });
  }
  const noAsg = s.byAssignee?.find((a) => a.key === 'none');
  const noAsgOpen = noAsg ? noAsg.awaiting + noAsg.active : 0;
  if (noAsgOpen) out.push({ tag: '담당', tone: 'warning', text: `담당자가 없는 채 진행 중인 건이 ${noAsgOpen}건이에요. 접수함 '담당자 미지정'에서 지정해 주세요.`, to: '/brm?assignee=none&status=submitted,reviewing,accepted,developing' });
  if (s.totals.submitted) out.push({ tag: '완료', tone: 'success', text: `접수 ${s.totals.submitted}건 중 ${closedOf(s)}건(${pct(closedOf(s), s.totals.submitted)}%)이 완료·종결됐어요.` });
  if (peakMonth.value && peakMonth.value.n && months.value.length > 1) out.push({ tag: '추이', tone: 'neutral', text: `${monthLabel(peakMonth.value.key)}에 가장 많이(${peakMonth.value.n}건) 접수됐어요.` });
  return out.slice(0, 5);
});

async function csv() { try { await downloadWithAuth(`/api/stats/export.csv?from=${new Date(from.value).toISOString()}&to=${new Date(new Date(to.value).getTime() + DAY).toISOString()}`, `ai-brm-requests-${to.value}.csv`); } catch (e) { toast(humanMessage(e), 'danger'); } }
</script>

<template>
  <BrmShell>
    <div class="dash">
      <header class="dash-head">
        <div>
          <p class="eyebrow">통계</p>
          <h1 class="dash-title">{{ greeting }}, {{ session.user?.name || 'BRM' }}님.</h1>
          <p class="dash-sub">{{ rangeLabel }} 동안 AX-BRM 포탈이 어떻게 움직였는지 정리했어요.</p>
        </div>
        <div class="dash-tools">
          <SegControl v-model="range" :options="rangeOpts" size="sm" aria-label="기간" />
          <label class="row text-sm text-sub dash-dates"><input v-model="from" type="date" class="input" aria-label="시작일" /> ~ <input v-model="to" type="date" class="input" aria-label="종료일" /></label>
          <button class="btn btn-secondary btn-sm" @click="csv">⬇ CSV</button>
        </div>
      </header>

      <div class="stats-loading" :class="{ on: loading && stats }" aria-hidden="true"></div>

      <div v-if="loading && !stats" class="center" style="padding:64px" role="status"><div class="spinner" style="margin:0 auto" aria-hidden="true"></div></div>
      <div v-else-if="error && !stats" class="empty card"><div class="empty-emoji" aria-hidden="true">☁️</div><div class="empty-title">{{ error }}</div><button class="btn btn-secondary mt-md" @click="load">다시 불러오기</button></div>

      <Transition v-else name="swap" mode="out-in">
        <div v-if="stats" :key="dataKey" :aria-busy="loading" class="dash-body">
          <!-- 1. KPI -->
          <section class="kpi-grid" aria-label="핵심 지표">
            <article v-for="k in kpis" :key="k.l" class="card kpi" :class="{ 'kpi-warn': k.warn }">
              <div class="kpi-top">
                <span class="kpi-l">{{ k.l }}</span>
                <span v-if="k.delta" class="badge kpi-delta" :data-tone="k.delta.up === null ? 'neutral' : (k.delta.up !== k.lowerBetter ? 'brand' : 'neutral')" :title="'이전 같은 길이 기간 대비'">
                  <template v-if="k.delta.up !== null">{{ k.delta.up ? '▲' : '▼' }}</template> {{ k.delta.text }}
                </span>
              </div>
              <div class="kpi-row">
                <div class="kpi-v"><CountUp :value="k.v" /><span class="kpi-u">{{ k.u }}</span></div>
                <Sparkline v-if="k.spark" :items="months" :width="112" :height="34" />
              </div>
              <p class="kpi-sub">{{ k.sub }}</p>
            </article>
          </section>

          <!-- 2. 월별 추이 + 지금 챙길 것 -->
          <section class="dash-row dash-row-8-4">
            <article class="card panel">
              <header class="panel-head">
                <div><h2 class="panel-title">월별 접수 추이</h2><p class="panel-sub">{{ rangeLabel }} · 달마다 접수된 요청 수</p></div>
                <div class="panel-kicker"><b class="num">{{ stats.totals.submitted }}</b><span class="text-sub">건</span></div>
              </header>
              <RungColumns :items="months" class="panel-chart" />
            </article>
            <article class="card panel">
              <header class="panel-head">
                <div><h2 class="panel-title">지금 챙길 것</h2><p class="panel-sub">숫자에서 바로 읽히는 포인트</p></div>
                <span class="badge" data-tone="brand">자동 요약</span>
              </header>
              <ul v-if="insights.length" class="ins" role="list">
                <li v-for="(it, i) in insights" :key="i" class="ins-item" :style="{ '--i': i }">
                  <span class="badge ins-tag" :data-tone="it.tone">{{ it.tag }}</span>
                  <p class="ins-text">{{ it.text }} <router-link v-if="it.to" :to="it.to" class="ins-link">접수함 열기 →</router-link></p>
                </li>
              </ul>
              <p v-else class="text-muted text-sm">이 기간에는 챙길 항목이 없어요.</p>
            </article>
          </section>

          <!-- 3. 요청 부서별 — 전체 폭 -->
          <section class="card panel">
            <header class="panel-head">
              <div><h2 class="panel-title">요청 부서별</h2><p class="panel-sub">신청 시점 소속 기준 · 막대는 진행 상황으로 쪼개져요</p></div>
            </header>
            <OrgBoard :items="stats.byOrg" :total="stats.totals.submitted" />
          </section>

          <!-- 4. AX-BRM 담당자별 처리 현황 — 전체 폭 -->
          <section class="card panel" data-testid="stats-assignee">
            <header class="panel-head">
              <div><h2 class="panel-title">AX-BRM 담당자별 처리 현황</h2><p class="panel-sub">지정된 담당자 기준 · 막대는 부서별과 같은 진행 상황 구분이에요</p></div>
              <div class="panel-kicker"><b class="num">{{ stats.byAssignee.filter((a) => a.key !== 'none').length }}</b><span class="text-sub">명</span></div>
            </header>
            <AssigneeBoard :items="stats.byAssignee" :total="stats.totals.submitted" />
          </section>

          <!-- 5. 완료 건 종결 분류 — 전체 폭 -->
          <section class="card panel" data-testid="stats-closure">
            <header class="panel-head">
              <div><h2 class="panel-title">완료 건 종결 분류</h2><p class="panel-sub">완료 처리 때 담당자가 고른 배포 위치·완성 형태와 컨셉 목업 제공 여부</p></div>
              <div class="panel-kicker"><b class="num">{{ stats.closure.done }}</b><span class="text-sub">건 완료</span></div>
            </header>
            <ClosureBoard :stats="stats.closure" />
          </section>

          <!-- 6. 상태 구성 + 요청 유형 분포 — 위아래로(2×1). 나란히 두면 유형 분포 블록의 라벨이 잘렸다 (2026-09-08) -->
          <section class="dash-row dash-row-stack">
            <article class="card panel">
              <header class="panel-head"><div><h2 class="panel-title">상태 구성</h2><p class="panel-sub">앞 단계일수록 옅고, 완료에 가까울수록 짙어요</p></div></header>
              <StatusFlow :items="stats.byStatus" />
            </article>
            <article class="card panel">
              <header class="panel-head"><div><h2 class="panel-title">요청 유형 분포</h2><p class="panel-sub">요청 계기 · 지원 유형 · 데이터 케이스 · 연계 방식{{ mixUnit ? '' : ' · 막대 길이는 네 분포에서 같은 기준이에요' }}</p></div></header>
              <div class="mix">
                <section class="mix-block" aria-labelledby="mix-channel"><h3 id="mix-channel" class="mix-title">요청 계기</h3><TickRows :items="stats.byChannel" :max="mixMax" :unit-max="MIX_UNIT_MAX" /></section>
                <section class="mix-block" aria-labelledby="mix-track"><h3 id="mix-track" class="mix-title">지원 유형</h3><TickRows :items="stats.byTrack" :max="mixMax" :unit-max="MIX_UNIT_MAX" /></section>
                <section class="mix-block" aria-labelledby="mix-datacase"><h3 id="mix-datacase" class="mix-title">데이터 케이스 <span class="text-xs text-muted">(데이터 판정이 있는 {{ mixSum(stats.byDataCase) }}건 기준)</span></h3><TickRows :items="stats.byDataCase" :max="mixMax" :unit-max="MIX_UNIT_MAX" empty="개발 검증 유형의 요청이 없어요" /></section>
                <section class="mix-block" aria-labelledby="mix-integration"><h3 id="mix-integration" class="mix-title">데이터 연계 방식 <span class="text-xs text-muted">(연계 판정이 있는 {{ mixSum(stats.byIntegration) }}건 기준)</span></h3><TickRows :items="stats.byIntegration" :max="mixMax" :unit-max="MIX_UNIT_MAX" empty="데이터 연계 요청이 없어요" /></section>
              </div>
            </article>
          </section>

          <p class="hint">기준: 신청 일시(submitted_at) · 걸린 일수는 달력 기준으로 당일 처리를 1일로 셈(시각 차이는 세지 않음) · 요청부서는 신청 시점 소속 스냅샷 · 담당자는 현재 지정된 사람 · 목업 제공 = 컨셉 목업 첨부가 있는 건 · 작성 중(draft)은 제외 · 증감은 직전 같은 길이 기간과 비교</p>
        </div>
      </Transition>
    </div>
  </BrmShell>
</template>

<style scoped>
.dash { display: flex; flex-direction: column; gap: var(--space-md); }
.dash-head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-md); flex-wrap: wrap; }
.dash-title { font-size: 26px; font-weight: 700; margin-top: 6px; letter-spacing: -.01em; }
.dash-sub { color: var(--text-sub); font-size: 14px; margin-top: 4px; }
.dash-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dash-dates .input { min-height: 34px; padding: 4px 10px; width: auto; font-size: 13px; }
.dash-body { display: flex; flex-direction: column; gap: var(--space-md); }

/* 행 그리드 — 12칸. 좁아지면 한 줄씩 */
.dash-row { display: grid; gap: var(--space-md); align-items: stretch; }
.dash-row-8-4 { grid-template-columns: minmax(0, 8fr) minmax(0, 4fr); }
.dash-row-4-8 { grid-template-columns: minmax(0, 4fr) minmax(0, 8fr); }
.dash-row-5-7 { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); }
.dash-row-stack { grid-template-columns: 1fr; }
@media (max-width: 1100px) { .dash-row { grid-template-columns: 1fr; } }

/* 패널 카드 — 넉넉한 안쪽 여백, 제목 + 설명 + 우측 요약 숫자 */
.panel { padding: 22px 24px 24px; display: flex; flex-direction: column; gap: 18px; }
.panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.panel-title { font-size: 16px; font-weight: 700; }
.panel-sub { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
.panel-kicker { display: inline-flex; align-items: baseline; gap: 3px; white-space: nowrap; }
.panel-kicker b { font-size: 22px; font-weight: 700; }
.panel-chart { flex: 1 0 auto; }
.panel :deep(.rc) { height: 260px; }

/* KPI 4장 */
.kpi-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-md); }
@media (max-width: 1280px) { .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 900px) { .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .kpi-grid { grid-template-columns: 1fr; } }
.kpi { padding: 18px 22px 16px; display: flex; flex-direction: column; gap: 6px; }
.kpi-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.kpi-l { font-size: 13px; font-weight: 600; color: var(--text-sub); }
.kpi-delta { font-size: 11.5px; padding: 2px 8px; }
.kpi-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; min-height: 40px; }
.kpi-v { font-size: 34px; font-weight: 700; line-height: 1.05; letter-spacing: -.02em; }
.kpi-u { font-size: 14px; font-weight: 500; color: var(--text-muted); margin-left: 4px; }
.kpi-sub { font-size: 12.5px; color: var(--text-muted); }
.kpi-warn .kpi-sub { color: var(--warning); font-weight: 600; }

/* 지금 챙길 것 */
.ins { display: flex; flex-direction: column; gap: 8px; }
.ins-item { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-2); animation: ins-in .4s var(--ease-out) both; animation-delay: calc(var(--i) * 70ms + 150ms); }
@keyframes ins-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.ins-tag { flex: none; min-width: 44px; justify-content: center; }
.ins-text { font-size: 13.5px; line-height: 1.55; color: var(--text); }
.ins-link { color: var(--accent); font-weight: 600; white-space: nowrap; }

/* 요청 유형 분포 — 블록 4개를 2×2 로 고정 (패널이 전체 폭을 쓰므로 3+1 로 흐르지 않게). 좁은 화면은 1열.
   블록마다 옅은 면과 테두리를 줘서 네 분포가 서로 다른 묶음임이 보이게 */
.mix { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 800px) { .mix { grid-template-columns: 1fr; } }
.mix-block { padding: 14px 16px 10px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); }
.mix-title { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 6px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }

/* 재조회 중: 콘텐츠는 그대로 두고 가는 선만 흐른다 */
.stats-loading { height: 2px; margin: -8px 0 -8px; border-radius: 1px; background: linear-gradient(90deg, transparent, var(--brand-500), transparent); background-size: 40% 100%; background-repeat: no-repeat; opacity: 0; transition: opacity .2s ease; }
.stats-loading.on { opacity: 1; animation: stats-sweep 1.1s ease-in-out infinite; }
@keyframes stats-sweep { from { background-position: -40% 0; } to { background-position: 140% 0; } }
</style>
