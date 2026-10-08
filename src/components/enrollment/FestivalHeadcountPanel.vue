<script setup lang="ts">
/**
 * 節慶人數結算面板（共用元件，2026-08-20）。
 *
 * 供兩處使用：
 *   1. 薪資結算 StepPrecheck（`mode="coverage"`，展開發放月的涵蓋月）
 *   2. 考核與年終工作區的「節慶人數」頁（`mode="single"`，只看指定月）
 *
 * 程式與 API 路徑沿用 enrollment snapshot 命名，UI 文案一律稱「節慶人數」。
 */
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
    getEnrollmentSnapshot,
    generateEnrollmentSnapshot,
    patchEnrollmentSnapshot,
    confirmEnrollmentSnapshot,
    reopenEnrollmentSnapshot,
    getEnrollmentSnapshotExclusions,
} from '@/api/salary'
import { useErrorNotify } from '@/composables/useErrorNotify'
import type { Schema } from '@/api/_generated/typed'

// 型別一律由 OpenAPI codegen 衍生，**不手寫**——手寫會讓後端改欄位時前端在
// 編譯期抓不到漂移（workspace CLAUDE.md「OpenAPI codegen 防漂移」）。
type MonthOut = Schema<'EnrollmentSnapshotMonthOut'>
type SnapshotRow = Schema<'EnrollmentSnapshotRowOut'>
type ExclusionItem = Schema<'EnrollmentSnapshotExclusionItemOut'>

const props = withDefaults(
    defineProps<{
        year: number
        month: number
        /** coverage：展開發放月涵蓋月；single：只看指定月 */
        mode?: 'coverage' | 'single'
        /** 唯讀模式：不顯示產生／確認／重開／調整 */
        readonly?: boolean
        title?: string
    }>(),
    { mode: 'coverage', readonly: false, title: '節慶人數' },
)

const { notify } = useErrorNotify()
const loading = ref(false)
const generating = ref(false)
const months = ref<[number, number][]>([])
const activeKey = ref('')
const rowsByMonth = reactive<Record<string, SnapshotRow[]>>({})
const metaByMonth = reactive<Record<string, Partial<MonthOut>>>({})

const key = (m: [number, number]) => `${m[0]}-${m[1]}`
const rows = computed(() => rowsByMonth[activeKey.value] || [])
const meta = computed<Partial<MonthOut>>(() => metaByMonth[activeKey.value] || {})
const currentExists = computed(() => rows.value.length > 0)
const anyExists = computed(() => months.value.some((m) => (rowsByMonth[key(m)] || []).length > 0))
const coveredLabel = computed(() => months.value.map((m) => `${m[1]}月`).join('、'))
const activeConfirmed = computed(
    () => currentExists.value && rows.value.every((r) => r.is_confirmed),
)
const longLeaveEnforced = computed(() => meta.value.long_leave_mode === 'enforce')
const longLeaveThreshold = computed(() => meta.value.long_leave_threshold_days ?? 10)

const modeLabel = (mode: string) =>
    ({ month_end: '月底統計', daily_weighted: '按日加權', manual: '人工調整' })[mode] || mode

const activeMonth = computed<[number, number] | null>(
    () => months.value.find((m) => key(m) === activeKey.value) || null,
)

const num = (value: number | undefined | null) => value ?? 0

const fetchMonth = async (m: [number, number]) => {
    const { data } = await getEnrollmentSnapshot(m[0], m[1])
    rowsByMonth[key(m)] = data.rows || []
    metaByMonth[key(m)] = {
        long_leave_mode: data.long_leave_mode,
        long_leave_threshold_days: data.long_leave_threshold_days,
        is_post_cutoff: data.is_post_cutoff,
        cutoff_ym: data.cutoff_ym,
    }
}

const refresh = async () => {
    loading.value = true
    try {
        await Promise.all(months.value.map(fetchMonth))
    } catch (e) {
        notify(e, 'FestivalHeadcountPanel', '載入節慶人數失敗')
    } finally {
        loading.value = false
    }
}

const load = async () => {
    loading.value = true
    try {
        if (props.mode === 'single') {
            months.value = [[props.year, props.month]]
        } else {
            // 以結算月查 covered_months（後端單一來源），再逐涵蓋月載入
            const { data } = await getEnrollmentSnapshot(props.year, props.month)
            months.value = (data.covered_months || []).map(
                (m) => [m[0], m[1]] as [number, number],
            )
        }
        if (months.value.length) {
            activeKey.value = key(months.value[0])
            await refresh()
        }
    } catch (e) {
        notify(e, 'FestivalHeadcountPanel', '載入節慶人數失敗')
    } finally {
        loading.value = false
    }
}

onMounted(load)
watch(() => [props.year, props.month, props.mode], load)

