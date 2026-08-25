<template>
  <section class="fee-settlement-workspace" aria-label="結算工作區">
    <div class="workspace-bar">
      <el-segmented
        :model-value="view"
        :options="viewOptions"
        aria-label="結算檢視切換"
        data-test="settlement-view-switch"
        @change="onViewChange"
      />
    </div>

    <KeepAlive>
      <CashHandoverTab v-if="view === 'handover'" />
      <CloseTab v-else @navigate="(target) => emit('navigate', target)" />
    </KeepAlive>
  </section>
</template>

<script setup lang="ts">
/**
 * 結算工作區：每日交接（現金交接批）＋月結（當期關帳）。
 * 月結 checklist 的「前往修正」透過 navigate 事件冒泡給 StudentFeeView 導頁。
 */
import CashHandoverTab from '@/components/fees/CashHandoverTab.vue'
import CloseTab from '@/components/fees/CloseTab.vue'
import { FEE_WORKSPACE_VIEWS, type FeeWorkspaceKey } from './feesNavigation'

const props = withDefaults(defineProps<{ view?: string }>(), { view: 'handover' })

const emit = defineEmits<{
  'change-view': [view: string]
  navigate: [target: { ws: FeeWorkspaceKey; view?: string }]
}>()

const viewOptions = FEE_WORKSPACE_VIEWS.settlement.map((v) => ({
  label: v.label,
  value: v.key,
}))

function onViewChange(val: string | number) {
  const next = String(val)
  if (next !== props.view) emit('change-view', next)
}
</script>

<style scoped>
.workspace-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
</style>
