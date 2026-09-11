<script setup lang="ts">
import RevealButton from '@/components/RevealButton.vue';
import Icon3d from '@/components/Icon3d.vue';
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, humanMessage } from '@/services/api';
import { toast } from '@/services/toast';
import { session } from '@/services/session';
import { QUESTIONNAIRE_VERSION, SECTIONS, visibleQuestions, nextQuestion } from '@shared/questions.js';
import { judge } from '@shared/rules.js';
import { clearMirror } from '@/services/draft';
import type { RequestFull, Attachment } from '@/types';
import { fmtBytes } from '@/services/format';
import JudgementPanel from '@/components/JudgementPanel.vue';
import AnswerRow from '@/components/AnswerRow.vue';
import FileUpload from '@/components/FileUpload.vue';
import SubmitButton from '@/components/SubmitButton.vue';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;
const req = ref<RequestFull | null>(null);
const loading = ref(true);
const error = ref('');
const submitState = ref<'idle' | 'loading' | 'done'>('idle');
const atts = ref<Attachment[]>([]);

onMounted(async () => {
  try {
    const data = await api.get<{ request: RequestFull; attachments?: Attachment[] }>(`/api/requests/${id}`);
    const request = data.request;
    if (request.status !== 'draft') { router.replace({ name: 'request', params: { id } }); return; }
    if (nextQuestion(request.answers)) { router.replace({ name: 'interview', params: { id } }); return; }
    req.value = request;
    atts.value = (data.attachments || []).filter((a) => a.kind === 'reference');
  } catch (e) { error.value = humanMessage(e); }
  finally { loading.value = false; }
});

async function reloadFiles() {
  try {
    const data = await api.get<{ attachments?: Attachment[] }>(`/api/requests/${id}`);
    atts.value = (data.attachments || []).filter((a) => a.kind === 'reference');
  } catch (e) { toast(humanMessage(e), 'danger'); }
}
async function removeFile(a: Attachment) {
  try { await api.del(`/api/attachments/${a.id}`); await reloadFiles(); }
  catch (e) { toast(humanMessage(e), 'danger'); }
}

const judgement = computed(() => (req.value ? judge(req.value.answers, QUESTIONNAIRE_VERSION) : null));
const grouped = computed(() => {
  if (!req.value) return [];
  const vis = visibleQuestions(req.value.answers);
  return SECTIONS.map((s) => ({ s, qs: vis.map((q, i) => ({ q, n: i + 1 })).filter((x) => x.q.section === s.key) })).filter((g) => g.qs.length);
});

function printPage() { window.print(); }
function edit(qid: string) { router.push({ name: 'interview', params: { id }, query: { edit: qid } }); }
/** 답변 화면으로 — 여기까지의 답은 이미 서버에 초안으로 저장돼 있다 */
function back() { router.push({ name: 'interview', params: { id } }); }
/** 지금 신청하지 않고 나가기 — 초안은 그대로 남아 홈의 "이어하기"로 돌아올 수 있다 */
function later() {
  toast('초안으로 저장해 뒀어요. 홈의 "이어하기"에서 언제든 다시 열 수 있어요', 'info');
  router.push({ name: 'home' });
}

async function submit() {
  if (!req.value) return;
  submitState.value = 'loading';
  try {
    await api.post(`/api/requests/${id}/submit`, { answers: req.value.answers });
    clearMirror(id);
    submitState.value = 'done';
    await new Promise((r) => setTimeout(r, 550)); // 체크가 그려지는 걸 보고 넘어간다
    router.push({ name: 'done', params: { id } });
  } catch (e) { submitState.value = 'idle'; toast(humanMessage(e), 'danger'); }
}
</script>

