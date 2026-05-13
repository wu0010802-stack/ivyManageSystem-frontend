<template>
  <div class="salary-breakdown">
    <section v-if="enrollment" class="bd-section">
      <h4>📊 人數來源</h4>
      <p>
        <a :href="classroomLink" target="_blank" rel="noopener noreferrer">
          {{ enrollment.classroom_name }}</a><span v-if="enrollment.grade_name">（{{ enrollment.grade_name }}）</span>
        · 共 {{ enrollment.total }} 人
      </p>
      <p class="bd-meta">資料時間：{{ formattedSnapshot }} 月底快照</p>
    </section>

    <section v-if="assistantNames.length" class="bd-section">
      <h4>🏫 兼任班級</h4>
      <p>{{ assistantNames.join('、') }}</p>
    </section>

    <section v-if="enrollment" class="bd-section">
      <h4>🎚️ 行內試算</h4>
      <div class="bd-controls">
        <span>假設在籍人數：</span>
        <el-input-number
          v-model="overrideCount"
          :min="0"
          :max="999"
          size="small"
          controls-position="right"
        />
        <el-button size="small" type="primary" :loading="simulating" @click="runSimulate">
          重算
        </el-button>
      </div>
      <div v-if="preview" class="bd-preview">
        預覽：節慶 {{ money(preview.festival_bonus) }} ／
        超額 {{ money(preview.overtime_bonus) }} ／
        實領 {{ money(preview.net_pay) }}
        <span class="bd-diff" :class="diffClass">（{{ netDiffLabel }}）</span>
      </div>
      <el-button v-if="preview" size="small" plain @click="resetPreview" style="margin-top:6px">
        ↺ 重設回 DB 數據
      </el-button>
    </section>

    <p v-if="!enrollment && !assistantNames.length" class="bd-muted">
      此員工無班級資料
    </p>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { simulateSalary } from '@/api/salary'
import { money } from '@/utils/format'

const props = defineProps({
  row: { type: Object, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
})
const emit = defineEmits(['preview-changed', 'reset'])

const enrollment = computed(() => props.row?.breakdown?.enrollment ?? null)
const assistantNames = computed(
  () => props.row?.breakdown?.assistant?.by_classroom ?? []
)

const overrideCount = ref(enrollment.value?.total ?? 0)
const preview = ref(null)
const simulating = ref(false)

const router = useRouter()
const classroomLink = computed(() => router.resolve({ path: '/classrooms' }).href)

const formattedSnapshot = computed(() => {
  const iso = enrollment.value?.snapshot_date
  return iso ? iso.replaceAll('-', '/') : ''
})

const netDiff = computed(() => {
  if (!preview.value) return 0
  return Number(preview.value.net_pay ?? 0) - Number(props.row.net_pay ?? 0)
})
const netDiffLabel = computed(() => {
  const diff = netDiff.value
  const sign = diff >= 0 ? '+' : ''
  return `與 DB 相比 ${sign}${diff.toLocaleString()}`
})
const diffClass = computed(() => (netDiff.value >= 0 ? 'bd-diff-up' : 'bd-diff-down'))

const runSimulate = async () => {
  simulating.value = true
  try {
    const resp = await simulateSalary({
      employee_id: props.row.employee_id,
      year: props.year,
      month: props.month,
      overrides: { enrollment_override: overrideCount.value },
    })
    preview.value = resp.data?.simulated ?? null
    if (preview.value) {
      emit('preview-changed', {
        employee_id: props.row.employee_id,
        simulated: preview.value,
      })
    }
  } catch (e) {
    console.warn('[SalaryBreakdown] simulate failed', e)
    ElMessage.error('試算失敗，請稍後重試')
  } finally {
    simulating.value = false
  }
}

const resetPreview = () => {
  preview.value = null
  overrideCount.value = enrollment.value?.total ?? 0
  emit('reset', { employee_id: props.row.employee_id })
}
</script>

<style scoped>
.salary-breakdown { padding: 12px 16px; background: var(--el-fill-color-lighter); border-radius: 4px; }
.bd-section { margin-bottom: 12px; }
.bd-section:last-child { margin-bottom: 0; }
.bd-section h4 { margin: 0 0 6px; font-size: 14px; color: var(--el-text-color-primary); }
.bd-section p { margin: 2px 0; }
.bd-meta { color: var(--el-text-color-secondary); font-size: 12px; }
.bd-controls { display: flex; gap: 8px; align-items: center; }
.bd-preview {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 2px;
}
.bd-diff { margin-left: 6px; font-weight: 600; }
.bd-diff-up { color: var(--el-color-success); }
.bd-diff-down { color: var(--el-color-danger); }
.bd-muted { color: var(--el-text-color-secondary); font-style: italic; margin: 0; }
</style>
