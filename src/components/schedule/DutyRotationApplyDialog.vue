<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { applyDutyRotation } from '@/api/dutyRotations'
import { useShiftStore } from '@/stores/shift'
import { friendlyError } from '@/utils/errorMessages'
import {
  ACTION_LABELS,
  SKIP_REASON_LABELS,
  countChangesInGroups,
  groupChangesByWeek,
  partitionWeekGroups,
  shiftTypeLabel,
  summarizeChanges,
  thisWeekMonday,
  type ApplyChange,
  type ApplyResult,
  type EditableWeek,
} from '@/utils/dutyRotationGrid'

const props = defineProps<{
  modelValue: boolean
  rotationId: number
  fromWeekStart: string | null
  weeks: EditableWeek[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; applied: [result: ApplyResult] }>()

const shiftStore = useShiftStore()
// 完整班別清單（含停用）：手動列可能是很久以前指到一個已停用的班別，用
// activeShiftTypes 會查不到（Final fix FE-1）。
const shiftTypes = computed(() => shiftStore.shiftTypes as unknown as { id: number; name: string }[])
const shiftTypeName = (id: number | null | undefined) => shiftTypeLabel(shiftTypes.value, id ?? null)

const loading = ref(false)
const applying = ref(false)
const changes = ref<ApplyChange[]>([])
const selected = ref<Set<string>>(new Set())
const errorText = ref('')
const selectedFromWeekStart = ref<string | null>(props.fromWeekStart)
const showCollapsedSkips = ref(false)

const keyOf = (c: ApplyChange) => `${c.employee_id}|${c.week_start_date}`
const summary = computed(() => summarizeChanges(changes.value))
const allGroups = computed(() => groupChangesByWeek(changes.value))
const todayMonday = thisWeekMonday()
const partitioned = computed(() => partitionWeekGroups(allGroups.value, todayMonday))
const pastGroups = computed(() => partitioned.value.past)
const upcomingGroups = computed(() => partitioned.value.upcoming)
const pastCount = computed(() => countChangesInGroups(pastGroups.value))
const collapsedSkipItems = computed(() =>
  changes.value.filter((c) => c.action === 'skip' && (c.skip_reason === 'finalized' || c.skip_reason === 'recorded'))
)

const loadPreview = async () => {
  loading.value = true
  errorText.value = ''
  selected.value = new Set()
  try {
    const res = await applyDutyRotation(props.rotationId, {
      dry_run: true,
      from_week_start: selectedFromWeekStart.value,
      overwrite_manual: [],
    })
    changes.value = res.data.changes
  } catch (e) {
    changes.value = []
    errorText.value = friendlyError('預覽套用結果失敗', e)
  } finally {
    loading.value = false
  }
}

// 每次開啟對話框：起始週回到父元件傳入的值（主按鈕＝全部週／重新套用＝提示
// 週），並收合上一次展開的略過明細。
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selectedFromWeekStart.value = props.fromWeekStart
      showCollapsedSkips.value = false
    }
  },
  { immediate: true }
)

// 開啟中或起始週被使用者改選都要重新 dry-run；兩個來源合併成一個 watch 避免
// 開啟當下重複呼叫兩次。
watch(
  [() => props.modelValue, selectedFromWeekStart],
  ([open]) => {
    if (open) loadPreview()
  },
  { immediate: true }
)

const toggle = (c: ApplyChange, checked: boolean) => {
  const next = new Set(selected.value)
  if (checked) next.add(keyOf(c))
  else next.delete(keyOf(c))
  selected.value = next
}

const onCheckboxChange = (c: ApplyChange, event: Event) => {
  toggle(c, (event.target as HTMLInputElement).checked)
}

