<script setup lang="ts">
/**
 * 아이콘 버튼 — 올리면(hover/키보드 포커스) 옆으로 늘어나며 뜻을 밝히는 라벨이 나온다. 놓으면 다시 아이콘만.
 * 레퍼런스: cjfromjbw "Icon swap + hover". 색은 의도(tone)로만 — danger(삭제)·brand(수정/설명)·neutral(다운로드).
 * 라벨은 늘 DOM 에 있어 접근성 이름이 되고, 터치 환경(hover 없음)에서는 아이콘만 남되 aria-label 로 읽힌다.
 */
withDefaults(defineProps<{ icon: string; label: string; tone?: 'neutral' | 'brand' | 'danger'; title?: string }>(), { tone: 'neutral' });
defineEmits<{ click: [e: MouseEvent] }>();
</script>

<template>
  <button type="button" class="btn btn-sm btn-reveal" :data-tone="tone" :aria-label="label" :title="title" @click="$emit('click', $event)">
    <span class="btn-reveal-ico" aria-hidden="true">{{ icon }}</span>
    <span class="btn-reveal-lbl" aria-hidden="true"><span>{{ label }}</span></span>
  </button>
</template>
