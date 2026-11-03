<template>
  <div class="salary-breakdown">
    <section v-if="schoolHeadcount" class="bd-section">
      <h4>全園人數（{{ SCHOOL_BASIS_LABEL[schoolHeadcount.schoolBasis!] }}）</h4>
      <p>
        全園在籍 {{ schoolHeadcount.enrollment }} 人 ／ 全園目標 {{ schoolHeadcount.target || '—' }}
        （{{ gapLong(schoolHeadcount) }}，達成 {{ ratioText(schoolHeadcount) }}）
      </p>
      <p class="bd-meta">節慶獎金依全園比例計算，不看下面的班級人數。資料時間：{{ formatSnapshotDate(schoolHeadcount.snapshotDate) }} 月底快照</p>
    </section>

    <section v-if="enrollment" class="bd-section">
      <h4>人數來源</h4>
      <p>
        <a :href="classroomLink" target="_blank" rel="noopener noreferrer">
          {{ enrollment.classroom_name }}</a><span v-if="enrollment.grade_name">（{{ enrollment.grade_name }}）</span>
        · 共 {{ enrollment.total }} 人
      </p>
      <dl v-if="headHeadcount && headHeadcount.target" class="bd-figures">
        <div><dt>班級目標人數</dt><dd>{{ headHeadcount.target }}（{{ gapLong(headHeadcount) }}）</dd></div>
        <div><dt>達成率</dt><dd>{{ ratioText(headHeadcount) }}</dd></div>
        <div><dt>超額門檻（年終統計）</dt><dd>{{ headHeadcount.overtimeTarget || '—' }}（{{ overtimeText(headHeadcount) }}）</dd></div>
      </dl>
      <p v-if="headHeadcount && headHeadcount.multiHead" class="bd-meta">同時是多個班的班導，這裡只顯示第一個班；請到班級管理確認。</p>
      <p class="bd-meta">資料時間：{{ formattedSnapshot }} 月底快照</p>
    </section>

    <section v-if="assistantNames.length" class="bd-section">
      <h4>兼任班級</h4>
      <p>{{ assistantNames.join('、') }}</p>
      <ul v-if="otherHeadcounts.length" class="bd-classes">
        <li v-for="h in otherHeadcounts" :key="h.classroomName">
          {{ h.classroomName }}<span v-if="h.gradeName">（{{ h.gradeName }}）</span>
          · {{ ROLE_LABEL[h.role] }}<span v-if="h.isShared && h.role === 'assistant_teacher'">（共用）</span>
          · 在籍 {{ h.enrollment }}<template v-if="h.target"> ／ 目標 {{ h.target }}（{{ gapLong(h) }}）</template>
        </li>
      </ul>
    </section>

    <p v-if="enrollment || otherHeadcounts.length || schoolHeadcount" class="bd-meta">
      以上是班級的人數與目標。個人節慶獎金依職務可能不同（主管看全園人數、共用副班導與美師用共用目標、發放月按期間逐月累計、新班有保障比例），金額以「節慶獎金」明細為準。
    </p>

    <section v-if="enrollment" class="bd-section">
      <h4>行內試算</h4>
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
        試算淨薪 {{ money(preview.net_pay) }}
        <span class="bd-diff" :class="diffClass">（{{ netDiffLabel }}）</span>
      </div>
      <el-button v-if="preview" size="small" plain @click="resetPreview" style="margin-top:6px">
        ↺ 重設回 DB 數據
      </el-button>
    </section>

    <p v-if="!enrollment && !assistantNames.length && !schoolHeadcount" class="bd-muted">
      此員工無班級資料
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { simulateSalary } from '@/api/salary'
import { money } from '@/utils/format'
import {
  headcountsOf,
  headcountGap,
  ratioText,
  overtimeText,
  ROLE_LABEL,
  SCHOOL_BASIS_LABEL,
  type ClassHeadcount,
} from './settle/reviewHeadcount'

const props = defineProps<{
  row: Record<string, unknown>
  year: number
  month: number
}>()

interface EnrollmentInfo { total: number; snapshot_date?: string; classroom_name?: string; grade_name?: string }
interface PreviewResult { net_pay?: number; festival_bonus?: number; overtime_bonus?: number }

const enrollment = computed(() => (props.row?.breakdown as Record<string, unknown>)?.enrollment as EnrollmentInfo ?? null)
const assistantNames = computed(
  () => ((props.row?.breakdown as Record<string, unknown>)?.assistant as Record<string, string[]>)?.by_classroom ?? []
)

const headcounts = computed(() => headcountsOf(props.row ?? {}))
const schoolHeadcount = computed(() => headcounts.value.find((h) => h.scope === 'school') ?? null)
const headHeadcount = computed(
  () => headcounts.value.find((h) => h.scope === 'class' && h.role === 'head_teacher') ?? null,
)
const otherHeadcounts = computed(
  () => headcounts.value.filter((h) => h.scope === 'class' && h.role !== 'head_teacher'),
)
const formatSnapshotDate = (iso: string | null) => (iso ? iso.replace(/-/g, '/') : '')
const gapLong = (h: ClassHeadcount): string => {
  const gap = headcountGap(h)
  if (gap === null) return '目標未設定'
  if (gap === 0) return '剛好達標'
  return gap < 0 ? `還差 ${-gap} 人` : `多 ${gap} 人`
}

const overrideCount = ref<number>(enrollment.value?.total ?? 0)
const preview = ref<PreviewResult | null>(null)
const simulating = ref(false)

const router = useRouter()
const classroomLink = computed(() => router.resolve({ path: '/classrooms' }).href)

const formattedSnapshot = computed(() => {
  const iso = enrollment.value?.snapshot_date
  return iso ? iso.replace(/-/g, '/') : ''
})

const netDiff = computed(() => {
  if (!preview.value) return 0
  return Number(preview.value.net_pay ?? 0) - Number((props.row.net_pay as number | undefined) ?? 0)
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
      employee_id: props.row.employee_id as number,
      year: props.year,
      month: props.month,
      overrides: {
        enrollment_override: overrideCount.value,
        // Backend defaults these to 0; required by OpenAPI schema
        extra_overtime_pay: 0,
        extra_personal_leave_hours: 0,
        extra_sick_leave_hours: 0,
      },
    })
    preview.value = ((resp.data as Record<string, unknown>)?.simulated ?? null) as PreviewResult | null
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
}
</script>

<style scoped>
.salary-breakdown { padding: 12px 16px; background: var(--el-fill-color-lighter); border-radius: 4px; }
.bd-section { margin-bottom: 12px; }
.bd-section:last-child { margin-bottom: 0; }
.bd-section h4 { margin: 0 0 6px; font-size: 14px; color: var(--el-text-color-primary); }
.bd-section p { margin: 2px 0; }
.bd-meta { color: var(--el-text-color-secondary); font-size: 12px; }
.bd-figures { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-5); margin: var(--space-2) 0; }
.bd-figures div { display: flex; gap: var(--space-2); }
.bd-figures dt { color: var(--el-text-color-secondary); }
.bd-figures dd { margin: 0; font-variant-numeric: tabular-nums; }
.bd-classes { margin: var(--space-1) 0 0; padding-left: var(--space-5); }
.bd-controls { display: flex; gap: 8px; align-items: center; }
.bd-preview {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 4px;
}
.bd-diff { margin-left: 6px; font-weight: 600; }
.bd-diff-up { color: var(--el-color-success); }
.bd-diff-down { color: var(--el-color-danger); }
.bd-muted { color: var(--el-text-color-secondary); font-style: italic; margin: 0; }
</style>
