<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { Check, Refresh } from '@element-plus/icons-vue'
import { getSystemConfig, updateSystemConfig } from '@/api/systemConfig'
import { hasPermission } from '@/utils/auth'
import {
  SYSTEM_CONFIG_SECTIONS,
  ALL_SYSTEM_CONFIG_FIELDS,
  type SystemConfigFieldDef,
  type SystemConfigFieldType,
} from '@/constants/onboardingSystemConfigs'
import {
  normalizeConfigBoolean,
  booleanToConfigValue,
  looksLikeJsonArray,
} from '@/utils/systemConfigFormat'

interface ConfigRow {
  key: string
  label: string
  hint?: string
  type: SystemConfigFieldType
  warnJsonArray: boolean
  /** 目前已存的值（DB 或 404 時視同空字串）；用來比對是否變更。 */
  config_value: string
  /** true = DB 尚未有此 key（含 404），顯示「尚未設定」；非錯誤狀態。 */
  is_default: boolean
  /** 呼叫 GET 時發生非 404 的錯誤（如 5xx / 網路錯誤），提示使用者重新整理重試。 */
  loadError: boolean
  description?: string
  _editValue: string
  _editBool: boolean
}

interface ConfigSectionRows {
  title: string
  hint: string
  rows: ConfigRow[]
}

const canEdit = ref(hasPermission('SETTINGS_WRITE'))

const sections = ref<ConfigSectionRows[]>([])
const loading = ref(false)
const savingKey = ref<string | null>(null)

const buildRow = (
  def: SystemConfigFieldDef,
  data: { config_value: string; description?: string; is_default?: boolean } | null,
  loadError = false,
): ConfigRow => {
  const value = data?.config_value ?? ''
  return {
    key: def.key,
    label: def.label,
    hint: def.hint,
    type: def.type,
    warnJsonArray: !!def.warnJsonArray,
    config_value: value,
    is_default: data ? !!data.is_default : true,
    loadError,
    description: data?.description,
    _editValue: value,
    _editBool: normalizeConfigBoolean(value),
  }
}

/** 逐 key 讀取（而非用 prefix 列表）：只有單筆 GET 在查無資料時會回 404，
 * 需要個別 catch 才能把「尚未設定」與「載入失敗」分開處理。 */
const fetchOne = async (def: SystemConfigFieldDef): Promise<ConfigRow> => {
  try {
    const res = await getSystemConfig(def.key)
    const data = res.data as { config_value: string; description?: string; is_default?: boolean }
    return buildRow(def, data)
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status
    if (status === 404) {
      // 查無資料＝尚未設定，前端視為可編輯的空白列，不當錯誤處理。
      return buildRow(def, null)
    }
    return buildRow(def, null, true)
  }
}

const fetchAll = async () => {
  loading.value = true
  try {
    const rowsByKey = new Map<string, ConfigRow>()
    const results = await Promise.all(ALL_SYSTEM_CONFIG_FIELDS.map(fetchOne))
    results.forEach((row) => rowsByKey.set(row.key, row))

    sections.value = SYSTEM_CONFIG_SECTIONS.map((section) => ({
      title: section.title,
      hint: section.hint,
      rows: section.fields.map((def) => rowsByKey.get(def.key)!),
    }))

    const failedCount = results.filter((row) => row.loadError).length
    if (failedCount > 0) {
      ElMessage.error(`部分系統設定載入失敗（${failedCount} 項），請重新整理頁面後再試`)
    }
  } finally {
    loading.value = false
  }
}

const isRowDirty = (row: ConfigRow): boolean =>
  row.type === 'switch'
    ? row._editBool !== normalizeConfigBoolean(row.config_value)
    : row._editValue !== row.config_value

const showJsonWarning = (row: ConfigRow): boolean =>
  row.warnJsonArray && looksLikeJsonArray(row._editValue)

const saveConfig = async (row: ConfigRow) => {
  if (!isRowDirty(row)) return
  savingKey.value = row.key
  try {
    const valueToSend = row.type === 'switch' ? booleanToConfigValue(row._editBool) : row._editValue
    const res = await updateSystemConfig(row.key, { config_value: valueToSend })
    const data = res.data as { config_value: string; description?: string; is_default?: boolean }
    row.config_value = data.config_value
    row.is_default = !!data.is_default
    row.description = data.description
    row.loadError = false
    row._editValue = data.config_value
    row._editBool = normalizeConfigBoolean(data.config_value)
    ElMessage.success(`已更新「${row.label}」`)
  } catch (e) {
    ElMessage.error(friendlyError(`儲存「${row.label}」失敗`, e))
  } finally {
    savingKey.value = null
  }
}

const resetConfig = (row: ConfigRow) => {
  row._editValue = row.config_value
  row._editBool = normalizeConfigBoolean(row.config_value)
}

onMounted(() => {
  fetchAll()
})
</script>

<template>
  <div class="tenant-config-tab" v-loading="loading">
    <el-card v-for="section in sections" :key="section.title" class="section-card">
      <template #header>
        <div>
          <h3 style="margin: 0 0 4px;">{{ section.title }}</h3>
          <span class="hint">{{ section.hint }}</span>
        </div>
      </template>

      <div v-for="row in section.rows" :key="row.key" class="config-row">
        <div class="config-row__label">
          <b>{{ row.label }}</b>
          <div class="config-row__meta">
            <code>{{ row.key }}</code>
            <el-tag v-if="row.is_default && !row.loadError" type="info" size="small" style="margin-left: 6px;">
              尚未設定
            </el-tag>
            <el-tag v-if="row.loadError" type="danger" size="small" style="margin-left: 6px;">
              載入失敗
            </el-tag>
          </div>
          <div v-if="row.hint" class="config-row__hint">{{ row.hint }}</div>
        </div>

        <div class="config-row__input">
          <el-switch
            v-if="row.type === 'switch'"
            v-model="row._editBool"
            :disabled="!canEdit"
          />
          <template v-else>
            <el-input
              v-model="row._editValue"
              :disabled="!canEdit"
              placeholder="尚未設定"
            />
            <div v-if="showJsonWarning(row)" class="json-warning">
              請用逗號分隔字串，不要用 JSON 陣列格式（後端只認逗號分隔，JSON 格式會靜默失效）
            </div>
          </template>
        </div>

        <div class="config-row__actions">
          <el-button
            v-if="canEdit"
            type="primary"
            size="small"
            :icon="Check"
            :disabled="!isRowDirty(row)"
            :loading="savingKey === row.key"
            @click="saveConfig(row)"
          >儲存</el-button>
          <el-button
            v-if="canEdit && isRowDirty(row)"
            size="small"
            :icon="Refresh"
            @click="resetConfig(row)"
          >還原</el-button>
        </div>
      </div>
    </el-card>

    <el-alert
      v-if="!canEdit"
      type="warning"
      :closable="false"
      show-icon
      style="margin-top: 16px;"
      title="目前帳號無系統設定編輯權限（SETTINGS_WRITE）；如需修改請聯絡管理員。"
    />
  </div>
</template>

<style scoped>
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  display: block;
  line-height: 1.5;
}
code {
  background: var(--el-fill-color-light);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}
.section-card {
  margin-bottom: 16px;
}
.config-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.config-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.config-row__label {
  flex: 0 0 280px;
}
.config-row__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.config-row__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.5;
}
.config-row__input {
  flex: 1 1 auto;
  min-width: 0;
}
.json-warning {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.5;
}
.config-row__actions {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
}
</style>
