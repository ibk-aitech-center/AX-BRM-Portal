<script setup lang="ts">
/**
 * 히어로 일러스트 — 아이소메트릭 4막 (인라인 SVG, 에셋 0)
 *
 * 이야기: ① 아이디어와 상담이 모인다 → ② 진행 방안이 정리된다(중간 산출물) → ③ 완성된 서비스가 된다 → ④ 결국 중요한 것은 아이디어.
 *  ① 전달   왼쪽 앞 '현업' 판(사람) 에서 가는 선 세 가닥이 'AX-BRM' 유리 상자로 이어지고, 그 선을 따라 아이디어(전구)·상담(말풍선)·메모 꾸러미가
 *           차례로 건너가 유리 안으로 스며든다. 꾸러미가 닿을 때마다 상자 속 빛이 한 번 밝아지고, 안에서 빛 알갱이가 떠오른다.
 *  ② 정리   기둥 위에 얇은 판이 세 장씩 쌓인 스택 셋 — 상담 요약·진행 방안·일정. 모인 것이 "형태"를 갖춘 단계.
 *  ③ 완성   가운데 기둥 위에 서비스 화면(타이틀바·사이드바·KPI·차트), 양옆 기둥에 보조 화면, 위로 완료 배지가 떠 있다.
 *  ④ 여운   모든 것이 물러나고 작은 단 위에 전구 하나만 남아 천천히 켜진다. 빛의 파문이 번지고 "중요한 것은, 아이디어입니다".
 *           앞의 세 막(4.5초)보다 길게 머문다(7.5초) — 마지막 인상이 남도록.
 * 전환: 장면의 요소들이 아래에서 차례로 떠올라(살짝 시차) 자리를 잡고, 다음 장면으로 넘어갈 때 위로 옅어지며 사라진다.
 *       한 주기 21초 = 4.5 + 4.5 + 4.5 + 7.5. 기둥은 아래로 갈수록 투명해져 바닥 없이 공중에 떠 있는 느낌.
 * 좌표: 월드(x,y,z) → 화면 sx = OX + (x−y)·cos30°, sy = OY + (x+y)/2 − z. 판 윗면 위 그림은 topT() 로 같은 평면에 얹는다.
 *       x 는 화면 오른쪽 아래로, y 는 왼쪽 아래로 흐르고, 보이는 옆면은 x+w 쪽(오른쪽)과 y+d 쪽(왼쪽).
 * 색: 브랜드 청록 1색의 진하기(윗면 밝음 → 오른면 → 왼면 어둠)로 입체를 만들고, 노란 전구만 따뜻한 강조.
 * 접근성: 장식이므로 aria-hidden. prefers-reduced-motion 이면 ④ 마지막 장면(전구)만 정지 화면으로 보여준다.
 */

type Box = { x: number; y: number; z: number; w: number; d: number; h: number };
type Plate = { b: Box; top: string; l: string; r: string; rx?: number };

const OX = 260;
const OY = 172;
const COS = 0.866;
const px = (x: number, y: number) => OX + (x - y) * COS;
const py = (x: number, y: number, z: number) => OY + (x + y) * 0.5 - z;
const P = (x: number, y: number, z: number) => `${px(x, y).toFixed(1)},${py(x, y, z).toFixed(1)}`;
/** 상자의 보이는 세 면(윗면·왼면·오른면) — 폴리곤 points 문자열 */
const faces = (b: Box) => ({
  top: [P(b.x, b.y, b.z + b.h), P(b.x + b.w, b.y, b.z + b.h), P(b.x + b.w, b.y + b.d, b.z + b.h), P(b.x, b.y + b.d, b.z + b.h)].join(' '),
  left: [P(b.x, b.y + b.d, b.z), P(b.x + b.w, b.y + b.d, b.z), P(b.x + b.w, b.y + b.d, b.z + b.h), P(b.x, b.y + b.d, b.z + b.h)].join(' '),
  right: [P(b.x + b.w, b.y, b.z), P(b.x + b.w, b.y + b.d, b.z), P(b.x + b.w, b.y + b.d, b.z + b.h), P(b.x + b.w, b.y, b.z + b.h)].join(' '),
});
/** 월드 (x,y,z) 를 원점으로 하는 윗면 평면 변환 — 자식은 (u,v) 2D 좌표로 그린다 */
const topT = (x: number, y: number, z: number) => `matrix(${COS} .5 -${COS} .5 ${px(x, y).toFixed(1)} ${py(x, y, z).toFixed(1)})`;

