<template>
  <div>
    <PageHeader title="薪資試算" subtitle="人事談薪情境試算（不寫入任何薪資紀錄）" />
    <SalarySimulatePanel />
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import SalarySimulatePanel from './SalarySimulatePanel.vue'
</script>
