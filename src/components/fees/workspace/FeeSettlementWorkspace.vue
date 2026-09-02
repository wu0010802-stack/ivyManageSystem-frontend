<template>
  <section class="fee-settlement-workspace" aria-label="結算工作區">
    <FeeWorkspaceToolbar
      :views="views"
      :view="view"
      tabs-label="結算檢視切換"
      tabs-test-id="settlement-view"
      help-label="顯示結算規則說明"
      @change-view="onViewChange"
    >
      <template #help>
        <p><strong>現金交接鐵律</strong></p>
        <p>
          會計收多少現金就全額交付老闆；預繳退款是老闆另行支出，不從交接扣除。
        </p>
        <p><strong>月結</strong></p>
        <p>
          關帳前檢查全數通過才能直接關帳；有例外時填寫說明改為「帶例外關帳」，
          凍結快照會標記該筆有差異。
        </p>
      </template>
    </FeeWorkspaceToolbar>

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
import FeeWorkspaceToolbar from './FeeWorkspaceToolbar.vue'
import { FEE_WORKSPACE_VIEWS, type FeeNavTarget } from './feesNavigation'

const props = withDefaults(defineProps<{ view?: string }>(), { view: 'handover' })

const emit = defineEmits<{
  'change-view': [view: string]
  navigate: [target: FeeNavTarget]
}>()

const views = FEE_WORKSPACE_VIEWS.settlement

function onViewChange(next: string) {
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
