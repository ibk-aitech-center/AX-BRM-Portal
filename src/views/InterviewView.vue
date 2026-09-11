<script setup lang="ts">
import RevealButton from '@/components/RevealButton.vue';
import Icon3d from '@/components/Icon3d.vue';
/**
 * 인터뷰 — 아코디언 질문 플로우. 한 번에 한 질문만 펼침, 답하면 다음 미답 질문으로 진행.
 * 우측 사이드바: 판정 미리보기 + 알림(경고 비침투 — 질문 흐름 중간에 끼우지 않는다).
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { QUESTIONS, SECTIONS, PRESETS, QUESTIONNAIRE_VERSION, visibleQuestions, nextQuestion, isAnswered, getQuestion } from '@shared/questions.js';
import { judge } from '@shared/rules.js';
import { draft, createDraft, loadDraft, setAnswer, saveNow, resetDraft } from '@/services/draft';
import { api, humanMessage } from '@/services/api';
import { toast } from '@/services/toast';
import { fmtBytes, fmtRelative } from '@/services/format';
import type { Attachment } from '@/types';
import QuestionCard from '@/components/QuestionCard.vue';
import FileUpload from '@/components/FileUpload.vue';
import AnswerRow from '@/components/AnswerRow.vue';
import StepDots from '@/components/StepDots.vue';
import JudgementPanel from '@/components/JudgementPanel.vue';

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const error = ref('');
const editingId = ref<string | null>(null);
/** 쓰다 만 답 — 질문 카드에 입력만 하고 제출 전에 앞 답을 고치러 가면 카드가 사라지므로, 여기 보관해 두고 돌아오면 다시 채운다 */
const pending = reactive<Record<string, string>>({});

/** 초안 불러오기 — 처음 들어올 때와, 주소의 id 가 지금 열어 둔 초안과 다를 때만 (자동 저장으로 붙는 id 는 같은 초안이므로 다시 안 부른다) */
async function init() {
  loading.value = true; error.value = ''; editingId.value = null;
  try {
    const id = route.params.id as string | undefined;
    if (!id) {
      const preset = PRESETS.find((p) => p.key === route.query.preset);
      if (preset) {
        // 프리셋은 그 자체가 선택 입력이므로 바로 초안 생성
        const newId = await createDraft({ ...(preset.answers as Record<string, string>) });
        await router.replace({ name: 'interview', params: { id: newId } });
      } else {
        // 빈 시작: 첫 답변이 입력될 때 draft.ts 가 초안을 만든다 (빈 초안 방지)
        resetDraft();
      }
    } else {
      const r = await loadDraft(id);
      if (r.status !== 'draft') { router.replace({ name: 'request', params: { id } }); return; }
    }
    if (typeof route.query.edit === 'string' && getQuestion(route.query.edit)) editingId.value = route.query.edit;
  } catch (e) { error.value = humanMessage(e); }
  finally { loading.value = false; }
}
onMounted(init);
// 같은 화면 인스턴스가 유지되므로(App.vue 키 고정) id 전환은 여기서: 다른 초안 → 다시 불러오기, 새 상담(/interview) → 초기화
watch(() => route.params.id, (id) => {
  if (route.name !== 'interview') return;
  const next = typeof id === 'string' ? id : undefined;
  if (next ? next !== draft.id : draft.id !== null) init();
});

function beforeUnload(e: BeforeUnloadEvent) { if (draft.dirty) { e.preventDefault(); } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload); if (draft.dirty) saveNow(); });

const answers = computed(() => draft.answers);
const visible = computed(() => visibleQuestions(answers.value));
const next = computed(() => nextQuestion(answers.value));
const activeId = computed(() => editingId.value ?? next.value?.id ?? null);
const activeQ = computed(() => (activeId.value ? getQuestion(activeId.value) : undefined));
const complete = computed(() => !next.value && !editingId.value);

