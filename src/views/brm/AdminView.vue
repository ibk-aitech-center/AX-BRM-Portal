<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { api, humanMessage } from '@/services/api';
import { toast } from '@/services/toast';
import { isAdmin, session } from '@/services/session';
import type { User } from '@/services/session';
import BrmShell from '@/components/BrmShell.vue';
import SegControl from '@/components/SegControl.vue';
import type { SegOption } from '@/components/SegControl.vue';
import { fmtDate, fmtRelative } from '@/services/format';

type Row = User & { deptCd: string | null; deptNm: string | null; teamCd: string | null; teamNm: string | null; ducd: string | null; ogznAttcd: string | null; createdAt: string | null; lastLoginAt: string | null; provisioned: boolean };
interface RoleRules {
  admin: { teamCodes: string[]; deptHeads: { deptCode: string; ducd: string; label: string }[]; initialSeed: string[]; seededAt: string | null };
  brm: { deptCodes: string[] };
  dataBrm?: { manual: boolean };
  /** 상담 요청 자격 — 미러 조직속성코드(본부부서) 목록 */
  hq: { ogznAttcds: string[] };
}
const rules = ref<RoleRules | null>(null);

/** HR 인사 미러 상태 + 수동 미러링 */
interface SyncResult { ok: boolean; skipped?: boolean; fetched: number; excluded: number; mirrored: number; updatedUsers: number; adminGranted?: number; brmGranted: number; brmRevoked: number; brmProvisioned?: number; durationMs: number; error: string | null; trigger: string; finishedAt: string }
interface SyncStatus { count: number; syncedAt: string | null; inFlight: boolean; source: 'hr-db' | 'mock'; scheduled: boolean; staleHours: number; last: SyncResult | null }
const sync = ref<SyncStatus | null>(null);
const syncing = ref(false);
async function loadSync() {
  try { sync.value = await api.get<SyncStatus>('/api/admin/hr-sync'); } catch { /* 패널만 생략 */ }
}
async function runSync() {
  if (syncing.value) return;
  syncing.value = true;
  try {
    const { result, status } = await api.post<{ result: SyncResult; status: SyncStatus }>('/api/admin/hr-sync');
    sync.value = status;
    if (result.skipped) toast('HR DB 연결 정보가 없어 미러링을 건너뛰었어요', 'warning');
    else if (result.ok) { toast(`미러링 완료 — ${result.mirrored.toLocaleString()}명, 직원 정보 ${result.updatedUsers}건 갱신, 관리자 부여 ${result.adminGranted ?? 0}, AX-BRM 부여 ${result.brmGranted}·회수 ${result.brmRevoked}, 사전 등록 ${result.brmProvisioned ?? 0}`, 'success'); await load(); }
    else toast(`미러링 실패 — ${result.error}`, 'danger');
  } catch (e) { toast(humanMessage(e), 'danger'); }
  finally { syncing.value = false; }
}
const TRIGGER: Record<string, string> = { schedule: '자동(07:00)', empty: '기동 시(미러 비어 있음)', stale: '기동·로그인 시(오래됨)', manual: '수동' };
const triggerLabel = (t: string) => t.startsWith('manual:') ? `수동 (${t.slice(7)})` : TRIGGER[t] ?? t;
const users = ref<Row[]>([]);
const q = ref('');
/** 역할 필터 — '' 이면 전체. 검색어와 AND 로 서버에서 거른다. 세그먼트로 고르면 바로 다시 조회 */
const roleFilter = ref('');
const loading = ref(true);
const ROLE: Record<string, string> = { requester: '일반 사용자', brm: 'AX-BRM', data_brm: 'DATA-BRM (조회 전용)', admin: '관리자' };
const roleOpts: SegOption[] = [{ value: '', label: '전체' }, { value: 'admin', label: '관리자' }, { value: 'brm', label: 'AX-BRM' }, { value: 'data_brm', label: 'DATA-BRM' }, { value: 'requester', label: '일반 사용자' }];
watch(roleFilter, () => load());

