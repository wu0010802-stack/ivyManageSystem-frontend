<template>
  <div class="student-fee-view">
    <PageHeader title="學費管理" subtitle="查看與管理本學期各班級學生的應收費用與繳費狀態" />

    <el-tabs v-model="activeTab" type="card">
      <!-- ================================================================
           Tab 1：繳費記錄（主要工作面板）
      ================================================================ -->
      <el-tab-pane label="繳費記錄" name="records">
        <FeeRecordsTab
          ref="feeRecordsTabRef"
          :period-options="periodOptions"
          :classrooms="classrooms"
        />
      </el-tab-pane>

      <!-- ================================================================
           Tab 2：費用總覽（依範本計算每生應繳）
      ================================================================ -->
      <el-tab-pane label="費用總覽" name="templates">
        <FeeTemplateTab />
      </el-tab-pane>

      <!-- ================================================================
           Tab 3：退費管理
      ================================================================ -->
      <el-tab-pane label="退費管理" name="refunds">
        <FeeRefundsTab :period-options="periodOptions" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getFeePeriods } from '@/api/fees'
import { useClassroomStore } from '@/stores/classroom'
import FeeTemplateTab from '@/components/fees/FeeTemplateTab.vue'
import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'
import FeeRefundsTab from '@/components/fees/FeeRefundsTab.vue'
import PageHeader from '@/components/common/PageHeader.vue'

// ─── Tab 狀態 ────────────────────────────────────────────────────────────────
// 預設「繳費記錄」（日常工作面板）；範本/總覽為輔助檢視
const activeTab = ref('records')
const periodOptions = ref<string[]>([])

// ─── 子元件 ref（records tab） ──────────────────────────────────────────────
const route = useRoute()
const feeRecordsTabRef = ref<{
  fetchRecords?: () => void
  applySearch?: (name: string) => void
} | null>(null)

// ─── 班級列表（供子元件下拉選單） ──────────────────────────────────────────
const classroomStore = useClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)

async function fetchFeePeriods() {
  try {
    periodOptions.value = (await getFeePeriods()) as string[]
  } catch (e) {
    ElMessage.error(friendlyError('載入學期列表失敗', e))
  }
}

// ─── 切換 Tab 時自動載入 ──────────────────────────────────────────────────────
watch(activeTab, (val) => {
  if (val === 'records') feeRecordsTabRef.value?.fetchRecords?.()
})

onMounted(() => {
  fetchFeePeriods()
  classroomStore.fetchClassrooms()
  if (activeTab.value === 'records') {
    // 全域搜尋導航帶入 ?search=<學生姓名>：預填學生姓名並篩選
    const kw = typeof route.query.search === 'string' ? route.query.search : ''
    if (kw) feeRecordsTabRef.value?.applySearch?.(kw)
    else feeRecordsTabRef.value?.fetchRecords?.()
  }
})
</script>

<style scoped>
.student-fee-view {
  padding: var(--space-5);
}
</style>