/** 렌더 목록: 활성 질문까지(활성 포함), 그 뒤 답변된 것도 표시(수정 중일 때) */
const rows = computed(() => {
  const list = visible.value;
  const out: { q: (typeof QUESTIONS)[number]; n: number; state: 'done' | 'active' }[] = [];
  list.forEach((q, i) => {
    if (q.id === activeId.value) out.push({ q, n: i + 1, state: 'active' });
    else if (isAnswered(q, answers.value[q.id])) out.push({ q, n: i + 1, state: 'done' });
  });
  return out;
});
const answeredCount = computed(() => visible.value.filter((q) => isAnswered(q, answers.value[q.id])).length);
const progress = computed(() => Math.round((answeredCount.value / Math.max(1, visible.value.length)) * 100));
const currentSection = computed(() => activeQ.value?.section ?? 'E');
const doneSections = computed(() => SECTIONS.filter((s) => visible.value.filter((q) => q.section === s.key).every((q) => isAnswered(q, answers.value[q.id]))).map((s) => s.key));
const hiddenSections = computed(() => SECTIONS.filter((s) => !visible.value.some((q) => q.section === s.key)).map((s) => s.key));

const judgement = computed(() => (answers.value.q7_kind ? judge(answers.value, QUESTIONNAIRE_VERSION) : null));

function onAnswer(qid: string, value: string) {
  setAnswer(qid, value);
  delete pending[qid];
  editingId.value = null;
}
function edit(qid: string) { editingId.value = qid; }

// q23(참고 자료) 질문에서 주관식과 함께 파일도 올릴 수 있게 — 선택 사항 (kind='reference')
const q23Files = ref<Attachment[]>([]);
async function loadQ23Files() {
  if (!draft.id) return;
  try {
    const data = await api.get<{ attachments?: Attachment[] }>(`/api/requests/${draft.id}`);
    q23Files.value = (data.attachments || []).filter((a) => a.kind === 'reference');
  } catch { /* 첨부는 선택 기능 — 조용히 넘어간다 */ }
}
async function removeQ23File(a: Attachment) {
  try { await api.del(`/api/attachments/${a.id}`); await loadQ23Files(); }
  catch (e) { toast(humanMessage(e), 'danger'); }
}
watch(activeId, (v) => { if (v === 'q23_refs') loadQ23Files(); }, { immediate: true });

const saveLabel = computed(() => draft.saving ? '저장 중…' : draft.offline ? '이 컴퓨터에 임시 저장됨' : draft.dirty ? '저장 대기' : draft.savedAt ? `저장됨 · ${fmtRelative(draft.savedAt)}` : '첫 답변부터 자동 저장돼요');
watch(() => draft.savedAt, () => { /* 상대시간 갱신 트리거 */ });
// 첫 답변으로 초안이 만들어지면 주소를 /interview/:id 로 맞춘다 (새로고침해도 이어짐)
watch(() => draft.id, (v) => { if (v && !route.params.id) router.replace({ name: 'interview', params: { id: v } }); });

async function goSummary() {
  const ok = await saveNow();
  if (!ok) { toast('저장이 끝나면 요약으로 넘어갈 수 있어요. 연결을 확인해 주세요.', 'warning'); return; }
  router.push({ name: 'summary', params: { id: draft.id! } });
}
</script>