async function load() {
  loading.value = true;
  try { users.value = (await api.get<{ users: Row[] }>(`/api/admin/users?q=${encodeURIComponent(q.value)}&role=${encodeURIComponent(roleFilter.value)}`)).users; }
  catch (e) { toast(humanMessage(e), 'danger'); }
  finally { loading.value = false; }
}
onMounted(() => {
  load();
  loadSync();
  api.get<RoleRules>('/api/admin/role-rules').then((r) => { rules.value = r; }).catch(() => { /* 안내 패널만 생략 */ });
});
// ── 일괄 변경: 검색 결과에서 체크한 직원들에게 같은 역할을 한 번에 (팀·부서 단위 부여용)
const selected = ref(new Set<string>());
const bulkRole = ref('');
const bulkBusy = ref(false);
const allChecked = computed(() => users.value.length > 0 && users.value.every((u) => selected.value.has(u.employeeNo)));
function toggleOne(empNo: string) { const n = new Set(selected.value); if (n.has(empNo)) n.delete(empNo); else n.add(empNo); selected.value = n; }
function toggleAll() { selected.value = allChecked.value ? new Set() : new Set(users.value.map((u) => u.employeeNo)); }
/** 검색어가 바뀌어 목록이 새로 오면 선택은 비운다 — 안 보이는 사람에게 권한이 가는 사고 방지 */
watch(users, () => { selected.value = new Set(); });
async function bulkApply() {
  const list = users.value.filter((u) => selected.value.has(u.employeeNo));
  if (!list.length || !bulkRole.value || bulkBusy.value) return;
  const label = ROLE[bulkRole.value];
  const names = list.slice(0, 5).map((u) => u.name).join(', ') + (list.length > 5 ? ` 외 ${list.length - 5}명` : '');
  if (!window.confirm(`${list.length}명(${names})의 역할을 "${label}"(으)로 바꿀까요?`)) return;
  bulkBusy.value = true;
  try {
    const r = await api.post<{ changed: number; provisioned: number; skipped: { employeeNo: string; reason: string }[] }>('/api/admin/users/bulk-role', { employeeNos: list.map((u) => u.employeeNo), role: bulkRole.value });
    const parts = [`${r.changed + r.provisioned}명 → ${label}`];
    if (r.provisioned) parts.push(`미접속 ${r.provisioned}명은 새로 등록`);
    if (r.skipped.length) parts.push(`건너뜀 ${r.skipped.length}명 (${r.skipped.map((x) => x.reason).filter((v, i, a) => a.indexOf(v) === i).join(' · ')})`);
    toast(parts.join(' · '), r.skipped.length ? 'warning' : 'success');
    await load();
  } catch (e) { toast(humanMessage(e), 'danger'); }
  finally { bulkBusy.value = false; }
}

// ── 신청 데이터 전체 초기화 (오픈 전 리얼테스트 데이터 정리) — 확인 문구를 정확히 입력해야 실행된다
type ResetCounts = Record<string, number>;
const resetOpen = ref(false);
const resetInfo = ref<{ counts: ResetCounts; confirmWord: string } | null>(null);
const resetWord = ref('');
const resetBusy = ref(false);
const RESET_LABEL: Record<string, string> = { requests: '요청', request_reviews: '검토 의견', status_history: '상태 이력', comments: '문의·대화', attachments: '첨부', counters: '접수번호 카운터' };
async function openReset() {
  resetOpen.value = true; resetWord.value = '';
  try { resetInfo.value = await api.get('/api/admin/reset-requests'); } catch (e) { toast(humanMessage(e), 'danger'); resetOpen.value = false; }
}
const resetReady = computed(() => !!resetInfo.value && resetWord.value.trim() === resetInfo.value.confirmWord && !resetBusy.value);
async function runReset() {
  if (!resetReady.value) return;
  resetBusy.value = true;
  try {
    const r = await api.post<{ counts: ResetCounts; filesRemoved: number; filesTotal: number; nextReqNo: string }>('/api/admin/reset-requests', { confirm: resetWord.value.trim() });
    toast(`신청 데이터를 모두 지웠어요 — 요청 ${r.counts.requests}건 · 첨부 파일 ${r.filesRemoved}개 · 다음 접수번호는 ${r.nextReqNo}`, 'success', { ms: 8000 });
    resetOpen.value = false; resetInfo.value = null; resetWord.value = '';
  } catch (e) { toast(humanMessage(e), 'danger'); }
  finally { resetBusy.value = false; }
}

async function setRole(u: Row, role: string) {
  const prev = u.role;
  u.role = role as User['role'];
  try { await api.put(`/api/admin/users/${u.employeeNo}/role`, { role }); u.provisioned = true; toast(`${u.name} → ${ROLE[role]}${prev === role ? '' : ''}`, 'success'); }
  catch (e) { u.role = prev; toast(humanMessage(e), 'danger'); }
}
</script>

