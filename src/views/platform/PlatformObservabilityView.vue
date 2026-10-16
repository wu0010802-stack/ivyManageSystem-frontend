<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import SettingsObservabilityTab from '@/components/settings/SettingsObservabilityTab.vue'
</script>

<template>
  <div>
    <PageHeader title="排程監控" subtitle="檢視排程執行狀態與失敗紀錄" />
    <SettingsObservabilityTab />
  </div>
</template>
