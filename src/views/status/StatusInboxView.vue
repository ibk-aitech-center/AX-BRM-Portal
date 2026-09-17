<script setup lang="ts">
/**
 * 그룹기획 접수현황 목록 — 조회 전용.
 * 서버가 scope=status 로 **신청된 모든 건**(초안 제외)을 돌려준다 (server/groupPlanner.js) — 데이터 요청 메뉴와 달리 조건이 없다.
 * 접수함(InboxView)과 같은 표 구조지만 담당자 지정·검토 같은 쓰기 동작은 어디에도 없다.
 */
import Icon3d from '@/components/Icon3d.vue';
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, humanMessage } from '@/services/api';
import type { RequestSummary } from '@/types';
import { STATUS, STATUS_ORDER } from '@shared/statuses.js';
import { TRACK_LABEL } from '@shared/rules.js';
import StatusShell from '@/components/StatusShell.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import SegControl from '@/components/SegControl.vue';
import { fmtDate, fmtRelative } from '@/services/format';

const router = useRouter();
const items = ref<RequestSummary[]>([]);
const loading = ref(true);
const error = ref('');
const f = ref({ status: [] as string[], q: '', from: '', to: '' });
const S = STATUS as Record<string, { label: string }>;
type L = { label: string };
const TL = TRACK_LABEL as Record<string, L>;
const statusChips = STATUS_ORDER.filter((s) => s !== 'draft');
const groups = [
  { key: 'todo', label: '검토 대기', statuses: ['submitted'] },
  { key: 'wip', label: '진행 중', statuses: ['reviewing', 'hold', 'accepted', 'developing'] },
  { key: 'hold', label: '보완 요청', statuses: ['hold'] },
  { key: 'closed', label: '종결', statuses: ['done', 'guided', 'rejected'] },
];

async function load() {
  loading.value = true; error.value = '';
  try {
    const p = new URLSearchParams({ scope: 'status' });
    if (f.value.status.length) p.set('status', f.value.status.join(','));
    if (f.value.q) p.set('q', f.value.q);
    if (f.value.from) p.set('from', new Date(f.value.from).toISOString());
    if (f.value.to) { const t = new Date(f.value.to); t.setDate(t.getDate() + 1); p.set('to', t.toISOString()); }
    items.value = (await api.get<{ items: RequestSummary[] }>(`/api/requests?${p}`)).items;
  } catch (e) { error.value = humanMessage(e); }
  finally { loading.value = false; }
}
onMounted(load);
let t: ReturnType<typeof setTimeout>;
watch(f, () => { clearTimeout(t); t = setTimeout(load, 300); }, { deep: true });

const counts = computed(() => Object.fromEntries(groups.map((g) => [g.key, items.value.filter((r) => g.statuses.includes(r.status)).length])));
function toggleStatus(s: string) { const i = f.value.status.indexOf(s); if (i >= 0) f.value.status.splice(i, 1); else f.value.status.push(s); }
const groupOpts = computed(() => [
  ...groups.map((g) => ({ value: g.key, label: g.label, count: counts.value[g.key] })),
  { value: 'all', label: '전체', count: items.value.length },
]);
const group = computed<string | null>({
  get: () => !f.value.status.length ? 'all' : (groups.find((g) => g.statuses.length === f.value.status.length && g.statuses.every((s) => f.value.status.includes(s)))?.key ?? null),
  set: (k) => { const g = groups.find((x) => x.key === k); f.value.status = g ? [...g.statuses] : []; },
});
/** 판정 스냅샷의 진행 트랙 — 짧은 라벨 */
const track = (r: RequestSummary) => r.judgement?.track ? TL[r.judgement.track]?.label ?? r.judgement.track : '-';
function open(r: RequestSummary) { router.push({ name: 'status-review', params: { id: r.id } }); }
</script>

