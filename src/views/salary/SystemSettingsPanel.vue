<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Refresh } from '@element-plus/icons-vue'
import {
  listSystemConfigs,
  updateSystemConfig,
} from '@/api/systemConfig'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'

interface BankConfig {
  config_key: string
  config_value: string
  description?: string
  is_default?: boolean
  _editValue: string
  _dirty: boolean
  [key: string]: unknown
}

const canEdit = ref(hasPermission('SETTINGS_WRITE'))

const bankConfigs = ref<BankConfig[]>([])
const loading = ref(false)
const savingKey = ref<string | null>(null)

const fetchBankConfigs = async () => {
  loading.value = true
  try {
    const res = await listSystemConfigs('bank')
    bankConfigs.value = ((res.data as { items?: Record<string, unknown>[] }).items || []).map((it) => ({
      ...it,
      _editValue: it.config_value as string,
      _dirty: false,
    })) as BankConfig[]
  } catch (e) {
    ElMessage.error('載入失敗：' + apiError(e, (e as Error).message))
  } finally {
    loading.value = false
  }
}

const onValueChange = (cfg: BankConfig) => {
  cfg._dirty = cfg._editValue !== cfg.config_value
}

const saveConfig = async (cfg: BankConfig) => {
  if (!cfg._dirty) return
  savingKey.value = cfg.config_key
  try {
    const res = await updateSystemConfig(cfg.config_key, {
      config_value: cfg._editValue,
    })
    Object.assign(cfg, res.data, {
      _editValue: (res.data as { config_value: string }).config_value,
      _dirty: false,
    })
    ElMessage.success(`已更新「${cfg.description || cfg.config_key}」`)
  } catch (e) {
    ElMessage.error('儲存失敗：' + apiError(e, (e as Error).message))
  } finally {
    savingKey.value = null
  }
}

const resetConfig = (cfg: BankConfig) => {
  cfg._editValue = cfg.config_value
  cfg._dirty = false
}

onMounted(() => {
  fetchBankConfigs()
})
</script>

<template>
  <div class="system-settings-panel">
    <el-card>
      <template #header>
        <div>
          <h3 style="margin: 0 0 4px;">銀行轉帳設定</h3>
          <span class="hint">
            設定本園所的公司付款銀行帳號與戶名；會顯示在所有「轉帳名冊」Excel 頂端。
            首次未設定時，會使用內建預設值（顯示「預設值」標籤）。
          </span>
        </div>
      </template>

      <el-table :data="bankConfigs" v-loading="loading" stripe style="width: 100%">
        <el-table-column label="項目" width="280">
          <template #default="{ row }">
            <div>
              <b>{{ row.description || row.config_key }}</b>
              <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px;">
                <code>{{ row.config_key }}</code>
                <el-tag v-if="row.is_default" type="info" size="small" style="margin-left: 6px;">
                  預設值（未存 DB）
                </el-tag>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="目前值">
          <template #default="{ row }">
            <el-input
              v-model="row._editValue"
              :disabled="!canEdit"
              :placeholder="row.config_value"
              @input="onValueChange(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canEdit"
              type="primary"
              size="small"
              :icon="Check"
              :disabled="!row._dirty"
              :loading="savingKey === row.config_key"
              @click="saveConfig(row)"
            >儲存</el-button>
            <el-button
              v-if="canEdit && row._dirty"
              size="small"
              :icon="Refresh"
              @click="resetConfig(row)"
            >還原</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-alert
        v-if="!canEdit"
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
        title="目前帳號無系統設定編輯權限（SETTINGS_WRITE）；如需修改請聯絡管理員。"
      />
    </el-card>
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
</style>
