<template>
  <div class="pos-view">
    <div class="pos-view__header">
      <PageHeader title="POS 收銀" subtitle="課後才藝繳費 / 退費快速結帳" />
      <AcademicTermSelector />
    </div>
    <POSCheckoutPanel />
  </div>
</template>

<script setup>
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import POSCheckoutPanel from '@/components/activity/POSCheckoutPanel.vue'
</script>

<style scoped>
.pos-view {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pos-view__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
</style>
