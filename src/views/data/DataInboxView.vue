<script setup lang="ts">
/**
 * DATA-BRM 데이터 요청 목록 — 조회 전용.
 * 서버가 scope=data 로 "행내 데이터가 필요한가요?" 에 네·모르겠어요 로 답한 건만 돌려준다 (server/dataBrm.js).
 * 접수함(InboxView)과 같은 표 구조지만 담당자 지정·검토 같은 쓰기 동작은 어디에도 없다.
 */
import Icon3d from '@/components/Icon3d.vue';
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, humanMessage } from '@/services/api';
import type { RequestSummary } from '@/types';
import { STATUS, STATUS_ORDER } from '@shared/statuses.js';
import { DATACASE_LABEL, INTEGRATION_LABEL } from '@shared/rules.js';
import DataShell from '@/components/DataShell.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import SegControl from '@/components/SegControl.vue';
import { fmtDate, fmtRelative } from '@/services/format';
import UnreadLegend from '@/components/UnreadLegend.vue';
import { UNREAD_LABEL } from '@/services/unread';

const router = useRouter();
const items = ref<RequestSummary[]>([]);
const loading = ref(true);
const error = ref('');
const f = ref({ status: [] as string[], q: '', from: '', to: '' });
const S = STATUS as Record<string, { label: string }>;
type L = { label: string };
const DL = DATACASE_LABEL as Record<string, L>; const IL = INTEGRATION_LABEL as Record<string, L>;
const statusChips = STATUS_ORDER.filter((s) => s !== 'draft');
const groups = [
  { key: 'todo', label: '검토 대기', statuses: ['submitted'] },
  { key: 'wip', label: '진행 중', statuses: ['reviewing', 'hold', 'accepted', 'developing'] }, // 보완 요청 포함 — 별도 버튼은 2026-09-23 제거
  { key: 'closed', label: '종결', statuses: ['done', 'guided', 'rejected'] }, // 완료 · 협의 종결 (· 과거 안내 종결)
];

async function load() {
  loading.value = true; error.value = '';
  try {
    const p = new URLSearchParams({ scope: 'data' });
    if (f.value.status.length) p.set('status', f.value.status.join(','));
    if (f.value.q) p.set('q', f.value.q);
    if (f.value.from) p.set('from', new Date(f.value.from).toISOString());
    if (f.value.to) { const t = new Date(f.value.to); t.setDate(t.getDate() + 1); p.set('to', t.toISOString()); }
    const a = await api.get<{ items: RequestSummary[]; statusCounts: Record<string, number> }>(`/api/requests?${p}`);
    items.value = a.items; statusCounts.value = a.statusCounts || {};
  } catch (e) { error.value = humanMessage(e); }
  finally { loading.value = false; }
}
onMounted(load);
let t: ReturnType<typeof setTimeout>;
watch(f, () => { clearTimeout(t); t = setTimeout(load, 300); }, { deep: true });

// 묶음 버튼 숫자 — 서버가 상태 조건만 뺀 나머지 조건으로 센 값. 어느 버튼을 눌러도 숫자가 흔들리지 않는다 (2026-09-23)
const statusCounts = ref<Record<string, number>>({});
const counts = computed(() => Object.fromEntries(groups.map((g) => [g.key, g.statuses.reduce((n, st) => n + (statusCounts.value[st] || 0), 0)])));
const total = computed(() => Object.values(statusCounts.value).reduce((n, v) => n + v, 0));
// 미읽음 건수(현재 목록 기준) — 범례 숫자·전체 읽음 버튼 활성 여부
const unreadNew = computed(() => items.value.filter((r) => r.unread === 'new').length);
const unreadUpdated = computed(() => items.value.filter((r) => r.unread === 'updated').length);
function toggleStatus(s: string) { const i = f.value.status.indexOf(s); if (i >= 0) f.value.status.splice(i, 1); else f.value.status.push(s); }
const groupOpts = computed(() => [
  ...groups.map((g) => ({ value: g.key, label: g.label, count: counts.value[g.key] })),
  { value: 'all', label: '전체', count: total.value },
]);
const group = computed<string | null>({
  get: () => !f.value.status.length ? 'all' : (groups.find((g) => g.statuses.length === f.value.status.length && g.statuses.every((s) => f.value.status.includes(s)))?.key ?? null),
  set: (k) => { const g = groups.find((x) => x.key === k); f.value.status = g ? [...g.statuses] : []; },
});
/** 판정 스냅샷의 데이터 케이스·연계 방식 — 짧은 라벨 */
const dataCase = (r: RequestSummary) => r.judgement?.dataCase ? DL[r.judgement.dataCase]?.label ?? r.judgement.dataCase : '-';
const integration = (r: RequestSummary) => r.judgement?.integration ? IL[r.judgement.integration]?.label ?? r.judgement.integration : '-';
const piiLabel = (r: RequestSummary) => r.judgement?.pii === 'yes' ? '포함' : r.judgement?.pii === 'no' ? '없음' : '미확인';
function open(r: RequestSummary) { router.push({ name: 'data-review', params: { id: r.id } }); }
</script>