// 재질 — 흰 판(윗면 그라디언트·옆면 두 톤), 강조 판(청록)
const WHITE = { top: 'url(#hd-plate)', l: '#C3D9D7', r: '#DBE9E7' };
const ACCENT = { top: 'url(#hd-accent)', l: 'var(--brand-700)', r: 'var(--brand-500)' };
const plate = (b: Box, m = WHITE, rx = 4): Plate => ({ b, ...m, rx });

/* ── ① 전달: 현업 판 → AX-BRM 유리 상자 ─────────────────────── */
const GLASS: Box = { x: -34, y: -34, z: 4, w: 68, d: 68, h: 34 };
const GLASS_BASE = plate({ x: -34, y: -34, z: 0, w: 68, d: 68, h: 4 });
const GLASS_LID = plate({ x: -34, y: -34, z: 38, w: 68, d: 68, h: 6 }, ACCENT, 6);
// 보내는 쪽: 왼쪽 앞의 '현업' 판. 뒤쪽 모서리(y=100)에서 상자 앞왼면(y=34)까지 세 가닥 선이 이어진다
const SENDER = plate({ x: -16, y: 100, z: 0, w: 36, d: 30, h: 4 }, WHITE, 4);
const LANES = [-9, 2, 13];
const PKT_DUR = 2.4; // 꾸러미 하나가 건너가는 시간(초). 세 가닥이 0.8초 시차로 출발해 0.8초마다 하나씩 상자에 닿는다
const PACKETS = (['bulb', 'chat', 'memo'] as const).map((icon, i) => {
  const lane = LANES[i];
  return {
    icon, i,
    line: `M${px(lane, 100)} ${py(lane, 100, 3)} L${px(lane, 34)} ${py(lane, 34, 3)}`,
    // 꾸러미는 바닥보다 조금 떠서(z=9) 판 뒤에서 출발해 유리 안(y=20)까지 들어간 뒤 사라진다
    path: `M${px(lane, 98)} ${py(lane, 98, 9)} L${px(lane, 20)} ${py(lane, 20, 9)}`,
    begin: `${(i * 0.8).toFixed(1)}s`,
  };
});
// 원점 기준 윗면 투영 — 위치는 animateMotion 이 준다
const FLAT = `matrix(${COS} .5 -${COS} .5 0 0)`;
const LABEL_USER = `translate(${px(-12, 128).toFixed(1)} ${py(-12, 128, 36).toFixed(1)})`; // 판의 앞왼쪽 위 — 선 가닥과 겹치지 않게
const LABEL_BRM = `translate(${px(0, 0).toFixed(1)} ${py(0, 0, 66).toFixed(1)})`;
// 상자 안에서 떠오르는 빛 알갱이(화면 좌표)
const SPARKS = [[238, 176], [262, 190], [280, 170], [250, 200], [272, 206]];

/* ── ② 정리: 기둥 위 판 스택 셋 ────────────────────────────── */
const STACK = 40;
const PILLAR_H = 96;
const STACKS = [
  { x: -64, y: 64, z: 70, icon: 'doc' },
  { x: 16, y: 16, z: 56, icon: 'flow' },
  { x: 96, y: -32, z: 42, icon: 'cal' },
].map((s, i) => ({
  ...s, i,
  pillar: faces({ x: s.x, y: s.y, z: s.z - PILLAR_H, w: STACK, d: STACK, h: PILLAR_H }),
  plates: [0, 1, 2].map((k) => plate({ x: s.x, y: s.y, z: s.z + k * 9, w: STACK, d: STACK, h: 4 })),
  topZ: s.z + 2 * 9 + 4,
}));

/* ── ③ 완성: 서비스 화면 + 보조 화면 ───────────────────────── */
const MAIN: Box = { x: -18, y: -6, z: 50, w: 96, d: 72, h: 5 };
const MAIN_PILLAR = faces({ ...MAIN, z: MAIN.z - 100, h: 100 });
const SIDE = [
  { b: { x: -68, y: 64, z: 76, w: 40, d: 32, h: 4 } as Box, kind: 'list' },
  { b: { x: 78, y: -64, z: 90, w: 40, d: 32, h: 4 } as Box, kind: 'bars' },
].map((s) => ({ ...s, pillar: faces({ ...s.b, z: s.b.z - 80, h: 80 }), plate: plate(s.b) }));
const BARS = [12, 20, 16, 26, 30];

