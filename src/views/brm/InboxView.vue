<script setup lang="ts">
import Icon3d from '@/components/Icon3d.vue';
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api, humanMessage } from '@/services/api';
import type { RequestSummary, InboxMeta } from '@/types';
import { STATUS, STATUS_ORDER, CHANNEL_LABEL } from '@shared/statuses.js';
import { TRACK_LABEL, leadtimeText } from '@shared/rules.js';
import BrmShell from '@/components/BrmShell.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import SegControl from '@/components/SegControl.vue';
import ComboSelect from '@/components/ComboSelect.vue';
import type { ComboOption } from '@/components/ComboSelect.vue';
import { fmtDate, fmtRelative } from '@/services/format';

const router = useRouter();
const route = useRoute();
const items = ref<RequestSummary[]>([]);
const orgs = ref<InboxMeta['orgs']>([]);
// 담당자 필터 후보 — 실제 지정된 적 있는 담당자만(건수 순) + 미지정 건수
const assignees = ref<InboxMeta['assignees']>([]);
const unassigned = ref(0);
const loading = ref(true);
const error = ref('');
// 통계 화면의 "접수함 열기 →" 같은 진입은 ?status=submitted,hold 로 상태 조건을 걸어 들어온다 — 그 조건으로 바로 걸러 보여 준다 (2026-09-08)
const statusFromQuery = () => String(route.query.status || '').split(',').map((s) => s.trim()).filter((s) => s && s in STATUS);
const assigneeFromQuery = () => String(route.query.assignee || ''); // 'none'(미지정) 또는 사번
const f = ref({ status: statusFromQuery(), org: '', channel: '', track: '', assignee: assigneeFromQuery(), q: '', from: '', to: '' });
watch(() => [route.query.status, route.query.assignee], () => { f.value.status = statusFromQuery(); f.value.assignee = assigneeFromQuery(); });
const S = STATUS as Record<string, { label: string }>;
const CH = CHANNEL_LABEL as Record<string, string>;
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
    const p = new URLSearchParams({ scope: 'all' });
    if (f.value.status.length) p.set('status', f.value.status.join(','));
    if (f.value.org) p.set('org', f.value.org);
    if (f.value.channel) p.set('channel', f.value.channel);
    if (f.value.track) p.set('track', f.value.track);
    if (f.value.assignee) p.set('assignee', f.value.assignee); // 사번 또는 'none'(미지정)
    if (f.value.q) p.set('q', f.value.q);
    if (f.value.from) p.set('from', new Date(f.value.from).toISOString());
    if (f.value.to) { const t = new Date(f.value.to); t.setDate(t.getDate() + 1); p.set('to', t.toISOString()); }
    const [a, m] = await Promise.all([api.get<{ items: RequestSummary[] }>(`/api/requests?${p}`), api.get<InboxMeta>('/api/requests/meta')]);
    items.value = a.items; orgs.value = m.orgs; assignees.value = m.assignees ?? []; unassigned.value = m.unassigned ?? 0;
  } catch (e) { error.value = humanMessage(e); }
  finally { loading.value = false; }
}
onMounted(load);
let t: ReturnType<typeof setTimeout>;
watch(f, () => { clearTimeout(t); t = setTimeout(load, 300); }, { deep: true });

// 조회 조건 콤보 옵션 — 타이핑으로 걸러 고를 수 있게 (부서·담당자는 건수 같이)
const orgOpts = computed<ComboOption[]>(() => orgs.value.map((o) => ({ value: o.name, label: o.name, count: o.count })));
const channelOpts = computed<ComboOption[]>(() => Object.entries(CH).map(([k, l]) => ({ value: k, label: l })));
const trackOpts = computed<ComboOption[]>(() => Object.entries(TRACK_LABEL).map(([k, l]) => ({ value: k, label: l.label })));
const assigneeOpts = computed<ComboOption[]>(() => [
  { value: 'none', label: '담당자 미지정', count: unassigned.value },
  ...assignees.value.map((a) => ({ value: a.employeeNo, label: `${a.name || a.employeeNo}${a.position ? ' ' + a.position : ''}`, count: a.count, keywords: a.employeeNo })),
]);
const counts = computed(() => Object.fromEntries(groups.map((g) => [g.key, items.value.filter((r) => g.statuses.includes(r.status)).length])));
function toggleStatus(s: string) { const i = f.value.status.indexOf(s); if (i >= 0) f.value.status.splice(i, 1); else f.value.status.push(s); }
function setGroup(g: typeof groups[number]) { f.value.status = [...g.statuses]; }
// 상단 묶음 선택은 단일 선택 — 세그먼트 컨트롤. 상세 상태 칩을 손으로 섞어 고르면 어느 묶음도 아님(null)
const groupOpts = computed(() => [
  ...groups.map((g) => ({ value: g.key, label: g.label, count: counts.value[g.key] })),
  { value: 'all', label: '전체', count: items.value.length },
]);
const group = computed<string | null>({
  get: () => !f.value.status.length ? 'all' : (groups.find((g) => g.statuses.length === f.value.status.length && g.statuses.every((s) => f.value.status.includes(s)))?.key ?? null),
  set: (k) => { const g = groups.find((x) => x.key === k); if (g) setGroup(g); else f.value.status = []; },
});
function open(r: RequestSummary) { router.push({ name: 'review', params: { id: r.id } }); }
</script>