const generateAll = async () => {
    generating.value = true
    try {
        for (const m of months.value) {
            await generateEnrollmentSnapshot({ year: m[0], month: m[1] })
        }
        ElMessage.success('節慶人數已產生')
        await refresh()
    } catch (e) {
        notify(e, 'FestivalHeadcountPanel', '產生節慶人數失敗')
    } finally {
        generating.value = false
    }
}

const confirmActive = async () => {
    const m = activeMonth.value
    if (!m) return
    try {
        await confirmEnrollmentSnapshot({ year: m[0], month: m[1] })
        ElMessage.success(`${m[1]} 月節慶人數已確認`)
        await fetchMonth(m)
    } catch (e) {
        notify(e, 'FestivalHeadcountPanel', '確認失敗')
    }
}

// ── 人工調整 ────────────────────────────────────────────────────────────────
const editVisible = ref(false)
const editSaving = ref(false)
const editTarget = ref<SnapshotRow | null>(null)
const editForm = reactive({ student_count: 0, reason: '' })

const openEdit = (row: SnapshotRow) => {
    editTarget.value = row
    editForm.student_count = row.student_count
    editForm.reason = ''
    editVisible.value = true
}

const saveEdit = async () => {
    if (!editTarget.value) return
    if (editForm.reason.trim().length < 10) {
        ElMessage.warning('請填寫至少 10 個字的調整原因')
        return
    }
    editSaving.value = true
    try {
        await patchEnrollmentSnapshot(editTarget.value.id, {
            student_count: editForm.student_count,
            reason: editForm.reason.trim(),
        })
        ElMessage.success('已更新，受影響的薪資／年終／考核草稿將標記需重新計算')
        editVisible.value = false
        if (activeMonth.value) await fetchMonth(activeMonth.value)
    } catch (e) {
        notify(e, 'FestivalHeadcountPanel', '更新失敗')
    } finally {
        editSaving.value = false
    }
}

// ── 重開 ───────────────────────────────────────────────────────────────────
const reopenVisible = ref(false)
const reopenSaving = ref(false)
const reopenReason = ref('')

const openReopen = () => {
    reopenReason.value = ''
    reopenVisible.value = true
}

const saveReopen = async () => {
    const m = activeMonth.value
    if (!m) return
    if (reopenReason.value.trim().length < 10) {
        ElMessage.warning('請填寫至少 10 個字的重開原因')
        return
    }
    reopenSaving.value = true
    try {
        await reopenEnrollmentSnapshot({
            year: m[0],
            month: m[1],
            reason: reopenReason.value.trim(),
        })
        ElMessage.success('已重開，可重新產生或調整')
        reopenVisible.value = false
        await fetchMonth(m)
    } catch (e) {
        notify(e, 'FestivalHeadcountPanel', '重開失敗')
    } finally {
        reopenSaving.value = false
    }
}

// ── 排除明細 ───────────────────────────────────────────────────────────────
const exclusionVisible = ref(false)
const exclusionLoading = ref(false)
const exclusionRow = ref<SnapshotRow | null>(null)
const exclusionItems = ref<ExclusionItem[]>([])

const reasonLabel = (code: string) =>
    ({ long_leave: `請假逾 ${longLeaveThreshold.value} 天`, on_leave: '休學' })[code] || code

const openExclusions = async (row: SnapshotRow) => {
    exclusionRow.value = row
    exclusionItems.value = []
    exclusionVisible.value = true
    exclusionLoading.value = true
    try {
        const { data } = await getEnrollmentSnapshotExclusions(row.id)
        exclusionItems.value = data.items || []
    } catch (e) {
        notify(e, 'FestivalHeadcountPanel', '載入排除明細失敗')
    } finally {
        exclusionLoading.value = false
    }
}
</script>

