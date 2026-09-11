<script setup lang="ts">
import { computed } from 'vue';

/**
 * 3D 아이콘 — 이모지 대체용 로컬 번들 이미지 (폐쇄망: 외부 의존성 0).
 * 원본: 사내 제작 3D 아이콘 세트 → src/assets/icons3d/*.png (96px 리사이즈).
 * 장식 용도이므로 기본 alt="" + aria-hidden. 의미가 있으면 alt 를 넘겨줄 것.
 */
const props = withDefaults(defineProps<{ name: string; size?: number; alt?: string }>(), { size: 22, alt: '' });

const ICONS = import.meta.glob('../assets/icons3d/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const src = computed(() => ICONS[`../assets/icons3d/${props.name}.png`] || '');
</script>

<template>
  <img v-if="src" :src="src" :width="size" :height="size" :alt="alt" :aria-hidden="alt ? undefined : 'true'" class="i3d" draggable="false" />
</template>

<style scoped>
.i3d { display: inline-block; vertical-align: -0.18em; object-fit: contain; flex: none; }
</style>
