<script setup lang="ts">
/**
 * 問候語插畫（早安/午安）：太陽 + 雲朵，仿 KawaiiStar.vue 極簡風格。
 * 零 props，純裝飾用途。
 */
</script>

<template>
  <svg class="greeting-sun-illustration" width="92" height="66" viewBox="0 0 92 66" fill="none" aria-hidden="true">
    <circle cx="60" cy="28" r="17" fill="#FFD75E" />
    <g stroke="#FFC93C" stroke-width="3.4" stroke-linecap="round">
      <line x1="60" y1="4" x2="60" y2="0.5" />
      <line x1="77" y1="11" x2="80" y2="8" />
      <line x1="84" y1="28" x2="88" y2="28" />
      <line x1="77" y1="45" x2="80" y2="48" />
    </g>
    <circle cx="54.5" cy="26" r="1.9" fill="#8a6d1d" />
    <circle cx="65.5" cy="26" r="1.9" fill="#8a6d1d" />
    <path d="M55 32 Q60 36.5 65 32" stroke="#8a6d1d" stroke-width="2" stroke-linecap="round" fill="none" />
    <path d="M4 52 a10 10 0 0 1 10-9 a12 12 0 0 1 23-3 a9 9 0 0 1 9 12 z" fill="#fff" stroke="#cfe8f4" stroke-width="2.5" />
  </svg>
</template>