/* ── ④ 여운: 작은 단 위의 전구 ─────────────────────────────── */
const STAND: Box = { x: -17, y: -17, z: 30, w: 34, d: 34, h: 5 };
const STAND_PILLAR = faces({ ...STAND, z: STAND.z - 70, h: 70 });
const BULB = { x: px(0, 0), y: py(0, 0, STAND.z + STAND.h) }; // 전구 밑동이 놓이는 화면 좌표
const MOTES = [[-58, -34], [52, -46], [-70, 12], [66, 4], [-36, -70], [40, -78]]; // 전구 둘레에 떠도는 빛 알갱이(전구 기준 상대 좌표)

// 장면 시작 시각 — 마지막 막만 7.5초
const STARTS = ['0s', '4.5s', '9s', '13.5s'];
const CAPTIONS = ['아이디어와 상담이 AX-BRM에 모이면', '진행 방안이 정리되고', '서비스가 되어 돌아옵니다'];
</script>

<template>
  <svg viewBox="0 0 520 340" class="hero-doodle" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="hd-stage" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FBF8F1" /><stop offset=".55" stop-color="var(--brand-50)" /><stop offset="1" stop-color="var(--brand-100)" />
      </linearGradient>
      <pattern id="hd-stripes" width="40" height="8" patternUnits="userSpaceOnUse">
        <rect width="20" height="8" fill="#fff" opacity=".38" />
      </pattern>
      <radialGradient id="hd-fade-g" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#fff" /><stop offset=".62" stop-color="#fff" /><stop offset="1" stop-color="#000" />
      </radialGradient>
      <mask id="hd-fade"><rect width="520" height="340" fill="url(#hd-fade-g)" /></mask>

      <linearGradient id="hd-plate" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFFFFF" /><stop offset="1" stop-color="#EEF5F4" />
      </linearGradient>
      <linearGradient id="hd-accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--brand-300)" /><stop offset="1" stop-color="var(--brand-500)" />
      </linearGradient>
      <linearGradient id="hd-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity=".7" /><stop offset=".55" stop-color="#FFFFFF" stop-opacity=".25" /><stop offset="1" stop-color="var(--brand-300)" stop-opacity=".55" />
      </linearGradient>
      <linearGradient id="hd-pillar-l" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--brand-300)" stop-opacity=".62" /><stop offset=".85" stop-color="var(--brand-300)" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="hd-pillar-r" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--brand-300)" stop-opacity=".38" /><stop offset=".85" stop-color="var(--brand-300)" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="hd-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="var(--brand-300)" stop-opacity=".7" /><stop offset="1" stop-color="var(--brand-300)" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="hd-bulb" cx="40%" cy="35%" r="70%">
        <stop offset="0" stop-color="#FFFBE6" /><stop offset=".55" stop-color="#F9E27A" /><stop offset="1" stop-color="#E9C246" />
      </radialGradient>
      <radialGradient id="hd-bulb-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#F9E27A" stop-opacity=".6" /><stop offset=".6" stop-color="#F9E27A" stop-opacity=".18" /><stop offset="1" stop-color="#F9E27A" stop-opacity="0" />
      </radialGradient>
      <filter id="hd-shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#0F3A3C" flood-opacity=".12" />
      </filter>
    </defs>

    <!-- 무대: 세로 줄무늬가 비치는 옅은 파스텔, 가장자리는 페이지로 스며든다 -->
    <g mask="url(#hd-fade)">
      <rect width="520" height="340" fill="url(#hd-stage)" />
      <rect width="520" height="340" fill="url(#hd-stripes)" />
    </g>

    <!-- 장면 셋 — 무대 가운데를 기준으로 조금 키워 놓는다 -->
    <g transform="translate(260 168) scale(1.18) translate(-260 -168)">
    <!-- ① 수집 -->
    <g class="scene s0" :style="{ '--start': STARTS[0] }">
      <!-- 현업 → AX-BRM 으로 이어지는 선과, 선을 따라 건너가는 아이디어·상담 꾸러미 -->
      <g class="rise" style="--k:2">
        <path v-for="p in PACKETS" :key="'l' + p.i" :d="p.line" fill="none" stroke="var(--brand-300)" stroke-width="1" stroke-linecap="round" opacity=".7" />
        <g v-for="p in PACKETS" :key="'p' + p.i" opacity="0">
          <animateMotion :path="p.path" :dur="PKT_DUR + 's'" repeatCount="indefinite" :begin="p.begin" calcMode="spline" keySplines=".45 0 .55 1" keyTimes="0;1" keyPoints="0;1" />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.8;1" :dur="PKT_DUR + 's'" repeatCount="indefinite" :begin="p.begin" />
          <ellipse cy="10" rx="9" ry="4" fill="var(--brand-700)" opacity=".1" />
          <g :transform="FLAT + ' translate(-9 -9)'">
            <rect width="18" height="18" rx="3.5" fill="#fff" stroke="var(--brand-100)" stroke-width=".8" />
            <g transform="translate(9 9) scale(.9) translate(-10 -10)">
              <template v-if="p.icon === 'bulb'">
                <circle cx="10" cy="8.5" r="4.2" fill="#F9E27A" stroke="#E3B93A" stroke-width=".8" />
                <rect x="8" y="13" width="4" height="3" rx="1" fill="var(--ink-500)" />
              </template>
              <template v-else-if="p.icon === 'chat'">
                <path d="M4 8 a3 3 0 0 1 3 -3 h6 a3 3 0 0 1 3 3 v3 a3 3 0 0 1 -3 3 h-4 l-3 2.6 v-2.6 a3 3 0 0 1 -2 -3 z" fill="var(--brand-500)" />
                <circle v-for="dx in [7.5, 10, 12.5]" :key="dx" :cx="dx" cy="9.5" r=".9" fill="#fff" />
              </template>
              <template v-else>
                <rect x="5" y="4" width="10" height="12" rx="1.5" fill="#fff" stroke="var(--ink-300)" stroke-width=".8" />
                <rect x="7" y="7" width="6" height="1.2" rx=".6" fill="var(--ink-300)" /><rect x="7" y="9.6" width="6" height="1.2" rx=".6" fill="var(--ink-300)" /><rect x="7" y="12.2" width="4" height="1.2" rx=".6" fill="var(--ink-300)" />
              </template>
            </g>
          </g>
        </g>
      </g>
      <!-- 유리 상자 -->
      <g class="rise" style="--s:0; --k:0" filter="url(#hd-shadow)">
        <polygon :points="faces(GLASS_BASE.b).left" :fill="GLASS_BASE.l" />
        <polygon :points="faces(GLASS_BASE.b).right" :fill="GLASS_BASE.r" />
        <g :transform="topT(GLASS_BASE.b.x, GLASS_BASE.b.y, 4)"><rect :width="68" :height="68" rx="4" :fill="GLASS_BASE.top" /></g>
        <ellipse :cx="px(0, 0)" :cy="py(0, 0, 12)" rx="50" ry="24" fill="url(#hd-halo)">
          <!-- 꾸러미가 닿을 때(0.8초마다) 상자 속 빛이 한 번 밝아진다 -->
          <animate attributeName="opacity" values=".75;.75;1;.75" keyTimes="0;.5;.62;1" dur=".8s" begin=".7s" repeatCount="indefinite" />
        </ellipse>
        <g class="sparks">
          <circle v-for="(s, i) in SPARKS" :key="i" :cx="s[0]" :cy="s[1]" r="1.9" fill="#fff" :style="{ '--k': i }" />
        </g>
        <polygon :points="faces(GLASS).left" fill="url(#hd-glass)" stroke="#fff" stroke-width="1" stroke-opacity=".9" />
        <polygon :points="faces(GLASS).right" fill="url(#hd-glass)" stroke="#fff" stroke-width="1" stroke-opacity=".9" />
        <polygon :points="faces(GLASS_LID.b).left" :fill="GLASS_LID.l" />
        <polygon :points="faces(GLASS_LID.b).right" :fill="GLASS_LID.r" />
        <g :transform="topT(GLASS_LID.b.x, GLASS_LID.b.y, 44)">
          <rect width="68" height="68" rx="6" :fill="GLASS_LID.top" />
          <circle v-for="(c, i) in [[11, 11], [57, 11], [11, 57], [57, 57]]" :key="i" :cx="c[0]" :cy="c[1]" r="4.5" fill="#fff" stroke="var(--brand-100)" stroke-width="1" />
          <!-- 뚜껑 가운데 AX-BRM 스파크 -->
          <path d="M34 22 C35.5 30 38 32.5 46 34 C38 35.5 35.5 38 34 46 C32.5 38 30 35.5 22 34 C30 32.5 32.5 30 34 22 Z" fill="#fff" opacity=".92" />
        </g>
      </g>
      <!-- 보내는 쪽: 현업 판 -->
      <g class="rise" style="--k:3" filter="url(#hd-shadow)">
        <polygon :points="faces(SENDER.b).left" :fill="SENDER.l" />
        <polygon :points="faces(SENDER.b).right" :fill="SENDER.r" />
        <g :transform="topT(SENDER.b.x, SENDER.b.y, 4)">
          <rect :width="SENDER.b.w" :height="SENDER.b.d" rx="4" :fill="SENDER.top" />
          <!-- 사람 — 머리·어깨, 앞의 작은 서류 -->
          <circle cx="16" cy="11" r="4.6" fill="var(--ink-500)" />
          <path d="M6.5 26 a9.5 8.5 0 0 1 19 0 z" fill="var(--ink-500)" />
          <rect x="23" y="14" width="8" height="10" rx="1.2" fill="#fff" stroke="var(--brand-500)" stroke-width=".9" />
          <rect x="25" y="17" width="4" height="1" rx=".5" fill="var(--brand-500)" /><rect x="25" y="19.5" width="4" height="1" rx=".5" fill="var(--brand-500)" />
        </g>
      </g>
      <!-- 역할 라벨: 누가 보내고(현업) 누가 받는지(AX-BRM) -->
      <g :transform="LABEL_USER"><g class="rise tag" style="--k:5">
        <rect x="-16" y="-8" width="32" height="16" rx="8" fill="#fff" stroke="var(--ink-200)" stroke-width="1" />
        <text y="3.4" text-anchor="middle" class="tag-ink">현업</text>
      </g></g>
      <g :transform="LABEL_BRM"><g class="rise tag" style="--k:6">
        <rect x="-22" y="-8" width="44" height="16" rx="8" fill="var(--brand-700)" />
        <text y="3.4" text-anchor="middle" class="tag-brand">AX-BRM</text>
      </g></g>
    </g>

    <!-- ② 정리 -->
    <g class="scene s1" :style="{ '--start': STARTS[1] }">
      <g v-for="s in STACKS" :key="s.i" class="rise" :style="{ '--s': 1, '--k': s.i * 2 }">
        <polygon :points="s.pillar.left" fill="url(#hd-pillar-l)" />
        <polygon :points="s.pillar.right" fill="url(#hd-pillar-r)" />
        <g filter="url(#hd-shadow)">
          <template v-for="(p, k) in s.plates" :key="k">
            <polygon :points="faces(p.b).left" :fill="p.l" />
            <polygon :points="faces(p.b).right" :fill="p.r" />
            <g :transform="topT(p.b.x, p.b.y, p.b.z + p.b.h)"><rect :width="STACK" :height="STACK" rx="4" :fill="p.top" /></g>
          </template>
        </g>
        <g :transform="topT(s.x, s.y, s.topZ)">
          <template v-if="s.icon === 'doc'">
            <rect x="12" y="9" width="16" height="22" rx="2" fill="#fff" stroke="var(--brand-300)" stroke-width="1" />
            <rect x="15" y="14" width="10" height="1.8" rx=".9" fill="var(--brand-500)" /><rect x="15" y="18.5" width="10" height="1.8" rx=".9" fill="var(--brand-300)" /><rect x="15" y="23" width="7" height="1.8" rx=".9" fill="var(--brand-300)" />
          </template>
          <template v-else-if="s.icon === 'flow'">
            <path d="M10 20 H30" stroke="var(--brand-300)" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="10" cy="20" r="3.6" fill="var(--brand-500)" /><circle cx="20" cy="20" r="3.6" fill="var(--brand-300)" /><circle cx="30" cy="20" r="3.6" fill="#fff" stroke="var(--brand-500)" stroke-width="1.6" />
          </template>
          <template v-else>
            <rect x="11" y="10" width="18" height="18" rx="2.5" fill="#fff" stroke="var(--brand-300)" stroke-width="1" />
            <path d="M11 12.5 a2.5 2.5 0 0 1 2.5 -2.5 h13 a2.5 2.5 0 0 1 2.5 2.5 v3 h-18 z" fill="var(--brand-500)" />
            <rect v-for="(c, i) in [[14, 18], [19, 18], [24, 18], [14, 23], [19, 23]]" :key="i" :x="c[0]" :y="c[1]" width="3" height="3" rx=".8" :fill="i === 4 ? 'var(--brand-500)' : 'var(--brand-100)'" />
          </template>
        </g>
      </g>
    </g>

    <!-- ③ 완성 -->
    <g class="scene s2" :style="{ '--start': STARTS[2] }">
      <g v-for="(s, i) in SIDE" :key="i" class="rise" :style="{ '--s': 2, '--k': 2 + i * 2 }">
        <polygon :points="s.pillar.left" fill="url(#hd-pillar-l)" />
        <polygon :points="s.pillar.right" fill="url(#hd-pillar-r)" />
        <g filter="url(#hd-shadow)">
          <polygon :points="faces(s.b).left" :fill="s.plate.l" />
          <polygon :points="faces(s.b).right" :fill="s.plate.r" />
          <g :transform="topT(s.b.x, s.b.y, s.b.z + s.b.h)">
            <rect :width="s.b.w" :height="s.b.d" rx="3" :fill="s.plate.top" />
            <path :d="`M0 3 a3 3 0 0 1 3 -3 h${s.b.w - 6} a3 3 0 0 1 3 3 v4 h-${s.b.w} z`" fill="var(--brand-300)" />
            <template v-if="s.kind === 'list'">
              <rect v-for="(w, k) in [26, 20, 23]" :key="k" x="6" :y="12 + k * 6" :width="w" height="2.4" rx="1.2" :fill="k === 0 ? 'var(--brand-500)' : 'var(--ink-200)'" />
            </template>
            <template v-else>
              <rect v-for="(h, k) in [8, 13, 10, 17]" :key="k" :x="7 + k * 8" :y="29 - h" width="5" :height="h" rx="1" :fill="k === 3 ? 'var(--brand-500)' : 'var(--brand-300)'" />
            </template>
          </g>
        </g>
      </g>
      <g class="rise" style="--s:2; --k:0">
        <polygon :points="MAIN_PILLAR.left" fill="url(#hd-pillar-l)" />
        <polygon :points="MAIN_PILLAR.right" fill="url(#hd-pillar-r)" />
        <g filter="url(#hd-shadow)">
          <polygon :points="faces(MAIN).left" :fill="WHITE.l" />
          <polygon :points="faces(MAIN).right" :fill="WHITE.r" />
          <g :transform="topT(MAIN.x, MAIN.y, MAIN.z + MAIN.h)">
            <rect :width="MAIN.w" :height="MAIN.d" rx="4" :fill="WHITE.top" />
            <!-- 타이틀바 · 사이드바 · 본문 -->
            <path :d="`M0 4 a4 4 0 0 1 4 -4 h${MAIN.w - 8} a4 4 0 0 1 4 4 v6 h-${MAIN.w} z`" fill="var(--brand-500)" />
            <circle v-for="dx in [6, 11, 16]" :key="dx" :cx="dx" cy="5" r="1.5" fill="#fff" opacity=".85" />
            <rect x="0" y="10" width="22" :height="MAIN.d - 10" fill="var(--brand-50)" />
            <rect v-for="k in 4" :key="k" x="5" :y="12 + k * 6" :width="k === 1 ? 12 : 9" height="2.2" rx="1.1" :fill="k === 1 ? 'var(--brand-500)' : 'var(--ink-200)'" />
            <rect x="28" y="16" width="40" height="4" rx="2" fill="var(--ink-500)" />
            <rect x="28" y="23" width="26" height="2.4" rx="1.2" fill="var(--ink-200)" />
            <g class="kpi">
              <rect x="28" y="30" width="29" height="13" rx="3" fill="#fff" stroke="var(--ink-200)" stroke-width=".8" />
              <rect x="32" y="35" width="14" height="3" rx="1.5" fill="var(--brand-500)" />
              <rect x="61" y="30" width="29" height="13" rx="3" fill="#fff" stroke="var(--ink-200)" stroke-width=".8" />
              <rect x="65" y="35" width="10" height="3" rx="1.5" fill="var(--brand-300)" />
            </g>
            <path d="M28 66 H90" stroke="var(--ink-200)" stroke-width=".8" />
            <rect v-for="(h, k) in BARS" :key="k" class="bar" :x="30 + k * 12" :y="66 - h" width="8" :height="h" rx="1.5" :fill="k === 4 ? 'var(--brand-500)' : 'var(--brand-300)'" :style="{ '--k': k }" />
          </g>
        </g>
        <!-- 완료 배지 — 화면 오른쪽 위 모서리 위로 떠 있다 -->
        <g class="badge" :transform="`translate(${px(MAIN.x + MAIN.w, MAIN.y).toFixed(1)} ${py(MAIN.x + MAIN.w, MAIN.y, MAIN.z + 34).toFixed(1)})`">
          <g class="float">
            <circle r="13" fill="var(--brand-500)" stroke="#fff" stroke-width="2.5" />
            <path d="M-6 0 L-2 4 L6 -4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
          </g>
        </g>
      </g>
    </g>

    <!-- ④ 여운 — 전구 하나 -->
    <g class="scene s3" :style="{ '--start': STARTS[3] }">
      <g class="rise rise-long" style="--k:0">
        <polygon :points="STAND_PILLAR.left" fill="url(#hd-pillar-l)" />
        <polygon :points="STAND_PILLAR.right" fill="url(#hd-pillar-r)" />
        <g filter="url(#hd-shadow)">
          <polygon :points="faces(STAND).left" :fill="WHITE.l" />
          <polygon :points="faces(STAND).right" :fill="WHITE.r" />
          <g :transform="topT(STAND.x, STAND.y, STAND.z + STAND.h)"><rect :width="STAND.w" :height="STAND.d" rx="4" :fill="WHITE.top" /></g>
        </g>
      </g>
      <g :transform="`translate(${BULB.x.toFixed(1)} ${BULB.y.toFixed(1)})`"><g class="rise rise-long" style="--k:3">
        <!-- 빛의 파문 — 전구가 켜진 뒤 바닥 평면으로 번진다 -->
        <g class="ripples">
          <ellipse v-for="i in 3" :key="i" cx="0" cy="0" rx="30" ry="15" fill="none" stroke="var(--brand-300)" stroke-width="1" :style="{ '--k': i - 1 }" />
        </g>
        <!-- 전구 — 밑동이 (0,0), 유리구는 위쪽 -->
        <g class="bulb">
          <circle class="bulb-glow" cx="0" cy="-42" r="44" fill="url(#hd-bulb-glow)" />
          <g class="rays" fill="none" stroke="#E3B93A" stroke-width="1.8" stroke-linecap="round">
            <path v-for="(a, i) in [-150, -115, -80, -45, -10]" :key="i" :d="`M${(Math.cos(a * Math.PI / 180) * 36).toFixed(1)} ${(-42 + Math.sin(a * Math.PI / 180) * 36).toFixed(1)} L${(Math.cos(a * Math.PI / 180) * 44).toFixed(1)} ${(-42 + Math.sin(a * Math.PI / 180) * 44).toFixed(1)}`" :style="{ '--k': i }" />
          </g>
          <rect x="-7" y="-6" width="14" height="6" rx="2" fill="var(--ink-500)" />
          <rect x="-9" y="-16" width="18" height="11" rx="3" fill="var(--ink-300)" />
          <path d="M-9 -12 H9 M-9 -8.5 H9" stroke="#fff" stroke-width="1" opacity=".6" />
          <path d="M-9 -16 C-9 -24 -22 -30 -22 -44 A22 22 0 0 1 22 -44 C22 -30 9 -24 9 -16 Z" fill="url(#hd-bulb)" stroke="#E3B93A" stroke-width="1" />
          <path d="M-5 -16 L-5 -30 Q0 -40 5 -30 L5 -16" fill="none" stroke="#B98C1E" stroke-width="1.4" stroke-linecap="round" />
          <ellipse cx="-9" cy="-52" rx="4.5" ry="7" fill="#fff" opacity=".55" transform="rotate(20 -9 -52)" />
        </g>
        <!-- 떠도는 빛 알갱이 -->
        <g class="motes">
          <circle v-for="(m, i) in MOTES" :key="i" :cx="m[0]" :cy="m[1] - 20" :r="i % 2 ? 2 : 1.5" :fill="i % 3 ? '#F9E27A' : 'var(--brand-300)'" :style="{ '--k': i }" />
        </g>
      </g></g>
    </g>
    </g>

    <!-- 장면 캡션 -->
    <text v-for="(c, i) in CAPTIONS" :key="i" class="cap rise" :style="{ '--start': STARTS[i], '--k': 1 }" x="260" y="326" text-anchor="middle">{{ c }}</text>
    <!-- ④ 의 캡션은 두 줄 — 명조 한 줄이 여운을 맡는다 -->
    <text class="cap cap-end rise rise-long" :style="{ '--start': STARTS[3], '--k': 5 }" x="260" y="306" text-anchor="middle">중요한 것은, 아이디어입니다</text>
    <text class="cap rise rise-long" :style="{ '--start': STARTS[3], '--k': 7 }" x="260" y="328" text-anchor="middle">나머지는 AX-BRM이 도와드릴게요</text>
  </svg>