<template>
  <BrmShell>
    <div class="mb-lg">
      <p class="eyebrow">담당자 관리</p><h1 style="font-size:24px;margin-top:4px">역할</h1>
      <p class="text-sm text-sub mt-sm">HR 인사 미러의 전 직원이 로그인 전부터 등록돼 있어요(기본 목록은 200명까지 — <b>이름·사번·부서로 검색</b>하세요). 역할을 주면 그 직원의 첫 로그인부터 적용돼요. 역할 변경은 관리자만 할 수 있어요.</p>
    </div>
    <!-- HR 인사 미러 — 마지막 동기화 시각과 수동 미러링 버튼 -->
    <div v-if="sync" class="card mb-lg sync-card">
      <div class="sync-main">
        <div class="row" style="gap:8px;align-items:baseline">
          <span class="fw-600">HR 인사 미러</span>
          <span class="badge" :data-tone="sync.source === 'hr-db' ? 'brand' : 'neutral'" style="font-size:11.5px">{{ sync.source === 'hr-db' ? '인사 DB' : '개발용 목업' }}</span>
        </div>
        <div class="text-sm mt-sm">
          최근 미러링
          <template v-if="sync.syncedAt"><b class="num">{{ fmtDate(sync.syncedAt, true) }}</b> <span class="text-muted">({{ fmtRelative(sync.syncedAt) }})</span></template>
          <b v-else style="color:#A23425">아직 없음</b>
          · 직원 <b class="num">{{ sync.count.toLocaleString() }}</b>명
          <template v-if="sync.last"> · 마지막 실행 {{ triggerLabel(sync.last.trigger) }}
            <span v-if="sync.last.ok" style="color:var(--success)">성공</span>
            <span v-else style="color:#A23425">실패 — {{ sync.last.error }}</span>
          </template>
        </div>
        <p class="text-xs text-muted mt-sm" style="margin-bottom:0">
          <template v-if="sync.scheduled">매일 07:00 KST 자동으로 미러링해요. </template>
          서비스가 재기동될 때는 미러가 비어 있거나 {{ sync.staleHours }}시간 넘게 지났을 때만 다시 가져와요. 미러링하면 직책과 관리자·AX-BRM 권한이 규칙대로 다시 계산돼요.
        </p>
      </div>
      <button v-if="isAdmin" type="button" class="btn btn-secondary" :disabled="syncing || sync.inFlight" @click="runSync">
        <span v-if="syncing || sync.inFlight" class="spinner" style="width:14px;height:14px;border-width:2px" aria-hidden="true"></span>
        {{ syncing || sync.inFlight ? '미러링 중…' : '지금 미러링' }}
      </button>
    </div>
    <details v-if="rules" open class="card mb-lg" style="padding:16px 20px">
      <summary style="cursor:pointer;font-weight:600">권한이 정해지는 규칙 <span class="text-sm text-sub" style="font-weight:400">— 관리자·AX-BRM 은 HR 미러 규칙으로 자동, DATA-BRM 은 수기</span></summary>
      <div class="mt-sm text-sm" style="line-height:1.7">
        <p class="fw-600 mt-sm">관리자 권한 · HR 인사 미러가 동기화될 때마다(매일 07:00 등) 자동으로 부여돼요</p>
        <ul style="margin:4px 0 0;padding-left:18px">
          <li v-for="c in rules.admin.teamCodes" :key="c">팀코드 <code class="identifier">{{ c }}</code> 의 전 직원 (부서 무관)</li>
          <li v-for="d in rules.admin.deptHeads" :key="d.deptCode + d.ducd">부서코드 <code class="identifier">{{ d.deptCode }}</code> 의 {{ d.label }} (직책코드 <code class="identifier">{{ d.ducd }}</code>)</li>
        </ul>
        <p class="text-sub" style="margin-top:4px">관리자는 <b>자동으로 회수되지 않아요</b> — 조직을 옮긴 관리자는 이 화면에서 직접 내려 주세요. 최초 등록 관리자({{ rules.admin.initialSeed.join(', ') }}<template v-if="rules.admin.seededAt"> — {{ fmtDate(rules.admin.seededAt, true) }} 완료</template>)도 그대로 유지돼요.</p>
        <p class="fw-600 mt-md">AX-BRM 권한 · 같은 동기화에서 자동으로 다시 계산돼요</p>
        <ul style="margin:4px 0 0;padding-left:18px">
          <li v-for="c in rules.brm.deptCodes" :key="c">부서코드 <code class="identifier">{{ c }}</code> 의 전 직원 — 단, 위 관리자 규칙에 해당하는 직원은 관리자</li>
        </ul>
        <p class="text-sub" style="margin-top:6px">규칙에 해당하면 AX-BRM 으로 부여되고, 벗어나면 일반 사용자로 되돌아가요. 미러링 때 <b>전 직원이 로그인 전에 미리 등록</b>되고, 규칙에 맞는 직원은 첫 로그인부터 그 역할이에요.
          여기서 수기로 AX-BRM 을 주거나 일반 사용자로 내려도 <strong>다음 동기화 때 규칙대로 다시 계산</strong>돼요. DATA-BRM 권한은 자동으로 바뀌지 않아요.</p>
        <p class="fw-600 mt-md">상담 요청 자격 · 본부부서 직원만 (역할과 무관)</p>
        <p class="text-sub" style="margin-top:4px">HR 미러의 <b>조직속성코드</b>가 <template v-for="(c, i) in rules.hq.ogznAttcds" :key="c"><code class="identifier">{{ c }}</code><template v-if="i < rules.hq.ogznAttcds.length - 1"> · </template></template> 인 직원만 상담을 요청할 수 있어요.
          그 외(영업점 등)는 로그인은 되지만 안내만 보고 요청을 만들 수 없어요. 미러에 없는 직원도 요청 불가예요. 아래 표의 "조직속성" 열에서 확인할 수 있어요.</p>
        <p class="fw-600 mt-md">DATA-BRM 권한 · 수기로만 관리해요 (조회 전용)</p>
        <p class="text-sub" style="margin-top:4px">데이터 담당 부서 직원에게 이 화면에서 부여해요. "행내 데이터가 필요한가요?"에 <b>네</b> 또는 <b>잘 모르겠어요</b>로 답한 요청만 "데이터 요청" 메뉴에서 <b>조회</b>할 수 있고(AX-BRM 의견·목업·첨부·대화·이력 포함), 의견·상태 등록은 할 수 없어요. 그런 요청이 접수될 때 메신저 알림을 받아요. HR 동기화가 이 권한을 바꾸지 않아요.</p>
        <p class="mt-md" style="color:#A23425"><strong>⚠ 조직개편·담당자 변경 시:</strong> 위 소속코드·직책코드나 담당 체계가 바뀌면
          서버 설정(<code class="identifier">server/hrSync.js</code> 의 <code class="identifier">ADMIN_TEAM_CODES</code> · <code class="identifier">ADMIN_DEPT_HEAD_RULES</code> · <code class="identifier">BRM_DEPT_CODES</code>)을 함께 바꿔 주세요.
          그대로 두면 새 담당자는 권한을 받지 못하고, 이전 조직 인원이 계속 관리자·AX-BRM 권한을 유지해요.</p>
      </div>
    </details>
    <!-- 필터 바 — 왼쪽 역할 세그먼트(즉시 적용), 오른쪽 검색(Enter 또는 버튼). 접수함 필터 카드와 같은 문법 -->
    <div class="card filters mb-md" data-testid="user-filters">
      <SegControl v-model="roleFilter" :options="roleOpts" size="sm" aria-label="역할 필터" data-testid="role-filter" />
      <form class="search" role="search" @submit.prevent="load">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input v-model="q" class="input search-input" placeholder="이름·사번·부서·팀 검색" aria-label="검색" />
        <button v-if="q" type="button" class="search-clear" aria-label="검색어 지우기" @click="q = ''; load()">×</button>
        <button type="submit" class="btn btn-sm search-btn">검색</button>
      </form>
    </div>
    <div v-if="loading" class="center" style="padding:48px" role="status"><div class="spinner" style="margin:0 auto" aria-hidden="true"></div></div>
    <template v-else>
    <!-- 일괄 변경 툴바 — 검색으로 팀·부서를 추린 뒤, 체크한 직원에게 역할을 한 번에 -->
    <div v-if="isAdmin && users.length" class="card bulk-bar mb-md" data-testid="bulk-bar">
      <label class="row text-sm" style="gap:8px"><input type="checkbox" :checked="allChecked" :indeterminate="selected.size > 0 && !allChecked" aria-label="전체 선택" @change="toggleAll" /> 목록 전체 선택 <span class="text-muted">({{ users.length }}명)</span></label>
      <span class="text-sm"><b class="num">{{ selected.size }}</b>명 선택</span>
      <select v-model="bulkRole" class="select" style="min-height:36px;padding:6px 10px;width:auto" aria-label="일괄 적용할 역할" data-testid="bulk-role">
        <option value="" disabled>바꿀 역할 선택</option>
        <option v-for="(l, k) in ROLE" :key="k" :value="k">{{ l }}</option>
      </select>
      <button class="btn btn-primary btn-sm" :disabled="!selected.size || !bulkRole || bulkBusy" data-testid="bulk-apply" @click="bulkApply">{{ bulkBusy ? '변경 중…' : '선택한 직원 역할 일괄 변경' }}</button>
      <span class="text-xs text-muted">팀·부서명으로 검색해 추린 뒤 전체 선택하면 그 조직 전원에게 한 번에 줄 수 있어요. 관리자·AX-BRM 은 다음 미러링 때 규칙대로 다시 계산돼요.</span>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th v-if="isAdmin" style="width:32px"><span class="sr-only">선택</span></th><th>이름</th><th>사번</th><th>부서코드</th><th>부서명</th><th>팀코드</th><th>팀명</th><th>직책</th><th>직책코드</th><th title="HR 미러 조직속성코드 — 본부부서 코드면 상담을 요청할 수 있어요">조직속성</th><th>역할</th><th class="num">최근 로그인</th></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.employeeNo" :data-selected="selected.has(u.employeeNo)">
            <td v-if="isAdmin"><input type="checkbox" :checked="selected.has(u.employeeNo)" :aria-label="`${u.name} 선택`" @change="toggleOne(u.employeeNo)" /></td>
            <td class="fw-600">{{ u.name }}<span v-if="u.employeeNo === session.user?.employeeNo" class="text-xs text-muted"> (나)</span><span v-if="!u.provisioned" class="badge" data-tone="neutral" style="margin-left:6px;font-size:10.5px;padding:1px 6px" title="아직 로그인하지 않은 직원 — 역할을 주면 등록돼요">미접속</span></td>
            <td class="identifier text-sm">{{ u.employeeNo }}</td>
            <td class="identifier text-sm">{{ u.deptCd || '-' }}</td>
            <td class="text-sm">{{ u.deptNm || '-' }}</td>
            <td class="identifier text-sm">{{ u.teamCd || '-' }}</td>
            <td class="text-sm">{{ u.teamNm || '-' }}</td>
            <td class="text-sm">{{ u.position || '-' }}</td>
            <td class="identifier text-sm">{{ u.ducd || '-' }}</td>
            <!-- 조직속성코드 + 요청 자격 — 영업점 등 비대상 직원이 왜 요청을 못 하는지 이 열에서 바로 읽힌다 (2026-09-11) -->
            <td class="text-sm nowrap"><span class="identifier">{{ u.ogznAttcd || '-' }}</span> <span class="badge" :data-tone="u.canRequest ? 'success' : 'neutral'" style="margin-left:4px;font-size:10.5px;padding:1px 6px" :title="u.canRequest ? '본부부서 — 상담 요청 가능' : (u.ogznAttcd ? '본부부서 아님 — 상담 요청 불가' : 'HR 미러에 없음 — 상담 요청 불가')">{{ u.canRequest ? '요청 가능' : '요청 불가' }}</span></td>
            <td>
              <select v-if="isAdmin" class="select" style="min-height:36px;padding:6px 10px;width:auto" :value="u.role" :aria-label="`${u.name} 역할`" @change="setRole(u, ($event.target as HTMLSelectElement).value)">
                <option v-for="(l, k) in ROLE" :key="k" :value="k">{{ l }}</option>
              </select>
              <span v-else class="badge" :data-tone="u.role === 'requester' ? 'neutral' : 'brand'">{{ ROLE[u.role] }}</span>
            </td>
            <td class="text-sm num">{{ u.lastLoginAt ? fmtDate(u.lastLoginAt, true) : '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    </template>

    <!-- 위험 구역 — 신청 데이터 전체 초기화. 관리자만, 확인 문구 입력 후. 단건 삭제와 달리 접수번호 카운터까지 되감는다 -->
    <details v-if="isAdmin" class="card danger mt-lg" data-testid="danger-zone">
      <summary style="cursor:pointer;font-weight:600">신청 데이터 전체 초기화 <span class="text-sm text-sub" style="font-weight:400">— 서비스 오픈 전 리얼테스트 데이터 정리용</span></summary>
      <div class="mt-sm text-sm" style="line-height:1.7">
        <p class="text-sub">요청·검토 의견·상태 이력·문의·첨부 파일을 모두 지우고 <b>접수번호 카운터도 되감아</b> 다음 신청이 <code class="identifier">BRM-{{ new Date().getFullYear() }}-0001</code> 부터 시작해요.
          단건 삭제는 번호를 되감지 않아서 이미 지운 건의 번호가 비어 보였을 거예요 — 이 초기화가 그 번호도 정리해요.
          직원 역할·HR 미러는 남아요. <strong>되돌릴 수 없으니</strong> DB 백업 후 실행하세요.</p>
        <button v-if="!resetOpen" class="btn btn-sm danger-btn mt-sm" data-testid="reset-open" @click="openReset">초기화 준비…</button>
        <div v-else class="danger-confirm mt-sm" data-testid="reset-confirm">
          <p class="fw-600">지금 지워질 데이터</p>
          <ul v-if="resetInfo" class="danger-counts">
            <li v-for="(n, k) in resetInfo.counts" :key="k"><span class="text-sub">{{ RESET_LABEL[k] || k }}</span><b class="num">{{ n.toLocaleString() }}</b></li>
          </ul>
          <p v-else class="text-muted">건수 확인 중…</p>
          <label class="text-sm" style="display:block;margin-top:10px">확인을 위해 <code class="identifier">{{ resetInfo?.confirmWord || '초기화' }}</code> 라고 입력하세요
            <input v-model="resetWord" class="input" style="max-width:220px;min-height:36px;padding:6px 10px;margin-top:6px;display:block" :placeholder="resetInfo?.confirmWord || '초기화'" aria-label="초기화 확인 문구" data-testid="reset-word" @keydown.enter="runReset" />
          </label>
          <div class="row mt-sm" style="gap:8px">
            <button class="btn btn-sm danger-btn" :disabled="!resetReady" data-testid="reset-run" @click="runReset">{{ resetBusy ? '지우는 중…' : '전체 초기화 실행' }}</button>
            <button class="btn btn-sm btn-ghost" :disabled="resetBusy" @click="resetOpen = false">취소</button>
          </div>
        </div>
      </div>
    </details>
  </BrmShell>
</template>

<style scoped>
.sync-card { display: flex; align-items: center; gap: 20px; padding: 16px 20px; }
/* 필터 바: 세그먼트는 왼쪽, 검색은 오른쪽 끝. 좁으면 세로로 쌓이고 검색이 전체 폭 */
.filters { display: flex; align-items: center; justify-content: space-between; gap: 12px 16px; flex-wrap: wrap; padding: 10px 12px; }
.search { position: relative; display: flex; align-items: center; gap: 6px; flex: 0 1 340px; min-width: 240px; }
.search-icon { position: absolute; left: 12px; color: var(--text-muted); pointer-events: none; }
.search-input { flex: 1 1 auto; min-height: 36px; padding: 6px 30px 6px 36px; font-size: 13.5px; }
.search-clear { position: absolute; right: 64px; width: 22px; height: 22px; border: 0; border-radius: 50%; background: var(--surface-2); color: var(--text-sub); font-size: 15px; line-height: 1; cursor: pointer; }
.search-clear:hover { background: var(--line); color: var(--text); }
.search-btn { flex: none; min-height: 36px; }
@media (max-width: 720px) { .filters { align-items: stretch; } .search { flex: 1 1 100%; } }
/* 위험 구역 — 붉은 톤은 여기서만. 카드 왼쪽 굵은 선으로 다른 패널과 구분 */
.danger { padding: 16px 20px; border-left: 4px solid #A23425; }
.danger-btn { background: #A23425; color: #fff; }
.danger-btn:hover:not(:disabled) { background: #8A2A1E; }
.danger-btn:disabled { opacity: .45; }
.danger-confirm { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-2); border: 1px solid var(--line); max-width: 560px; }
.danger-counts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px 16px; margin: 6px 0 0; padding: 0; list-style: none; }
.danger-counts li { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dashed var(--line); padding: 3px 0; }
.bulk-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 16px; }
tr[data-selected="true"] td { background: var(--accent-soft); }
.sync-main { flex: 1 1 auto; min-width: 0; }
.sync-card .btn { flex: none; display: inline-flex; align-items: center; gap: 8px; }
@media (max-width: 640px) { .sync-card { flex-direction: column; align-items: stretch; } }
</style>
