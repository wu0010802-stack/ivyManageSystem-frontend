<template>
  <div class="student-fee-view">
    <div class="page-header">
      <h2>學費管理</h2>
    </div>

    <el-tabs v-model="activeTab" type="card">
      <!-- ================================================================
           Tab 1：費用範本
      ================================================================ -->
      <el-tab-pane label="費用範本" name="templates">
        <FeeTemplateTab />
      </el-tab-pane>

      <!-- ================================================================
           Tab 2：繳費記錄
      ================================================================ -->
      <el-tab-pane label="繳費記錄" name="records">
        <FeeRecordsTab
          ref="feeRecordsTabRef"
          :period-options="periodOptions"
          :classrooms="classrooms"
        />
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

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getFeePeriods } from '@/api/fees'
import { useClassroomStore } from '@/stores/classroom'
import FeeTemplateTab from '@/components/fees/FeeTemplateTab.vue'
import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'
import FeeRefundsTab from '@/components/fees/FeeRefundsTab.vue'

// ─── Tab 狀態 ────────────────────────────────────────────────────────────────
const activeTab = ref('templates')
const periodOptions = ref([])

// ─── 子元件 ref（records tab） ──────────────────────────────────────────────
const feeRecordsTabRef = ref(null)

// ─── 班級列表（供子元件下拉選單） ──────────────────────────────────────────
const classroomStore = useClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)

async function fetchFeePeriods() {
  try {
    periodOptions.value = await getFeePeriods()
  } catch {
    ElMessage.error('載入學期列表失敗')
  }
}

// ─── 切換 Tab 時自動載入 ──────────────────────────────────────────────────────
watch(activeTab, (val) => {
  if (val === 'records') feeRecordsTabRef.value?.fetchRecords()
})

onMounted(() => {
  fetchFeePeriods()
  classroomStore.fetchClassrooms()
})
</script>

<style scoped>
.student-fee-view {
  padding: var(--space-5);
}

.page-header {
  margin-bottom: var(--space-4);
}

.page-header h2 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
}
</style>
