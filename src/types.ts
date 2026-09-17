import type { judge } from '@shared/rules.js';

export type Judgement = ReturnType<typeof judge>;
export type Answers = Record<string, string>;

export interface Closure { deploy: string; form: string }
export interface Person { employeeNo: string; name: string; orgCd?: string | null; orgNm?: string | null; position?: string | null; role?: string }

export interface RequestSummary {
  id: string; reqNo: string | null; title: string | null; status: string; channel: string | null;
  requester: Person; questionnaireVersion: string;
  /** 실제 진행할 AX-BRM 담당자 — null 이면 "담당자 미지정" */
  assignee: Person | null; assignedAt: string | null;
  /** 완료 처리 때 고른 종결 분류(배포 위치 · 완성 형태) — 완료 전이면 null */
  closure: Closure | null; closedAt: string | null;
  submittedAt: string | null; createdAt: string; updatedAt: string;
  /** 유효 판정 — 서버가 AX-BRM 조정(의견의 judgementOverride)을 덮어서 준다. 화면은 이 값만 보면 된다 */
  judgement: Partial<Judgement> | null;
  /** AX-BRM 이 판정을 조정했는지 — true 면 judgement 는 조정본, judgementOriginal 이 신청 시 자동 판정 */
  judgementAdjusted?: boolean;
  judgementOriginal?: Partial<Judgement> | null;
  /** 미읽음(역할 목록만) — new: 한 번도 안 연 신규 건 · updated: 열어 본 뒤 갱신된 건 · null/없음: 읽음. 서버 판정(server/unread.js) */
  unread?: 'new' | 'updated' | null;
}
export interface RequestFull extends RequestSummary { answers: Answers; judgement: Judgement | null }

export interface Review {
  id: string; reviewer: Person; decision: string; feasible: string | null; approach: string | null; opinion: string;
  estimatedWeeksMin: number | null; estimatedWeeksMax: number | null; judgementOverride: Partial<Judgement> | null; createdAt: string;
}
export interface HistoryItem { id: string; from: string | null; to: string; by: Person; note: string | null; at: string }
export interface Attachment { id: string; kind: 'mockup' | 'reference' | 'other'; fileName: string; mime: string; size: number; version: number; note: string | null; uploadedBy: Person; uploadedAt: string }
export interface Comment { id: string; author: Person; body: string; createdAt: string }

/** 담당자 지정 후보 (GET /api/requests/assignees) — 조직·직원 정렬순서로 정렬돼 온다 */
export interface AssigneeCandidate { employeeNo: string; name: string | null; position: string | null; teamNm: string | null }

export interface RequestDetail { request: RequestFull; reviews: Review[]; history: HistoryItem[]; attachments: Attachment[]; comments: Comment[] }

export interface StatBucket { key: string; n: number; label?: string }
/** 부서별 버킷 — 건수 + 진행 상황 분해(대기 / 진행(보완 요청 포함) / 완료·종결 / 반려) */
export interface OrgBucket extends StatBucket { awaiting: number; active: number; closed: number; stalled: number }
/** 담당자별 버킷 — key 는 사번(미지정 묶음은 'none'), 완료 건수·목업 제공 건수·평균 완료 소요일 */
export interface AssigneeBucket extends OrgBucket { name: string; position: string | null; done: number; mockups: number; avgDoneDays: number | null }
/** 완료 건 종결 분류 통계 — 분류 배열은 고정 순서(빈 칸도 0), matrix[배포 위치][완성 형태] */
export interface ClosureStats {
  done: number; classified: number; withMockup: number; withoutMockup: number;
  byDeploy: StatBucket[]; byForm: StatBucket[]; matrix: number[][];
}
export interface Stats {
  range: { from: string; to: string };
  totals: { submitted: number; open: number; done: number; guided: number; awaiting: number; stalled: number; avgFirstReviewDays: number | null; avgDoneDays: number | null };
  byMonth: StatBucket[]; byStatus: StatBucket[]; byOrg: OrgBucket[]; byChannel: StatBucket[];
  byTrack: StatBucket[]; byDataCase: StatBucket[]; byIntegration: StatBucket[];
  byAssignee: AssigneeBucket[]; closure: ClosureStats;
}
/** 접수함 필터 메타 (GET /api/requests/meta) */
export interface InboxMeta { orgs: { name: string; count: number }[]; assignees: { employeeNo: string; name: string | null; position: string | null; count: number }[]; unassigned: number }