<template>
  <DataShell>
    <div class="row-between wrap mb-lg">
      <div>
        <p class="eyebrow">데이터 협의</p>
        <h1 style="font-size:24px;margin-top:4px">데이터 요청</h1>
        <p class="text-sm text-sub mt-sm">요청자가 "행내 데이터를 읽어야 해요" 또는 "잘 모르겠어요"라고 답한 요청만 보여요. 처리 상황은 AX-BRM 담당자가 종합해서 등록해요.</p>
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
    <div v-else-if="!items.length" class="empty card"><div class="empty-emoji" aria-hidden="true"><Icon3d name="document-analytics" :size="48" /></div><div class="empty-title">조건에 맞는 데이터 요청이 없어요</div><p>필터를 바꾸거나 "전체"를 눌러보세요.</p></div>
    <template v-else>
    <UnreadLegend scope="data" :new-count="unreadNew" :updated-count="unreadUpdated" @done="load" />
    <div class="table-wrap">
      <table class="table data-table">
        <thead><tr><th>접수번호</th><th>제목</th><th>요청자 · 부서</th><th>데이터 케이스</th><th>연계 방식(초안)</th><th>개인정보</th><th>AX-BRM 담당자</th><th>상태</th><th>신청일</th><th>업데이트</th></tr></thead>
        <tbody>
          <tr v-for="r in items" :key="r.id" data-clickable tabindex="0" @click="open(r)" @keydown.enter="open(r)">
            <td class="identifier text-xs nowrap" style="word-break:normal"><span v-if="r.unread" class="unread-dot" :data-unread="r.unread" :title="UNREAD_LABEL[r.unread]" :aria-label="UNREAD_LABEL[r.unread]" style="margin-right:6px"></span>{{ r.reqNo }}</td>
            <td :class="r.unread ? 'fw-700' : 'fw-600'" style="min-width:220px;max-width:360px">{{ r.title }}</td>
            <td><div>{{ r.requester.name }}</div><div class="text-xs text-muted">{{ r.requester.orgNm || '-' }}</div></td>
            <td class="text-sm nowrap">{{ dataCase(r) }}</td>
            <td class="text-sm nowrap">{{ integration(r) }}</td>
            <td class="text-sm nowrap"><span class="badge" :data-tone="r.judgement?.pii === 'yes' ? 'warning' : 'neutral'">{{ piiLabel(r) }}</span></td>
            <td class="text-sm nowrap"><template v-if="r.assignee">{{ r.assignee.name }}<span v-if="r.assignee.position" class="text-xs text-muted"> {{ r.assignee.position }}</span></template><span v-else class="text-muted">미지정</span></td>
            <td><StatusBadge :status="r.status" size="sm" /></td>
            <td class="text-sm nowrap tnum">{{ fmtDate(r.submittedAt) }}</td>
            <td class="text-sm text-muted nowrap">{{ fmtRelative(r.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    </template>
  </DataShell>
</template>

<style scoped>
.data-table { min-width: 1120px; }
.tnum { font-variant-numeric: tabular-nums; }
</style>
