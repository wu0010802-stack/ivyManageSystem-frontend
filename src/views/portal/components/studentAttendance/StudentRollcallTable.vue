<script setup lang="ts">
import { reactive } from 'vue'

interface RollcallStudent { student_id?: number; student_no?: string; name?: string; status?: string; remark?: string; [key: string]: unknown }

defineProps<{
  students: RollcallStudent[]
  loading?: boolean
  disabled?: boolean
  pendingCount?: number
}>()

const emit = defineEmits<{
  'update-status': [payload: { student_id: number | undefined; status: string; remark: string }]
  'quick-set-all': [status: string]
}>()

// 點名狀態選項（依原 view 的 STATUSES 常數對齊）
const STATUS_OPTIONS = ['出席', '缺席', '病假', '事假', '遲到']

// 手動點開備註的學生（已有備註者自動視為展開）
const openedRemarks = reactive(new Set<number | string>())
function isRemarkOpen(student: RollcallStudent): boolean {
  if (student.remark) return true
  const key = student.student_id ?? student.student_no ?? ''
  return openedRemarks.has(key)
}
function openRemark(student: RollcallStudent) {
  openedRemarks.add(student.student_id ?? student.student_no ?? '')
}

function onStatusChange(student: RollcallStudent, value: string) {
  emit('update-status', {
    student_id: student.student_id,
    status: value,
    remark: student.remark || '',
  })
}

function onRemarkChange(student: RollcallStudent, value: string) {
  emit('update-status', {
    student_id: student.student_id,
    status: student.status ?? '',
    remark: value,
  })
}
</script>

<template>
  <div class="rollcall-table" v-loading="loading ?? false">
    <div v-if="!students.length" class="empty-state">
      尚無學生
    </div>

    <template v-else>
      <div class="rollcall-actions">
        <el-button size="small" type="success" :disabled="disabled || pendingCount === 0" plain @click="$emit('quick-set-all', '出席')">
          {{ pendingCount === undefined ? '全部出席' : `未點名者出席（${pendingCount} 人）` }}
        </el-button>
        <el-button size="small" type="danger" :disabled="disabled || pendingCount === 0" plain @click="$emit('quick-set-all', '缺席')">
          {{ pendingCount === undefined ? '全部缺席' : `未點名者缺席（${pendingCount} 人）` }}
        </el-button>
      </div>

      <div class="student-list">
        <div
          v-for="s in students"
          :key="s.student_id"
          class="student-row"
          :class="{ 'is-absent': s.status === '缺席' }"
        >
          <span class="student-no">{{ s.student_no }}</span>
          <span class="student-name">{{ s.name }}</span>
          <!-- 點擊已預選的出席也代表確認，必須通知父頁從待點名集合移除。 -->
          <el-radio-group
            :model-value="s.status"
            :disabled="disabled"
            size="small"
            @update:model-value="(v) => onStatusChange(s, String(v))"
          >
            <el-radio-button
              v-for="opt in STATUS_OPTIONS"
              :key="opt"
              :value="opt"
              @click.capture="s.status === opt && onStatusChange(s, opt)"
            >
              {{ opt }}
            </el-radio-button>
          </el-radio-group>
          <!-- 備註預設收起（P2-15）：一班 27 人時，27 個常駐輸入框讓整頁
               長到 9,200px，而備註是例外才填的東西。有值或點開才展開。 -->
          <el-input
            v-if="isRemarkOpen(s)"
            :model-value="s.remark"
            :disabled="disabled"
            placeholder="備註（選填）"
            size="small"
            class="remark-input"
            clearable
            @update:model-value="onRemarkChange(s, $event)"
          />
          <el-button
            v-else
            link
            type="primary"
            class="remark-toggle"
            :aria-label="`為 ${s.name} 加備註`"
            @click="openRemark(s)"
          >
            加備註
          </el-button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rollcall-table {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.rollcall-actions {
  display: flex;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-2, 8px);
  flex-wrap: wrap;
}

.student-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.student-row {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
  padding: var(--space-2, 8px);
  background: var(--pt-surface-card, #fff);
  border: var(--pt-hairline, 1px solid #e5e7eb);
  border-radius: var(--radius-md, 8px);
  flex-wrap: wrap;
}

.remark-toggle {
  margin-left: auto;
}

.student-row.is-absent {
  background: var(--color-warning-soft);
}

.student-no {
  font-size: 12px;
  color: var(--pt-text-muted, #9ca3af);
  min-width: 50px;
}

.student-name {
  font-weight: 500;
  color: var(--pt-text-strong, #111827);
  min-width: 80px;
}

.remark-input {
  flex: 1;
  min-width: 120px;
}

.empty-state {
  text-align: center;
  padding: var(--space-6, 24px);
  color: var(--pt-text-muted, #9ca3af);
}

/* 中等視口（≤ 600px）：保留 row 為大方向，避免 480px 才切讓 481-600px 寬度
 * 內 radio-group 跟 input 嚴重擠壓 wrap。學號+姓名同行，radio-group 第二行
 * 用 grid 5 等寬，每個 button 強制 44px 觸碰目標。備註輸入第三行。
 * 為什麼 600px 而不是 768px：768px 已是 iPad portrait，table 仍可正常排，
 * 600px 對應大多數手機橫向與小尺寸 phablet。 */
@media (max-width: 600px) {
  .student-row {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2, 8px);
  }

  /* radio-group 內部用 grid 平分 5 個選項，避免 wrap 後高低不齊或被截斷 */
  .student-row :deep(.el-radio-group) {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    width: 100%;
  }
  .student-row :deep(.el-radio-group .el-radio-button) {
    width: 100%;
  }
  .student-row :deep(.el-radio-group .el-radio-button__inner) {
    width: 100%;
    min-height: var(--touch-target-min, 44px);
    padding: 8px 2px;
    font-size: var(--text-xs, 12px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remark-input {
    flex: none;
    min-width: 0;
    width: 100%;
  }
}
</style>
