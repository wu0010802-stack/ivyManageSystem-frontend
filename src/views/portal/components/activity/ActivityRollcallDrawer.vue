<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { PropType } from 'vue'

type BeforeCloseFn = (done: () => void) => void

interface RollcallStudent {
  is_present: boolean | null
  student_name?: string
  class_name?: string
  [key: string]: unknown
}

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  drawerTitle: { type: String, default: '點名' },
  drawerLoading: { type: Boolean, default: false },
  drawerSession: { type: Object, default: null },
  sortedStudents: { type: Array as PropType<RollcallStudent[]>, default: () => [] },
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

// 顯示用搜尋 / 篩選（只影響顯示，儲存仍以完整 students 為來源，由父層 composable 處理）。
const searchText = ref('')
const onlyUnmarked = ref(false)

// 換場次（drawerSession 變）時重置篩選，避免上一場的「只看未點名」殘留。
watch(() => props.drawerSession, () => {
  searchText.value = ''
  onlyUnmarked.value = false
})

// displayStudents 內的物件為 sortedStudents 同一參考 → v-model 仍直接改原物件，
// 篩選不會漏存（被濾掉的列其值留在 source，儲存時由父層完整 students 序列化）。
const displayStudents = computed<RollcallStudent[]>(() => {
  const q = searchText.value.trim().toLowerCase()
  return props.sortedStudents.filter((s) => {
    if (onlyUnmarked.value && s.is_present !== null) return false
    if (!q) return true
    const name = String(s.student_name ?? '').toLowerCase()
    const cls = String(s.class_name ?? '').toLowerCase()
    return name.includes(q) || cls.includes(q)
  })
})
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

      <!-- 即時搜尋 + 只看未點名（僅影響顯示，儲存仍以完整名冊為來源）-->
      <div class="drawer-filter-bar">
        <el-input
          v-model="searchText"
          size="small"
          placeholder="搜尋姓名 / 班級"
          clearable
          style="flex: 1; min-width: 140px"
        />
        <el-switch
          v-model="onlyUnmarked"
          size="small"
          active-text="只看未點名"
          inline-prompt
        />
      </div>

      <el-table
        :data="displayStudents"
        :row-class-name="({ row }) => row.is_present === null ? 'unmarked-row' : ''"
        border
        style="margin-top: 12px"
        size="small"
        empty-text="無符合條件的學生"
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
.drawer-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
