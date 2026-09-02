<template>
  <el-drawer
    :model-value="modelValue"
    title="發單批次"
    size="min(1080px, 92vw)"
    direction="rtl"
    destroy-on-close
    data-test="bill-slip-drawer"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <template #header>
      <div class="drawer-head">
        <span class="drawer-head__title">發單批次</span>
        <span class="drawer-head__sub">
          銀行檢核檔（Check_*.xls）＝應收母體：匯入後即可一鍵產生費用單，
          並自算未繳／短繳／溢繳。
        </span>
      </div>
    </template>

    <BillSlipTab ref="tabRef" embedded @generated="emit('generated')" />
  </el-drawer>
</template>

<script setup lang="ts">
/**
 * 發單批次抽屜（2026-09-02 IA 合併）。
 *
 * 改版前「發單與未繳」是對帳工作區的第三個同層檢視，但它其實不是日常
 * 逐筆處理的地方——一個月只碰一兩次（匯入檢核檔、按產單、偶爾查未繳名單）。
 * 讓它常駐佔一個檢視，等於天天付版面成本換月拋一次的操作。
 *
 * 改版後降為抽屜：由收款工具列的「匯入 ▾ › 銀行檢核檔」或應收帳款頂端的
 * 待辦提示條開啟；深連結 ?ws=billing&imports=1 亦可直達（舊網址
 * ?ws=recon&view=billslips 會映射到此）。
 */
import { ref, watch } from 'vue'
import BillSlipTab from '@/components/fees/BillSlipTab.vue'

const props = defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 產生費用單後冒泡，讓收款工作區刷新應收帳款與待辦數 */
  generated: []
}>()

const tabRef = ref<{ fetchBatches?: () => void } | null>(null)

// destroy-on-close＝每次開啟都是新實例（子元件 onMounted 自載），
// 這裡只處理「已開著時被外部要求重載」的情況
watch(
  () => props.modelValue,
  (open, prev) => {
    if (open && prev) tabRef.value?.fetchBatches?.()
  },
)
</script>

<style scoped>
.drawer-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.drawer-head__title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.drawer-head__sub {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  line-height: 1.6;
}
</style>
