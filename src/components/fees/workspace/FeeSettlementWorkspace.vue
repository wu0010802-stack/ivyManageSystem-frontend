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
      <CashHandoverTab v-if="view === 'handover'" ref="handoverRef" />
      <CloseTab v-else ref="closeRef" @navigate="(target) => emit('navigate', target)" />
    </KeepAlive>
  </section>
</template>

<script setup lang="ts">
/**
 * 結算工作區：每日交接（現金交接批）＋月結（當期關帳）。
 * 月結 checklist 的「前往修正」透過 navigate 事件冒泡給 StudentFeeView 導頁。
 */
import { onActivated, ref } from 'vue'
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

// 切回結算工作區時刷新（KeepAlive activate）：交接批與關帳摘要會被別處的
// 操作改動——帳單頁與對帳工作區收的現金都會落進當日交接批，切回來若還是
// 舊快照，會計會對著過期的期望金額交錢。
const handoverRef = ref<{ fetchBatches?: () => void } | null>(null)
const closeRef = ref<{ fetchSummary?: () => void; fetchCloses?: () => void } | null>(
  null,
)

// 首次 activate 與 mount 同一輪、子元件自己會載，故跳過第一次（用旗標而非
// onMounted 時序，避免依賴 hook 執行順序）
let activatedOnce = false
onActivated(() => {
  if (activatedOnce) {
    handoverRef.value?.fetchBatches?.()
    closeRef.value?.fetchSummary?.()
    closeRef.value?.fetchCloses?.()
  }
  activatedOnce = true
})
</script>

<style scoped>
.workspace-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
</style>
