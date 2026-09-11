<script setup lang="ts">
/**
 * 히어로 루프 영상 — 클레이 캐릭터 두 명(현업 요청자 · AX-BRM 담당자)의 상담 장면 12초, 끊김 없이 반복
 *
 * 이야기(한 주기): 고민(메모·턱 괴기) → 번뜩(전구) → 노트북 위로 서비스 화면 시안이 떠오름 → 함께 보며 끄덕임 → 다시 처음 자세.
 *        첫 프레임과 마지막 프레임이 같은 자세라 loop 경계에서 튀지 않는다. 자막·글자는 영상 안에도 밖에도 두지 않는다 —
 *        장면만으로 "아이디어를 들고 오면 함께 서비스로 만든다"가 읽히게 한다.
 * 파일:  src/assets/hero/hero-loop.mp4 (H.264, 960×640, 3:2, 무음) · hero-poster.jpg (첫 프레임). 폐쇄망: 외부 의존성 0.
 * 배경:  영상 배경이 페이지 캔버스(--bg)와 같은 색이라 카드·테두리 없이 그대로 놓고, 가장자리만 mask 로 흐려 사각 경계를 지운다.
 *        3:2 비율을 먼저 잡아(CLS 0) 로딩 전에도 자리가 움직이지 않고, poster 가 먼저 보인다.
 * 재생:  autoplay muted loop playsinline — 모바일 사파리 포함 자동 재생 조건. preload="auto" 로 첫 루프 전에 전체를 받아 경계 hitch 를 줄인다.
 * 접근성: 컨테이너가 role="img" 하나로 장면을 설명(aria-label). video 는 장식(aria-hidden). controls 없음.
 *        prefers-reduced-motion 이면 <source> 자체를 넣지 않아 다운로드도 재생도 하지 않고 poster(정지 화면)만 보여준다.
 */
import { onMounted, ref } from 'vue';
import heroVideo from '@/assets/hero/hero-loop.mp4';
import heroPoster from '@/assets/hero/hero-poster.jpg';

const DESCRIPTION = '현업 담당자와 AX-BRM 담당자가 마주 앉아 아이디어를 이야기하고, 노트북 위로 서비스 화면 시안이 떠오르면 함께 확인하는 장면';

const reduceMotion = ref(false);
const video = ref<HTMLVideoElement | null>(null);

onMounted(() => {
  reduceMotion.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // 일부 브라우저는 autoplay 속성만으로 시작하지 않는 경우가 있어 한 번 더 재생을 시도한다 (muted 라 정책상 허용). 실패는 조용히 무시 — poster 가 남는다.
  if (!reduceMotion.value) video.value?.play().catch(() => {});
});
</script>

<template>
  <div class="hs" role="img" :aria-label="DESCRIPTION">
    <div class="hs-stage">
      <video
        ref="video"
        class="hs-video"
        :poster="heroPoster"
        width="960"
        height="640"
        autoplay
        muted
        loop
        playsinline
        disablepictureinpicture
        disableremoteplayback
        preload="auto"
        aria-hidden="true"
        tabindex="-1"
      >
        <source v-if="!reduceMotion" :src="heroVideo" type="video/mp4" />
      </video>
    </div>
  </div>
</template>

<style scoped>
.hs {
  --fade: 8%;
  width: 100%;
  max-width: 560px;
  background: var(--bg);
}
/* 무대 — 3:2(960×640)로 높이를 먼저 잡아 CLS 0. 세로 페이드는 여기, 가로 페이드는 video 에 — 두 겹으로 교차해 네 변을 모두 흐린다 */
.hs-stage {
  position: relative;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  background: var(--bg);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 var(--fade), #000 calc(100% - var(--fade)), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 var(--fade), #000 calc(100% - var(--fade)), transparent 100%);
}
.hs-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  background: var(--bg);
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--fade), #000 calc(100% - var(--fade)), transparent 100%);
  mask-image: linear-gradient(to right, transparent 0, #000 var(--fade), #000 calc(100% - var(--fade)), transparent 100%);
}
</style>