</template>

<style scoped>
.hero-doodle { width: 100%; max-width: 540px; height: auto; display: block; overflow: visible; --cycle: 21s; }
.cap { font-family: var(--font); font-size: 12px; font-weight: 600; fill: var(--text-sub); letter-spacing: -.01em; }
.tag text { font-family: var(--font); font-size: 8.5px; font-weight: 700; letter-spacing: .02em; }
.tag-ink { fill: var(--ink-500); }
.tag-brand { fill: #fff; }
.cap-end { font-family: var(--font-serif); font-size: 17px; font-weight: 600; fill: var(--brand-700); letter-spacing: -.02em; }

/* 장면 전환 — 아래에서 떠올라 자리를 잡고(0.6초), 머문 뒤, 위로 옅어지며 물러난다(0.5초). --start 로 장면 시작, --k 로 요소 시차.
   퍼센트는 21초 주기 기준: 4.5초 장면(rise)은 21.4%, 7.5초 엔딩(rise-long)은 35.7% 를 차지한다 */
.rise { animation: rise var(--cycle) var(--ease-out, cubic-bezier(.22,1,.36,1)) infinite both; animation-delay: calc(var(--start, 0s) + var(--k, 0) * .09s); }
@keyframes rise {
  0% { opacity: 0; transform: translateY(26px); }
  2.9% { opacity: 1; transform: translateY(0); }
  19% { opacity: 1; transform: translateY(0); }
  21.3% { opacity: 0; transform: translateY(-12px); }
  21.4%, 100% { opacity: 0; transform: translateY(26px); }
}
.rise-long { animation-name: rise-long; }
@keyframes rise-long {
  0% { opacity: 0; transform: translateY(26px); }
  2.9% { opacity: 1; transform: translateY(0); }
  33.3% { opacity: 1; transform: translateY(0); }
  35.6% { opacity: 0; transform: translateY(-12px); }
  35.7%, 100% { opacity: 0; transform: translateY(26px); }
}
/* .rise 안의 g 에 SVG transform 속성이 있으면 CSS transform 이 덮어쓴다 — 엔딩의 전구 그룹은 translate 속성을 쓰므로 자식(.bulb 등)이 아니라 부모 그룹에 rise 를 두지 않는다 */

/* ① 상자 안 빛 알갱이 — 천천히 떠오르며 사라진다 */
.sparks circle { animation: spark 2.6s linear infinite; animation-delay: calc(var(--k) * -.55s); }
@keyframes spark { 0% { transform: translateY(6px); opacity: 0; } 25% { opacity: .95; } 75% { opacity: .6; } 100% { transform: translateY(-16px); opacity: 0; } }

/* ③ 차트 막대의 호흡, 배지의 부유 */
.bar { transform-box: fill-box; transform-origin: 50% 100%; animation: breathe 3.4s ease-in-out infinite; animation-delay: calc(var(--k) * -.5s); }
@keyframes breathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(.84); } }
.float { animation: float 3s ease-in-out infinite; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }

