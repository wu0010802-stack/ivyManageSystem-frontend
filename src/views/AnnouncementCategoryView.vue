<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getAnnouncementCategories,
  createAnnouncementCategory,
  updateAnnouncementCategory,
  deleteAnnouncementCategory,
} from '@/api/announcementCategories'
import type { Schema } from '@/api/_generated/typed'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import PageHeader from '@/components/common/PageHeader.vue'
import {
  ANNOUNCEMENT_CATEGORY_ICON_OPTIONS,
  DEFAULT_ANNOUNCEMENT_CATEGORY_ICON,
  previewIconFor,
} from '@/constants/announcementCategoryIcons'

type CategoryRow = Schema<'AnnouncementCategoryOut'>

const canWrite = computed(() => hasPermission('ANNOUNCEMENTS_WRITE'))

const rows = ref<CategoryRow[]>([])
const loading = ref(false)

const fetchRows = async () => {
  loading.value = true
  try {
    const res = await getAnnouncementCategories()
    rows.value = res.data.items
  } catch (error) {
    ElMessage.error(apiError(error, '載入公告分類失敗'))
  } finally {
    loading.value = false
  }
}

onMounted(fetchRows)

// 品牌色系供快速挑選（比照 SettingsShiftTab 班別辨識色），可自訂其他色
const PRESET_COLORS = ['#4EB87A', '#2D8F5A', '#FFD75E', '#FF8C42', '#69C4E0', '#909399', '#F56C6C', '#909399']

interface CategoryForm {
  id: number | null
  name: string
  icon: string
  color: string
  is_default: boolean
  sort_order: number
}

const dialogVisible = ref(false)
const isEdit = computed(() => form.id !== null)
const form = reactive<CategoryForm>({
  id: null,
  name: '',
  icon: DEFAULT_ANNOUNCEMENT_CATEGORY_ICON,
  color: '#4EB87A',
  is_default: false,
  sort_order: 0,
})

const openAdd = () => {
  form.id = null
  form.name = ''
  form.icon = DEFAULT_ANNOUNCEMENT_CATEGORY_ICON
  form.color = '#4EB87A'
  form.is_default = rows.value.length === 0
  form.sort_order = rows.value.length
  dialogVisible.value = true
}

const openEdit = (row: CategoryRow) => {
  form.id = row.id
  form.name = row.name
  form.icon = row.icon || DEFAULT_ANNOUNCEMENT_CATEGORY_ICON
  form.color = row.color || '#4EB87A'
  form.is_default = row.is_default
  form.sort_order = row.sort_order
  dialogVisible.value = true
}

const submitLoading = ref(false)

const handleSubmit = async () => {
  if (!form.name.trim()) {
    ElMessage.warning('請填寫分類名稱')
    return
  }
  submitLoading.value = true
  try {
    if (isEdit.value) {
      await updateAnnouncementCategory(form.id!, {
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
        is_default: form.is_default,
        sort_order: form.sort_order,
      })
    } else {
      await createAnnouncementCategory({
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
        is_default: form.is_default,
        sort_order: form.sort_order,
      })
    }
    ElMessage.success(isEdit.value ? '分類已更新' : '分類已新增')
    dialogVisible.value = false
    fetchRows()
  } catch (error) {
    // 400（無法取消唯一預設）／422 驗證錯誤皆用後端 detail 原文，不吞掉。
    ElMessage.error(apiError(error, '儲存失敗'))
  } finally {
    submitLoading.value = false
  }
}

// 設為預設：表格內快速動作，PUT is_default:true（後端交易內自動取消原本的預設）。
const settingDefaultId = ref<number | null>(null)
const setAsDefault = async (row: CategoryRow) => {
  settingDefaultId.value = row.id
  try {
    await updateAnnouncementCategory(row.id, { is_default: true })
    ElMessage.success(`「${row.name}」已設為預設分類`)
    fetchRows()
  } catch (error) {
    ElMessage.error(apiError(error, '設定預設分類失敗'))
  } finally {
    settingDefaultId.value = null
  }
}

const handleDelete = async (row: CategoryRow) => {
  try {
    await ElMessageBox.confirm(`確定要刪除分類「${row.name}」嗎？`, '確認刪除', {
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteAnnouncementCategory(row.id)
    ElMessage.success('分類已刪除')
    fetchRows()
  } catch (error) {
    // 409（使用中）／400（唯一分類或目前預設）皆為後端業務規則拒絕，
    // 原文顯示給使用者，不可靜默失敗或吞掉成通用訊息。
    ElMessage.error(apiError(error, '刪除分類失敗'))
  }
}
</script>

<template>
  <div class="announcement-category-view">
    <PageHeader title="公告分類管理" subtitle="管理公告使用的分類圖示、顏色與預設分類">
      <template #actions>
        <el-button v-if="canWrite" type="primary" @click="openAdd">新增分類</el-button>
      </template>
    </PageHeader>

    <el-table :data="rows" v-loading="loading" stripe border style="width: 100%;">
      <el-table-column label="圖示" width="70" align="center">
        <template #default="{ row }">
          <el-icon :size="20" :color="row.color || undefined">
            <component :is="previewIconFor(row.icon)" />
          </el-icon>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名稱" min-width="140" />
      <el-table-column label="顏色" width="140">
        <template #default="{ row }">
          <span v-if="row.color" class="color-cell">
            <span class="color-dot" :style="{ backgroundColor: row.color }" aria-hidden="true" />
            {{ row.color }}
          </span>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="預設" width="90" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_default" type="success" size="small">預設</el-tag>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="使用中公告數" width="120" align="right">
        <template #default="{ row }">
          <span :class="{ 'text-muted': !row.announcement_count }">{{ row.announcement_count }}</span>
        </template>
      </el-table-column>
      <el-table-column label="排序" prop="sort_order" width="72" />
      <el-table-column v-if="canWrite" label="操作" width="220" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">編輯</el-button>
          <el-button
            v-if="!row.is_default"
            link
            :loading="settingDefaultId === row.id"
            @click="setAsDefault(row)"
          >設為預設</el-button>
          <el-button link type="danger" @click="handleDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Add/Edit Dialog -->
    <el-dialog
      :title="isEdit ? '編輯分類' : '新增分類'"
      v-model="dialogVisible"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="90px">
        <el-form-item label="名稱" required>
          <el-input v-model="form.name" placeholder="例如：緊急通知" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="圖示">
          <div class="icon-grid" role="radiogroup" aria-label="選擇圖示">
            <button
              v-for="opt in ANNOUNCEMENT_CATEGORY_ICON_OPTIONS"
              :key="opt.value"
              type="button"
              class="icon-option"
              :class="{ 'icon-option--active': form.icon === opt.value }"
              :aria-pressed="form.icon === opt.value"
              :title="opt.label"
              @click="form.icon = opt.value"
            >
              <el-icon :size="18"><component :is="opt.preview" /></el-icon>
            </button>
          </div>
        </el-form-item>
        <el-form-item label="顏色">
          <el-color-picker v-model="form.color" :predefine="PRESET_COLORS" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" />
        </el-form-item>
        <el-form-item label="設為預設">
          <el-switch v-model="form.is_default" />
          <span class="form-hint">新公告未指定分類時將自動帶入預設分類</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitLoading">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.announcement-category-view {
  padding: 0;
}

.text-muted {
  color: var(--text-tertiary);
}

.color-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.color-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.icon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.icon-option {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color);
  color: var(--text-secondary);
  cursor: pointer;
}

.icon-option:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.icon-option--active {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.form-hint {
  margin-left: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
