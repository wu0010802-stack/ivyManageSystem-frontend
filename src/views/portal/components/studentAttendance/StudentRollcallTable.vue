<script setup>
const props = defineProps({
  students: { type: Array, required: true },
  // students[*] = { student_id, student_no, name, status, remark, ... }
  loading: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update-status',  // ({ student_id, status, remark })
  'quick-set-all', // (status: '出席' | '缺席')
])

// 點名狀態選項（依原 view 的 STATUSES 常數對齊）
const STATUS_OPTIONS = ['出席', '缺席', '病假', '事假', '遲到']

function onStatusChange(student, value) {
  emit('update-status', {
    student_id: student.student_id,
    status: value,
    remark: student.remark || '',
  })
}

function onRemarkChange(student, value) {
  emit('update-status', {
    student_id: student.student_id,
    status: student.status,
    remark: value,
  })
}
</script>

<template>
  <div class="rollcall-table" v-loading="loading">
    <div v-if="!students.length" class="empty-state">
      尚無學生
    </div>

    <template v-else>
      <div class="rollcall-actions">
        <el-button size="small" type="success" plain @click="$emit('quick-set-all', '出席')">
          全部出席
        </el-button>
        <el-button size="small" type="danger" plain @click="$emit('quick-set-all', '缺席')">
          全部缺席
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
          <el-radio-group
            :model-value="s.status"
            size="small"
            @update:model-value="onStatusChange(s, $event)"
          >
            <el-radio-button
              v-for="opt in STATUS_OPTIONS"
              :key="opt"
              :value="opt"
            >
              {{ opt }}
            </el-radio-button>
          </el-radio-group>
          <el-input
            :model-value="s.remark"
            placeholder="備註（選填）"
            size="small"
            class="remark-input"
            clearable
            @update:model-value="onRemarkChange(s, $event)"
          />
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