<template>
  <BrmShell>
    <div class="row-between wrap mb-lg">
      <div><p class="eyebrow">접수함</p><h1 style="font-size:24px;margin-top:4px">요청 검토</h1></div>
      <SegControl v-model="group" :options="groupOpts" aria-label="상태 묶음" />
    </div>

    <div class="card filters mb-md">
      <div class="row wrap" style="gap:6px">
        <button v-for="s in statusChips" :key="s" class="chip" style="min-height:32px;font-size:12.5px" :aria-pressed="f.status.includes(s)" @click="toggleStatus(s)">{{ S[s].label }}</button>
      </div>
      <div class="row wrap mt-md" style="gap:10px">
        <input v-model="f.q" class="input" style="min-height:40px;padding:8px 12px;max-width:260px" placeholder="제목·접수번호·요청자 검색" aria-label="검색" />
        <ComboSelect v-model="f.org" :options="orgOpts" placeholder="모든 부서" label="요청부서" data-testid="filter-org" />
        <ComboSelect v-model="f.channel" :options="channelOpts" placeholder="모든 계기" label="요청 계기" data-testid="filter-channel" />
        <ComboSelect v-model="f.track" :options="trackOpts" placeholder="모든 유형" label="지원 유형" data-testid="filter-track" />
        <ComboSelect v-model="f.assignee" :options="assigneeOpts" placeholder="모든 담당자" label="AX-BRM 담당자" width="200px" data-testid="filter-assignee" />
        <label class="row text-sm text-sub">신청일 <input v-model="f.from" type="date" class="input" style="min-height:40px;padding:6px 10px;width:auto" aria-label="시작일" /> ~ <input v-model="f.to" type="date" class="input" style="min-height:40px;padding:6px 10px;width:auto" aria-label="종료일" /></label>
      </div>
    </div>

    <div v-if="loading" class="center" style="padding:48px" role="status"><div class="spinner" style="margin:0 auto" aria-hidden="true"></div></div>
    <div v-else-if="error" class="empty card"><div class="empty-emoji" aria-hidden="true">☁️</div><div class="empty-title">{{ error }}</div><button class="btn btn-secondary mt-md" @click="load">다시 불러오기</button></div>
    <div v-else-if="!items.length" class="empty card"><div class="empty-emoji" aria-hidden="true"><Icon3d name="inbox-mail" :size="48" /></div><div class="empty-title">조건에 맞는 요청이 없어요</div><p>필터를 바꾸거나 "전체"를 눌러보세요.</p></div>
    <div v-else class="table-wrap">
      <table class="table inbox-table">
        <thead><tr><th>접수번호</th><th>제목</th><th>요청자 · 부서</th><th>계기</th><th>지원 유형</th><th title="요건 확정 후 개발 예상 기간 · 참고용 초안">개발 예상(요건 확정 후)</th><th>담당자</th><th>상태</th><th>신청일</th><th>업데이트</th></tr></thead>
        <tbody>
          <tr v-for="r in items" :key="r.id" data-clickable tabindex="0" @click="open(r)" @keydown.enter="open(r)">
            <td class="identifier text-xs nowrap" style="word-break:normal">{{ r.reqNo }}</td>
            <td class="fw-600" style="min-width:220px;max-width:360px">{{ r.title }}</td>
            <td><div>{{ r.requester.name }}</div><div class="text-xs text-muted">{{ r.requester.orgNm || '-' }}</div></td>
            <td class="text-sm nowrap">{{ CH[r.channel || ''] || '-' }}</td>
            <td class="text-sm nowrap">{{ r.judgement?.track ? TRACK_LABEL[r.judgement.track].label : '-' }}<span v-if="r.judgementAdjusted" class="badge adj" data-tone="brand" :title="`신청 시 자동 판정: ${r.judgementOriginal?.track ? TRACK_LABEL[r.judgementOriginal.track].label : '-'} → AX-BRM 이 조정`">조정</span></td>
            <td class="text-sm nowrap tnum">{{ leadtimeText(r.judgement?.leadtime ?? null) }}</td>
            <td class="text-sm nowrap"><template v-if="r.assignee">{{ r.assignee.name }}<span v-if="r.assignee.position" class="text-xs text-muted"> {{ r.assignee.position }}</span></template><span v-else class="text-muted">미지정</span></td>
            <td><StatusBadge :status="r.status" size="sm" /></td>
            <td class="text-sm nowrap tnum">{{ fmtDate(r.submittedAt) }}</td>
            <td class="text-sm text-muted nowrap">{{ fmtRelative(r.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </BrmShell>
</template>

<style scoped>
/* 좁은 폭에서는 열을 짓누르지 않고 가로 스크롤로 넘긴다 (table-wrap 이 overflow-x: auto) */
.inbox-table { min-width: 1060px; }
/* 예상·신청일은 다른 텍스트 열과 같이 왼쪽 정렬 — 오른쪽 정렬이면 이웃 열에 붙어 열 경계가 흐트러진다. 숫자 폭만 고정 */
.tnum { font-variant-numeric: tabular-nums; }
/* 판정 조정 표시 — 셀 값 뒤에 작은 배지. 마우스를 올리면 신청 시 자동 판정이 보인다 */
.adj { margin-left: 6px; font-size: 10.5px; padding: 1px 6px; vertical-align: 1px; }
</style>
