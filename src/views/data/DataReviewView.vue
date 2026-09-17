<script setup lang="ts">
/**
 * DATA-BRM 요청 상세 — 조회 전용. 본문은 ReadOnlyRequestDetail(그룹기획 접수현황 상세와 공용), 데이터 구간(C)만 강조한다.
 */
import DataShell from '@/components/DataShell.vue';
import ReadOnlyRequestDetail from '@/components/ReadOnlyRequestDetail.vue';
</script>

<template>
  <DataShell>
    <ReadOnlyRequestDetail back-to="/data" back-label="데이터 요청 목록" highlight-data
      notice="데이터 협의를 위한 조회 화면이에요. 의견·상태·목업은 AX-BRM 담당자가 종합해서 등록하니, 전달할 내용이 있으면 담당자에게 직접 연락해 주세요." />
  </DataShell>
</template>