const confirm = async () => {
  applying.value = true
  try {
    const overwrite = changes.value
      .filter((c) => c.skip_reason === 'manual' && selected.value.has(keyOf(c)))
      .map((c) => ({ employee_id: c.employee_id, week_start_date: c.week_start_date }))
    const res = await applyDutyRotation(props.rotationId, {
      dry_run: false,
      from_week_start: selectedFromWeekStart.value,
      overwrite_manual: overwrite,
    })
    ElMessage.success('已套用到週班表')
    emit('applied', res.data)
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error(friendlyError('套用輪值表失敗', e))
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="套用到週班表"
    width="720px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="drad-body">
      <label class="drad-from-week">
        從哪一週開始
        <el-select v-model="selectedFromWeekStart" data-test="from-week-select" size="small">
          <el-option label="全部週" :value="null as unknown as string" />
          <el-option
            v-for="w in weeks"
            :key="w.week_start_date"
            :label="w.label"
            :value="w.week_start_date"
          />
        </el-select>
      </label>

      <p v-if="loading">正在計算差異…</p>
      <p v-else-if="errorText" class="drad-error">{{ errorText }}</p>
      <template v-else>
        <p class="drad-summary" data-test="summary">
          新增 {{ summary.create }}・更新 {{ summary.update }}・移除 {{ summary.removed }}・不變 {{ summary.unchanged }}
        </p>
        <p
          v-if="summary.finalized || summary.recorded"
          class="drad-collapsed-skips"
          data-test="collapsed-skips"
        >
          <template v-if="summary.finalized">已封存略過 {{ summary.finalized }} 筆</template>
          <template v-if="summary.finalized && summary.recorded">、</template>
          <template v-if="summary.recorded">已有打卡略過 {{ summary.recorded }} 筆</template>
          <el-button
            link
            size="small"
            data-test="toggle-collapsed-skips"
            @click="showCollapsedSkips = !showCollapsedSkips"
          >
            {{ showCollapsedSkips ? '收合明細' : '展開明細' }}
          </el-button>
        </p>
        <ul v-if="showCollapsedSkips" class="drad-collapsed-list" data-test="collapsed-skip-list">
          <li v-for="c in collapsedSkipItems" :key="`${c.employee_id}-${c.week_start_date}`">
            {{ c.employee_name }}（{{ c.week_start_date }}）：{{ SKIP_REASON_LABELS[c.skip_reason ?? ''] }}
          </li>
        </ul>

        <template v-if="pastGroups.length">
          <p class="drad-warning" data-test="before-this-week-warning">
            將改動 {{ pastCount }} 筆本週以前的週班表，會以目前的班級老師展開
          </p>
          <section v-for="group in pastGroups" :key="group.week" class="drad-week is-past">
            <h4>{{ group.week }} 週</h4>
            <ul>
              <li v-for="c in group.items" :key="`${c.employee_id}-${c.week_start_date}`">
                <span class="drad-name">{{ c.employee_name }}</span>
                <span>
                  {{ ACTION_LABELS[c.action] }}：目前 {{ shiftTypeName(c.from_shift_type_id) }} → 輪值表 {{ shiftTypeName(c.to_shift_type_id) }}
                </span>
                <template v-if="c.action === 'skip'">
                  <span class="drad-reason">（{{ SKIP_REASON_LABELS[c.skip_reason ?? ''] }}）</span>
                  <label v-if="c.skip_reason === 'manual'" class="drad-overwrite">
                    <input
                      type="checkbox"
                      data-test="overwrite-checkbox"
                      :checked="selected.has(keyOf(c))"
                      @change="onCheckboxChange(c, $event)"
                    />
                    改用輪值表
                  </label>
                </template>
              </li>
            </ul>
          </section>
        </template>

        <section v-for="group in upcomingGroups" :key="group.week" class="drad-week">
          <h4>{{ group.week }} 週</h4>
          <ul>
            <li v-for="c in group.items" :key="`${c.employee_id}-${c.week_start_date}`">
              <span class="drad-name">{{ c.employee_name }}</span>
              <span>
                {{ ACTION_LABELS[c.action] }}：目前 {{ shiftTypeName(c.from_shift_type_id) }} → 輪值表 {{ shiftTypeName(c.to_shift_type_id) }}
              </span>
              <template v-if="c.action === 'skip'">
                <span class="drad-reason">（{{ SKIP_REASON_LABELS[c.skip_reason ?? ''] }}）</span>
                <label v-if="c.skip_reason === 'manual'" class="drad-overwrite">
                  <input
                    type="checkbox"
                    data-test="overwrite-checkbox"
                    :checked="selected.has(keyOf(c))"
                    @change="onCheckboxChange(c, $event)"
                  />
                  改用輪值表
                </label>
              </template>
            </li>
          </ul>
        </section>
        <p v-if="!pastGroups.length && !upcomingGroups.length" class="drad-hint">
          週班表已與輪值表一致，沒有需要變動的地方。
        </p>
      </template>
      <div class="drad-actions">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button
          type="primary"
          data-test="confirm-apply"
          :loading="applying"
          :disabled="loading || !!errorText || (!pastGroups.length && !upcomingGroups.length)"
          @click="confirm"
        >
          確認套用
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.drad-from-week { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.drad-summary { font-weight: 600; margin: 0 0 8px; }
.drad-collapsed-skips { color: var(--el-text-color-secondary); margin: 4px 0; }
.drad-collapsed-list { margin: 4px 0 8px; padding-left: 16px; color: var(--el-text-color-secondary); }
.drad-warning { color: var(--el-color-warning); font-weight: 600; margin: 8px 0 4px; }
.drad-hint { color: var(--el-text-color-secondary); margin: 4px 0; }
.drad-error { color: var(--el-color-danger); }
.drad-week h4 { margin: 12px 0 4px; }
.drad-week ul { margin: 0; padding-left: 16px; }
.drad-week li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 2px 0; }
.drad-week.is-past { background: var(--el-color-warning-light-9); border-radius: 4px; padding: 4px 8px; }
.drad-name { min-width: 72px; }
.drad-reason { color: var(--el-text-color-secondary); }
.drad-overwrite { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
.drad-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
