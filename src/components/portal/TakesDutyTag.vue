<script setup lang="ts">
/**
 * 「接手職務」標籤（SPEC-026 §4.4 T13）：請假人請代理人接手自己的職務班別時，代理人清單上的標示。
 * 手機卡片（PortalSubstituteCardList）與桌機表格（PortalLeaveView）共用，文案與樣式不漂移；
 * 說明文字見 utils/substituteDuty.takesDutyHandoverText。
 */
</script>

<template>
  <el-tag type="warning" size="small" data-test="takes-duty-tag">接手職務</el-tag>
</template>