<template>
  <el-card v-if="months.length" shadow="never" class="no-hover snap-card">
    <template #header>
      <div class="snap-header">
        <span v-if="mode === 'coverage'">{{ title }}（涵蓋 {{ coveredLabel }}）</span>
        <span v-else>{{ title }}</span>
        <div v-if="!readonly">
          <el-button size="small" :loading="generating" @click="generateAll">
            {{ anyExists ? '重新產生' : '產生節慶人數' }}
          </el-button>
          <el-button
            size="small"
            type="success"
            :disabled="!currentExists || activeConfirmed"
            @click="confirmActive"
          >
            確認本月
          </el-button>
          <el-button
            size="small"
            type="warning"
            :disabled="!activeConfirmed"
            @click="openReopen"
          >
            重開本月
          </el-button>
        </div>
      </div>
    </template>

    <el-tabs v-model="activeKey">
      <el-tab-pane
        v-for="m in months"
        :key="key(m)"
        :label="`${m[0]} 年 ${m[1]} 月`"
        :name="key(m)"
      />
    </el-tabs>

    <el-table v-loading="loading" :data="rows" size="small" border>
      <el-table-column prop="classroom_name" label="班級" min-width="110" />
      <el-table-column label="系統在籍" width="92" align="right">
        <template #default="{ row }">{{ num(row.system_count) }}</template>
      </el-table-column>
      <el-table-column label="長假排除" width="110" align="right">
        <template #default="{ row }">
          <span>{{ num(row.long_leave_excluded_count) }}</span>
          <span v-if="!longLeaveEnforced" class="snap-hint">（不扣）</span>
        </template>
      </el-table-column>
      <el-table-column label="其他排除" width="92" align="right">
        <template #default="{ row }">
          {{ num(row.on_leave_count) + num(row.graduating_count) + num(row.other_excluded_count) }}
        </template>
      </el-table-column>
      <el-table-column label="人工調整" width="92" align="right">
        <template #default="{ row }">{{ num(row.manual_delta) }}</template>
      </el-table-column>
      <el-table-column label="最終節慶人數" width="118" align="right">
        <template #default="{ row }">
          <strong>{{ row.student_count }}</strong>
        </template>
      </el-table-column>
      <el-table-column label="計算模式" width="104">
        <template #default="{ row }">{{ modeLabel(row.count_mode) }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="88">
        <template #default="{ row }">
          <el-tag :type="row.is_confirmed ? 'success' : 'info'" size="small">
            {{ row.is_confirmed ? '已確認' : '未確認' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="adjust_reason" label="調整原因" min-width="130" show-overflow-tooltip />
      <el-table-column label="操作者／時間" min-width="140">
        <template #default="{ row }">
          <span>{{ row.confirmed_by || row.updated_by || '—' }}</span>
          <span class="snap-hint">{{ (row.confirmed_at || row.generated_at || '').slice(0, 16) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openExclusions(row)">明細</el-button>
          <el-button v-if="!readonly" link type="primary" size="small" @click="openEdit(row)">
            調整
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && !rows.length"
      description="本月尚未產生節慶人數——請先產生並核對"
      :image-size="60"
    />

    <p class="snap-note">
      薪資節慶／超額獎金、年終超額與節慶差額、考核帶班超編一律採用本頁的「最終節慶人數」。
      人工調整需填原因（≥10 字）；調整或重開後，受影響的薪資／年終／考核草稿會標記需重新計算。
      <span v-if="!longLeaveEnforced">
        目前長假（請假逾 {{ longLeaveThreshold }} 天）為觀察期：只統計、不扣除人數。
      </span>
    </p>

    <el-dialog v-model="editVisible" title="調整節慶人數" width="420px">
      <el-form label-width="110px">
        <el-form-item label="班級">{{ editTarget?.classroom_name }}</el-form-item>
        <el-form-item label="最終節慶人數">
          <el-input-number v-model="editForm.student_count" :min="0" :max="999" :precision="1" :step="1" />
        </el-form-item>
        <el-form-item label="調整原因">
          <el-input
            v-model="editForm.reason"
            type="textarea"
            :rows="3"
            placeholder="例如：1/31 兩位幼生退學尚未登錄系統，依點名冊修正"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveEdit">儲存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="reopenVisible" title="重開本月節慶人數" width="420px">
      <el-form label-width="90px">
        <el-form-item label="重開原因">
          <el-input
            v-model="reopenReason"
            type="textarea"
            :rows="3"
            placeholder="例如：1 月底發現兩位轉出未登錄，需重新統計"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reopenVisible = false">取消</el-button>
        <el-button type="warning" :loading="reopenSaving" @click="saveReopen">確定重開</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="exclusionVisible" title="排除明細" width="480px">
      <p class="snap-note">
        依個資保護，本清單只顯示學號與天數，不顯示幼生姓名。
      </p>
      <el-table v-loading="exclusionLoading" :data="exclusionItems" size="small" border>
        <el-table-column label="學號" min-width="120">
          <template #default="{ row }">{{ row.student_number || `#${row.student_id}` }}</template>
        </el-table-column>
        <el-table-column label="排除原因" min-width="130">
          <template #default="{ row }">{{ reasonLabel(row.reason_code) }}</template>
        </el-table-column>
        <el-table-column label="請假天數" width="96" align="right">
          <template #default="{ row }">{{ row.leave_days ?? '—' }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!exclusionLoading && !exclusionItems.length" description="本列無排除紀錄" :image-size="60" />
    </el-dialog>
  </el-card>
</template>

<style scoped>
.snap-card {
  margin-bottom: var(--space-4);
}

.snap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.snap-note {
  margin: var(--space-3) 0 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.snap-hint {
  margin-left: var(--space-1);
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}
</style>