<template>
  <StatusShell>
    <div class="row-between wrap mb-lg">
      <div>
        <p class="eyebrow">그룹기획</p>
        <h1 style="font-size:24px;margin-top:4px">접수현황 조회</h1>
        <p class="text-sm text-sub mt-sm">신청된 모든 요청의 접수·진행 현황을 보여요. 처리 상황은 AX-BRM 담당자가 종합해서 등록해요.</p>
      </div>
      <SegControl v-model="group" :options="groupOpts" aria-label="상태 묶음" />
    </div>

    <div class="card filters mb-md">
      <div class="row wrap" style="gap:6px">
        <button v-for="s in statusChips" :key="s" class="chip" style="min-height:32px;font-size:12.5px" :aria-pressed="f.status.includes(s)" @click="toggleStatus(s)">{{ S[s].label }}</button>
      </div>
      <div class="row wrap mt-md" style="gap:10px">
        <input v-model="f.q" class="input" style="min-height:40px;padding:8px 12px;max-width:260px" placeholder="제목·접수번호·요청자 검색" aria-label="검색" />
        <label class="row text-sm text-sub">신청일 <input v-model="f.from" type="date" class="input" style="min-height:40px;padding:6px 10px;width:auto" aria-label="시작일" /> ~ <input v-model="f.to" type="date" class="input" style="min-height:40px;padding:6px 10px;width:auto" aria-label="종료일" /></label>
      </div>
    </div>

    <div v-if="loading" class="center" style="padding:48px" role="status"><div class="spinner" style="margin:0 auto" aria-hidden="true"></div></div>
    <div v-else-if="error" class="empty card"><div class="empty-emoji" aria-hidden="true">☁️</div><div class="empty-title">{{ error }}</div><button class="btn btn-secondary mt-md" @click="load">다시 불러오기</button></div>
    <div v-else-if="!items.length" class="empty card"><div class="empty-emoji" aria-hidden="true"><Icon3d name="document-analytics" :size="48" /></div><div class="empty-title">조건에 맞는 요청이 없어요</div><p>필터를 바꾸거나 "전체"를 눌러보세요.</p></div>
    <div v-else class="table-wrap">
      <table class="table data-table">
        <thead><tr><th>접수번호</th><th>제목</th><th>요청자 · 부서</th><th>진행 트랙</th><th>AX-BRM 담당자</th><th>상태</th><th>신청일</th><th>업데이트</th></tr></thead>
        <tbody>
          <tr v-for="r in items" :key="r.id" data-clickable tabindex="0" @click="open(r)" @keydown.enter="open(r)">
            <td class="identifier text-xs nowrap" style="word-break:normal">{{ r.reqNo }}</td>
            <td class="fw-600" style="min-width:220px;max-width:360px">{{ r.title }}</td>
            <td><div>{{ r.requester.name }}</div><div class="text-xs text-muted">{{ r.requester.orgNm || '-' }}</div></td>
            <td class="text-sm nowrap">{{ track(r) }}<span v-if="r.judgementAdjusted" class="badge adj" data-tone="brand" :title="`신청 시 자동 판정: ${r.judgementOriginal?.track ? TL[r.judgementOriginal.track]?.label ?? r.judgementOriginal.track : '-'} → AX-BRM 이 조정`">조정</span></td>
            <td class="text-sm nowrap"><template v-if="r.assignee">{{ r.assignee.name }}<span v-if="r.assignee.position" class="text-xs text-muted"> {{ r.assignee.position }}</span></template><span v-else class="text-muted">미지정</span></td>
            <td><StatusBadge :status="r.status" size="sm" /></td>
            <td class="text-sm nowrap tnum">{{ fmtDate(r.submittedAt) }}</td>
            <td class="text-sm text-muted nowrap">{{ fmtRelative(r.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </StatusShell>
</template>

<style scoped>
.data-table { min-width: 960px; }
.tnum { font-variant-numeric: tabular-nums; }
.adj { margin-left: 6px; font-size: 10.5px; padding: 1px 6px; vertical-align: 1px; }
</style>