/* ④ 전구 — 장면 시작 0.9초 뒤 천천히 켜지고(빛살·글로우), 켜진 순간부터 바닥으로 파문이 번진다. 주기 21초 기준 퍼센트 */
.bulb-glow, .rays path { animation: ignite var(--cycle) ease-out infinite both; animation-delay: calc(var(--start, 0s) + .9s + var(--k, 0) * .08s); transform-box: fill-box; transform-origin: 50% 50%; }
@keyframes ignite { 0% { opacity: 0; transform: scale(.6); } 3.5% { opacity: 1; transform: scale(1); } 100% { opacity: 1; transform: scale(1); } }
.ripples ellipse { animation: ripple var(--cycle) ease-out infinite both; animation-delay: calc(var(--start, 0s) + 1.4s + var(--k, 0) * 1.6s); transform-box: fill-box; transform-origin: 50% 50%; }
@keyframes ripple { 0% { opacity: .8; transform: scale(.3); } 12% { opacity: 0; transform: scale(2.6); } 100% { opacity: 0; transform: scale(2.6); } }
.motes circle { animation: mote 4.2s ease-in-out infinite; animation-delay: calc(var(--k) * -.7s); }
@keyframes mote { 0%, 100% { transform: translateY(0); opacity: .35; } 50% { transform: translateY(-9px); opacity: .95; } }

@media (prefers-reduced-motion: reduce) {
  .rise, .sparks circle, .bar, .float, .bulb-glow, .rays path, .ripples ellipse, .motes circle { animation: none; }
  .rise, .bulb-glow, .rays path { opacity: 1; transform: none; }
  .ripples { display: none; }
  .s0, .s1, .s2, .cap:not(.rise-long) { display: none; }
}
</style>
