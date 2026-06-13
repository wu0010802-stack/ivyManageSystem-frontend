<template>
  <div>
    <!-- 節慶獎金發放月提示（涵蓋區間標示待 festivalCoverage 模組（使用者 WIP）落地後接上） -->
    <el-alert
      v-if="isFestivalMonth"
      type="info"
      :closable="false"
      class="precheck-mb"
      title="本月為節慶獎金發放月（2／6／9／12 月），計算時會一併結算本期累積"
    />

    <!-- 發放月：涵蓋月在籍人數快照（產生/核對/手調/確認；計算優先讀快照） -->
    <EnrollmentSnapshotPanel v-if="isFestivalMonth" :year="q.year" :month="q.month" />

    <el-card v-loading="loading" shadow="never" class="no-hover">
      <template v-if="totalPending > 0">
        <el-alert
          type="warning"
          :closable="false"
          class="precheck-mb"
          :title="`有 ${totalPending} 筆未簽核項目，計算前建議先處理（不強制，可逕行計算）`"
        />
        <ul class="pending-list">
          <li v-for="it in items" :key="it.label">
            <span>{{ it.label }}：<b>{{ it.count }}</b> 筆</span>
            <el-button link type="primary" @click="$router.push(it.path)">前往簽核 →</el-button>
          </li>
        </ul>
        <p class="pending-note">
          註：跨月假單會同時出現在前後兩個月的待簽核清單（區間重疊計）。
        </p>
      </template>
      <el-result v-else-if="!loading" icon="success" title="無未簽核項目" sub-title="考勤資料就緒，可以開始計算" />
    </el-card>

    <div class="step-actions">
      <el-button type="primary" @click="$emit('next')">下一步：計算 →</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import { getLeaves } from '@/api/leaves'
import { getOvertimes } from '@/api/overtimes'
import { getCorrections } from '@/api/punchCorrections'
import { useErrorNotify } from '@/composables/useErrorNotify'
import EnrollmentSnapshotPanel from './EnrollmentSnapshotPanel.vue'

defineEmits<{ (e: 'next'): void }>()

const q = inject<{ year: number; month: number }>('settleQuery', {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
})
const { notify } = useErrorNotify()
const loading = ref(false)
const counts = ref({ leaves: 0, overtimes: 0, corrections: 0 })

const len = (resp: unknown): number => {
    const data = (resp as { data?: unknown })?.data
    return Array.isArray(data) ? data.length : 0
}

onMounted(async () => {
    loading.value = true
    try {
        const params = { year: q.year, month: q.month, status: 'pending' }
        const [l, o, c] = await Promise.all([getLeaves(params), getOvertimes(params), getCorrections(params)])
        counts.value = { leaves: len(l), overtimes: len(o), corrections: len(c) }
    } catch (e) {
        notify(e, 'StepPrecheck', '載入待簽核項目失敗')
    } finally {
        loading.value = false
    }
})

const items = computed(() =>
    [
        { label: '待簽核假單', count: counts.value.leaves, path: '/leaves' },
        { label: '待簽核加班單', count: counts.value.overtimes, path: '/overtime' },
        { label: '待簽核補打卡', count: counts.value.corrections, path: '/attendance' },
    ].filter((i) => i.count > 0),
)
const totalPending = computed(() => counts.value.leaves + counts.value.overtimes + counts.value.corrections)
const isFestivalMonth = computed(() => [2, 6, 9, 12].includes(q.month))
</script>

<style scoped>
.precheck-mb {
  margin-bottom: var(--space-4);
}

.pending-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.pending-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-color-light);
}

.pending-note {
  margin: var(--space-3) 0 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.step-actions {
  margin-top: var(--space-6);
  text-align: right;
}
</style>
