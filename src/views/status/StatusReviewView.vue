<script setup lang="ts">
/**
 * 그룹기획 접수현황 상세 — 조회 전용. 본문은 ReadOnlyRequestDetail(DATA-BRM 상세와 공용), 구간 강조 없이 전부 같은 무게로 보여 준다.
 */
import StatusShell from '@/components/StatusShell.vue';
import ReadOnlyRequestDetail from '@/components/ReadOnlyRequestDetail.vue';
</script>

<template>
  <StatusShell>
    <ReadOnlyRequestDetail back-to="/status" back-label="접수현황 목록"
      notice="접수현황을 살펴보는 조회 화면이에요. 의견·상태·목업은 AX-BRM 담당자가 등록하니, 전달할 내용이 있으면 담당자에게 직접 연락해 주세요." />
  </StatusShell>
</template>
