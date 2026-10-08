<script setup lang="ts">
// 班級「⋯」操作選單：年級分組表（桌機列／手機列）與卡片檢視共用同一份項目與停用防呆。
// 停用項在班上仍有在學生時 disabled 並寫出原因——後端會拒絕，與其按下去才報錯，不如選單內就說清楚。
import { computed } from 'vue'
import { Clock, Delete, Edit, MoreFilled } from '@element-plus/icons-vue'
import type { ClassroomCommand, ClassroomRow } from './types'

const props = defineProps<{
  classroom: ClassroomRow
  canWrite: boolean
  canReadStudents: boolean
}>()

const emit = defineEmits<{ command: [cmd: ClassroomCommand] }>()

const enrolled = computed(() => props.classroom.current_count ?? 0)
const canDisable = computed(() => props.canWrite && props.classroom.is_active !== false)
const disableBlocked = computed(() => enrolled.value > 0)
</script>

<template>
  <el-dropdown
    v-if="canWrite || canReadStudents"
    trigger="click"
    @command="(cmd: ClassroomCommand) => emit('command', cmd)"
  >
    <el-button
      class="row-menu-btn"
      size="small"
      text
      :icon="MoreFilled"
      data-test="row-menu"
      :aria-label="`更多操作：${classroom.name}`"
    />
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item v-if="canWrite" command="edit" :icon="Edit">編輯班級</el-dropdown-item>
        <el-dropdown-item v-if="canReadStudents" command="history" :icon="Clock">異動紀錄</el-dropdown-item>
        <el-dropdown-item
          v-if="canDisable"
          command="disable"
          :icon="Delete"
          divided
          :disabled="disableBlocked"
          class="dropdown-danger"
        >
          <span class="menu-item-text">
            <span>停用班級</span>
            <span v-if="disableBlocked" class="menu-item-hint">仍有 {{ enrolled }} 名在學，請先轉班</span>
          </span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.dropdown-danger {
  color: var(--el-color-danger);
}

.dropdown-danger.is-disabled {
  color: var(--el-text-color-disabled);
}

.menu-item-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  line-height: 1.4;
}

.menu-item-hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

@media (--to-sm) {
  .row-menu-btn {
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
  }
}
</style>