<template>
  <div class="iv">
    <div v-if="loading" class="column center" style="padding-top:80px" role="status"><div class="spinner" style="margin:0 auto" aria-hidden="true"></div><p class="text-sub mt-md">상담을 준비하고 있어요…</p></div>
    <div v-else-if="error" class="column" style="padding-top:64px"><div class="empty"><div class="empty-emoji" aria-hidden="true">☁️</div><div class="empty-title">{{ error }}</div><button class="btn btn-primary mt-lg" @click="$router.go(0)">다시 시도</button></div></div>

    <template v-else>
      <!-- 상단 진행 -->
      <div class="iv-top no-print">
        <div class="container">
          <div class="row-between wrap" style="gap:12px">
            <StepDots :current="currentSection" :done-keys="doneSections" :hidden-keys="hiddenSections" />
            <span class="text-xs text-muted nowrap" role="status" aria-live="polite">{{ saveLabel }}</span>
          </div>
          <div class="progress mt-sm" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" :aria-label="`진행률 ${progress}%`"><span :style="{ transform: `scaleX(${progress / 100})` }"></span></div>
        </div>
      </div>

      <div class="container iv-grid">
        <!-- 질문 흐름 -->
        <div class="iv-main stack">
          <p class="text-sm text-muted">{{ answeredCount }} / {{ visible.length }} 답했어요 · 답은 언제든 ✎ 로 고칠 수 있어요</p>

          <template v-for="r in rows" :key="r.q.id">
            <QuestionCard v-if="r.state === 'active'" :question="r.q" :value="answers[r.q.id] ?? pending[r.q.id]" :number="r.n" :editing="editingId === r.q.id" @answer="onAnswer(r.q.id, $event)" @input="pending[r.q.id] = $event" @cancel="editingId = null" />
            <AnswerRow v-else :question="r.q" :value="answers[r.q.id]" :number="r.n" @edit="edit(r.q.id)" />
            <!-- q23(참고 자료)이 활성일 때만 파일 올리기 카드를 덧붙인다 -->
            <div v-if="r.state === 'active' && r.q.id === 'q23_refs' && draft.id" class="card no-print" style="padding:20px">
              <p class="text-sm fw-600"><Icon3d name="project-folder" :size="18" /> 파일로 보여주실 수 있으면 더 좋아요 <span class="badge" data-tone="neutral">선택</span></p>
              <ul v-if="q23Files.length" class="stack-sm mt-md">
                <li v-for="a in q23Files" :key="a.id" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--line);border-radius:10px">
                  <span class="grow min0"><span class="truncate" style="display:block">{{ a.fileName }}</span><span class="text-xs text-muted">{{ fmtBytes(a.size) }}</span></span>
                  <RevealButton icon="🗑" label="삭제" tone="danger" @click="removeQ23File(a)" />
                </li>
              </ul>
              <FileUpload class="mt-md" :request-id="draft.id" kind="reference" label="화면 캡처·엑셀 양식 등 올리기" hint="20MB 이하 · 없어도 괜찮아요" @uploaded="loadQ23Files" />
            </div>
          </template>

          <section v-if="complete" class="card done-card rise" aria-live="polite">
            <div class="done-emoji" aria-hidden="true"><Icon3d name="achievement-badge" :size="48" /></div>
            <h2 style="font-size:20px">모든 질문에 답했어요. 수고하셨어요!</h2>
            <p class="text-sub mt-sm">답변을 정리해서 어떤 도움이 맞는지, 얼마나 걸릴지 보여드릴게요. 신청은 그다음이에요.</p>
            <div class="row mt-lg wrap"><button class="btn btn-primary btn-lg" @click="goSummary">정리된 요약 보기 →</button><router-link to="/requests" class="btn btn-ghost">나중에 이어하기</router-link></div>
          </section>
        </div>

        <!-- 사이드바: 판정 미리보기 (경고 비침투) -->
        <aside class="iv-side no-print" aria-label="지금까지의 정리">
          <div class="side-sticky">
            <p class="eyebrow mb-sm">지금까지의 정리</p>
            <template v-if="judgement">
              <JudgementPanel :judgement="judgement" mode="side" />
              <p class="hint mt-md">답할수록 정확해져요. 확정은 AX-BRM 검토 후에 돼요.</p>
            </template>
            <div v-else class="card card-soft" style="padding:16px">
              <p class="text-sm text-sub">질문에 답할수록 여기에 <b>어떤 도움이 맞는지</b>,<br /><b>얼마나 걸릴지</b>가 정리돼요.</p>
              <p class="text-sm text-sub mt-sm">💬 모르는 건 "잘 모르겠어요"를 고르셔도 돼요.<br />AX-BRM이 검토할 때 함께 확인해요.</p>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.iv-top { position: sticky; top: 60px; z-index: 50; background: rgba(244,248,247,.94); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); padding: 12px 0; }
.iv-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; padding-top: 24px; padding-bottom: 96px; }
@media (min-width: 1080px) { .iv-grid { grid-template-columns: minmax(0, 1fr) 340px; } }
.iv-main { max-width: var(--column-max); }
.side-sticky { position: sticky; top: 132px; }
.done-card { border-color: var(--brand-300); padding: 32px; }
.done-emoji { font-size: 36px; margin-bottom: 8px; }
</style>
