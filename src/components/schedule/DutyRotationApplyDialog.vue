<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { applyDutyRotation } from '@/api/dutyRotations'
import { friendlyError } from '@/utils/errorMessages'
import {
  ACTION_LABELS,
  SKIP_REASON_LABELS,
  groupChangesByWeek,
  summarizeChanges,
  type ApplyChange,
  type ApplyResult,
} from '@/utils/dutyRotationGrid'

const props = defineProps<{ modelValue: boolean; rotationId: number; fromWeekStart: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; applied: [result: ApplyResult] }>()

const loading = ref(false)
const applying = ref(false)
const changes = ref<ApplyChange[]>([])
const selected = ref<Set<string>>(new Set())
const errorText = ref('')

const keyOf = (c: ApplyChange) => `${c.employee_id}|${c.week_start_date}`
const summary = computed(() => summarizeChanges(changes.value))
const groups = computed(() => groupChangesByWeek(changes.value))

const loadPreview = async () => {
  loading.value = true
  errorText.value = ''
  selected.value = new Set()
  try {
    const res = await applyDutyRotation(props.rotationId, {
      dry_run: true,
      from_week_start: props.fromWeekStart,
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

watch(
  () => props.modelValue,
  (open) => {
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
      from_week_start: props.fromWeekStart,
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
      <p v-if="loading">正在計算差異…</p>
      <p v-else-if="errorText" class="drad-error">{{ errorText }}</p>
      <template v-else>
        <p class="drad-summary" data-test="summary">
          新增 {{ summary.create }}・更新 {{ summary.update }}・移除 {{ summary.removed }}・不變 {{ summary.unchanged }}
          <span v-if="summary.manual + summary.finalized + summary.recorded">
            ・略過 {{ summary.manual + summary.finalized + summary.recorded }}（手動 {{ summary.manual }}／已封存 {{ summary.finalized }}／已有打卡 {{ summary.recorded }}）
          </span>
        </p>
        <p v-if="fromWeekStart" class="drad-hint">只套用 {{ fromWeekStart }} 起的週次，之前的週不會變動。</p>
        <section v-for="group in groups" :key="group.week" class="drad-week">
          <h4>{{ group.week }} 週</h4>
          <ul>
            <li v-for="c in group.items" :key="`${c.employee_id}-${c.week_start_date}`">
              <span class="drad-name">{{ c.employee_name }}</span>
              <span>{{ ACTION_LABELS[c.action] }}{{ c.label ? `：${c.label}` : '' }}</span>
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
        <p v-if="!groups.length" class="drad-hint">週班表已與輪值表一致，沒有需要變動的地方。</p>
      </template>
      <div class="drad-actions">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button
          type="primary"
          data-test="confirm-apply"
          :loading="applying"
          :disabled="loading || !!errorText || !groups.length"
          @click="confirm"
        >
          確認套用
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.drad-summary { font-weight: 600; margin: 0 0 8px; }
.drad-hint { color: var(--el-text-color-secondary); margin: 4px 0; }
.drad-error { color: var(--el-color-danger); }
.drad-week h4 { margin: 12px 0 4px; }
.drad-week ul { margin: 0; padding-left: 16px; }
.drad-week li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 2px 0; }
.drad-name { min-width: 72px; }
.drad-reason { color: var(--el-text-color-secondary); }
.drad-overwrite { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
.drad-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
