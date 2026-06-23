<script setup lang="ts">
import type { PropType } from 'vue'

type BeforeCloseFn = (done: () => void) => void

defineProps({
  modelValue: { type: Boolean, required: true },
  drawerTitle: { type: String, default: '點名' },
  drawerLoading: { type: Boolean, default: false },
  drawerSession: { type: Object, default: null },
  sortedStudents: { type: Array, default: () => [] },
  saveLoading: { type: Boolean, default: false },
  drawerPresentCount: { type: Number, default: 0 },
  drawerAbsentCount: { type: Number, default: 0 },
  drawerUnmarkedCount: { type: Number, default: 0 },
  // 未存點名守衛：由父層注入（父層持有 isDirty），dirty 時攔截 ESC/X。
  beforeClose: { type: Function as PropType<BeforeCloseFn>, default: undefined },
})

defineEmits([
  'update:modelValue',
  'set-all-present',  // (value: boolean)
  'save',
])
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    :title="drawerTitle"
    direction="rtl"
    size="460px"
    :close-on-click-modal="false"
    :before-close="beforeClose"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-if="drawerLoading" v-loading="true" style="min-height: 200px" />
    <template v-else-if="drawerSession">
      <!-- 進度條 -->
      <el-progress
        :percentage="drawerSession.total > 0 ? Math.round(((drawerPresentCount + drawerAbsentCount) / drawerSession.total) * 100) : 0"
        :format="() => `已點名 ${drawerPresentCount + drawerAbsentCount} / ${drawerSession.total} 人`"
        style="margin-bottom: 10px"
      />

      <!-- 快速操作 + 統計 Tags -->
      <div class="drawer-top-actions">
        <el-space>
          <el-button size="small" @click="$emit('set-all-present', true)">全部出席</el-button>
          <el-button size="small" @click="$emit('set-all-present', false)">全部缺席</el-button>
        </el-space>
        <el-space>
          <el-tag type="info">共 {{ drawerSession.total }} 位</el-tag>
          <el-tag type="success">出席 {{ drawerPresentCount }}</el-tag>
          <el-tag type="danger">缺席 {{ drawerAbsentCount }}</el-tag>
          <el-tag type="warning">未點名 {{ drawerUnmarkedCount }}</el-tag>
        </el-space>
      </div>

      <el-table
        :data="sortedStudents"
        :row-class-name="({ row }) => row.is_present === null ? 'unmarked-row' : ''"
        border
        style="margin-top: 12px"
        size="small"
      >
        <el-table-column label="班級" prop="class_name" width="80" align="center" />
        <el-table-column label="姓名" prop="student_name" min-width="90" />
        <el-table-column label="出席" width="100" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.is_present"
              :active-value="true"
              :inactive-value="false"
              active-text="出席"
              inactive-text="缺席"
              inline-prompt
            />
          </template>
        </el-table-column>
        <el-table-column label="備註" min-width="100">
          <template #default="{ row }">
            <el-input
              v-model="row.attendance_notes"
              size="small"
              placeholder="備註"
            />
          </template>
        </el-table-column>
      </el-table>

      <div class="drawer-actions">
        <el-button
          type="primary"
          :loading="saveLoading"
          @click="$emit('save')"
        >儲存點名</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.drawer-top-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}
.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
