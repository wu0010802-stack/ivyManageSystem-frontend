<template>
  <div class="fee-matching-panel">
    <KeepAlive>
      <BankReconTab v-if="source === 'passbook'" ref="passbookRef" embedded />
      <CollectionReconTab v-else ref="collectionRef" embedded />
    </KeepAlive>
  </div>
</template>

<script setup lang="ts">
/**
 * 入帳媒合（2026-09-02 IA 合併）：把原本「對帳」工作區的兩個同層檢視
 * （代收明細／存摺明細）收成同一頁的來源切換。
 *
 * SPEC-016 的語意不變——代收明細是對帳主來源（每筆家長繳費一列、帳號已錨定
 * 學生與帳單期別），存摺明細是勾稽層（與代收逐筆去重，避免同一筆錢被分配兩次）。
 * 變的只是它們不再是兩個平行入口，而是同一件事的兩個資料來源。
 *
 * 兩個子元件以 embedded 模式掛載：自帶的流程條與匯入面板讓位給收款工作區的
 * 工具列（問號說明＋匯入按鈕），由此元件的 openImport/openCoverage 轉呼叫。
 */
import { ref } from 'vue'
import BankReconTab from '@/components/fees/BankReconTab.vue'
import CollectionReconTab from '@/components/fees/CollectionReconTab.vue'

const props = withDefaults(defineProps<{ source?: string }>(), { source: 'collection' })

interface CollectionApi {
  fetchPayments?: () => void
  openCoverage?: () => void
  openImport?: () => void
}
interface PassbookApi {
  fetchTxns?: () => void
  openImport?: () => void
}

const collectionRef = ref<CollectionApi | null>(null)
const passbookRef = ref<PassbookApi | null>(null)

/** 展開目前來源的匯入面板（由工具列「匯入」觸發） */
function openImport() {
  if (props.source === 'passbook') passbookRef.value?.openImport?.()
  else collectionRef.value?.openImport?.()
}

/** 存摺勾稽只存在於代收明細來源（比對代收合計與存摺入帳） */
function openCoverage() {
  collectionRef.value?.openCoverage?.()
}

/** 重新整理目前來源的清單（供銷帳後或切回工作區時呼叫） */
function refresh() {
  if (props.source === 'passbook') passbookRef.value?.fetchTxns?.()
  else collectionRef.value?.fetchPayments?.()
}

defineExpose({ openImport, openCoverage, refresh })
</script>