<template>
  <div class="container sv">
    <div v-if="loading" class="center" style="padding-top:80px" role="status"><div class="spinner" style="margin:0 auto" aria-hidden="true"></div></div>
    <div v-else-if="error" class="empty"><div class="empty-emoji" aria-hidden="true">☁️</div><div class="empty-title">{{ error }}</div></div>

    <template v-else-if="req && judgement">
      <div class="sv-head">
        <div class="min0">
          <p class="eyebrow">정리된 요청 · 신청 전 확인</p>
          <h1 class="serif sv-title mt-sm">{{ req.answers.q1_title }}</h1>
          <p class="text-sub mt-sm">{{ session.user?.orgNm || '' }} {{ session.user?.name }} · 아래 내용으로 AX-BRM에 신청돼요. 고칠 부분은 ✎ 로 바로 고칠 수 있어요.</p>
        </div>
        <div class="row sv-head-actions no-print">
          <button type="button" class="btn btn-ghost" @click="back">← 답변으로 돌아가기</button>
          <button type="button" class="btn btn-ghost" @click="printPage">인쇄</button>
        </div>
      </div>

      <!-- 1) 판정: 전체 폭 -->
      <section class="mt-xl" aria-labelledby="h-judge">
        <h2 id="h-judge" class="sec"><Icon3d name="credit-review" :size="22" /> 이렇게 정리됐어요 <span class="badge" data-tone="neutral">초안 — AX-BRM 검토 후 확정</span></h2>
        <JudgementPanel :judgement="judgement" mode="full" class="mt-md" />
      </section>

      <!-- 2) 답변(넓은 열) + 참고 자료(붙어 따라오는 오른쪽 열) — 인터뷰 화면과 같은 골격 -->
      <div class="sv-body mt-xl">
        <section aria-labelledby="h-answers">
          <h2 id="h-answers" class="sec"><Icon3d name="feedback-survey" :size="22" /> 내 답변 <span class="sec-count num">{{ grouped.reduce((n, g) => n + g.qs.length, 0) }}개</span></h2>
          <div v-for="g in grouped" :key="g.s.key" class="mt-lg">
            <p class="eyebrow mb-sm">{{ g.s.title }}</p>
            <div class="stack-sm">
              <AnswerRow v-for="x in g.qs" :key="x.q.id" :question="x.q" :value="req.answers[x.q.id]" :number="x.n" @edit="edit(x.q.id)" />
            </div>
          </div>
        </section>

        <aside class="sv-side">
          <div class="sv-side-sticky">
            <section class="card sv-files" aria-labelledby="h-files">
              <h2 id="h-files" class="sec sec-sm"><Icon3d name="project-folder" :size="20" /> 참고 자료 <span class="badge" data-tone="neutral">선택</span></h2>
              <p class="text-sm text-sub mt-sm">화면 캡처·엑셀 양식처럼 요청을 설명해 주는 자료가 있으면 올려주세요. 신청 후에도 추가할 수 있어요.</p>
              <ul v-if="atts.length" class="stack-sm mt-md">
                <li v-for="a in atts" :key="a.id" class="att">
                  <span class="grow min0"><span class="truncate" style="display:block">{{ a.fileName }}</span><span class="text-xs text-muted">{{ fmtBytes(a.size) }}</span></span>
                  <RevealButton class="no-print" icon="🗑" label="삭제" tone="danger" @click="removeFile(a)" />
                </li>
              </ul>
              <FileUpload class="mt-md no-print" :request-id="id" kind="reference" label="파일 올리기" hint="20MB 이하" @uploaded="reloadFiles" />
            </section>
            <p class="text-xs text-muted mt-md sv-side-note no-print">지금 신청하지 않아도 괜찮아요. 여기까지의 답은 초안으로 저장돼 있어서, 홈의 <b>이어하기</b>로 언제든 돌아올 수 있어요.</p>
          </div>
        </aside>
      </div>

      <div class="submit-bar no-print">
        <div class="container submit-bar-in">
          <div class="text-sm text-sub min0">신청하면 AX-BRM이 검토하고 <b>3~5영업일 안에</b> 의견을 남겨요. 신청 후에는 답변을 고칠 수 없지만, 문의는 남길 수 있어요.</div>
          <div class="row submit-bar-actions">
            <button type="button" class="btn btn-ghost" @click="later">나중에 신청할게요</button>
            <SubmitButton class="btn-lg" :state="submitState" @click="submit">AX-BRM에 신청하기</SubmitButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sv { padding-top: 32px; padding-bottom: 140px; }
.sv-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.sv-head-actions { flex: none; padding-top: 4px; }
.sv-title { font-size: clamp(24px, 3vw, 32px); line-height: 1.3; }
.sec { font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sec-sm { font-size: 15.5px; gap: 8px; }
.sec-count { font-size: 13px; font-weight: 600; color: var(--text-muted); }

/* 답변 열 + 오른쪽 자료 열: 인터뷰 화면(.iv-grid)과 같은 340px 사이드 */
.sv-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; } /* aside 는 stretch 여야 안쪽 sticky 가 답변 열 끝까지 따라온다 */
@media (min-width: 1080px) { .sv-body { grid-template-columns: minmax(0, 1fr) 340px; } }
.sv-side-sticky { position: sticky; top: 84px; }
.sv-files { padding: 18px 20px; }
.sv-side-note { line-height: 1.55; padding: 0 4px; }
.att { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }

.submit-bar { position: fixed; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,.96); backdrop-filter: blur(6px); border-top: 1px solid var(--line); padding: 14px 0; z-index: var(--z-panel); }
.submit-bar-in { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.submit-bar-actions { flex: none; margin-left: auto; }
@media (max-width: 640px) { .sv-head { flex-direction: column; } .sv-head-actions { padding-top: 0; } .submit-bar-actions { width: 100%; justify-content: flex-end; } }
@media print { .submit-bar { display: none; } .sv-body { grid-template-columns: 1fr; } }
</style>
