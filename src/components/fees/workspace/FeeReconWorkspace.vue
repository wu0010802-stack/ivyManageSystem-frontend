<template>
  <section class="fee-recon-workspace" aria-label="對帳工作區">
    <div class="workspace-bar">
      <el-segmented
        :model-value="view"
        :options="viewOptions"
        aria-label="對帳來源切換"
        data-test="recon-view-switch"
        @change="onViewChange"
      />
      <span class="workspace-hint">
        {{
          view === 'passbook'
            ? '存摺明細為勾稽層：超商代收在此為每日整批入帳，逐筆核銷請用代收明細'
            : '代收明細為對帳主來源：每筆家長繳費一列，帳號已錨定學生與帳單期別'
        }}
      </span>
    </div>

    <KeepAlive>
      <BankReconTab v-if="view === 'passbook'" />
      <CollectionReconTab v-else />
    </KeepAlive>
  </section>
</template>

<script setup lang="ts">
/**
 * 對帳工作區（SPEC-016）：代收明細（主來源，預設）＋存摺明細（勾稽層）。
 *
 * 代收核銷明細每筆家長繳費一列、含完整 14 碼銷帳編號，媒合為帳號定錨；
 * 存摺明細僅供勾稽超商每日整批入帳與非代收款項（利息/支出）。
 */
import BankReconTab from '@/components/fees/BankReconTab.vue'
import CollectionReconTab from '@/components/fees/CollectionReconTab.vue'
import { FEE_WORKSPACE_VIEWS } from './feesNavigation'

const props = withDefaults(defineProps<{ view?: string }>(), { view: 'collection' })

const emit = defineEmits<{ 'change-view': [view: string] }>()

const viewOptions = FEE_WORKSPACE_VIEWS.recon.map((v) => ({
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
  flex-wrap: wrap;
}
.workspace-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
