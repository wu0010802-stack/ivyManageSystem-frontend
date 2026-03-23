<script setup>
import { reactive, ref, onMounted } from 'vue'
import { getLineConfig, updateLineConfig, testLineNotify } from '@/api/lineConfig'
import { ElMessage } from 'element-plus'
import { apiError } from '@/utils/error'

const lineConfig = reactive({
  is_enabled: false,
  target_id: '',
  has_token: false,
  has_secret: false,
  channel_access_token: '',
  channel_secret: '',
})
const loadingLine = ref(false)
const testingLine = ref(false)

const fetchLineConfig = async () => {
  loadingLine.value = true
  try {
    const res = await getLineConfig()
    lineConfig.is_enabled = res.data.is_enabled
    lineConfig.target_id = res.data.target_id || ''
    lineConfig.has_token = res.data.has_token
    lineConfig.has_secret = res.data.has_secret || false
    lineConfig.channel_access_token = ''
    lineConfig.channel_secret = ''
  } catch (error) {
    ElMessage.error('載入 LINE 設定失敗')
  } finally {
    loadingLine.value = false
  }
}

const saveLineConfig = async () => {
  loadingLine.value = true
  try {
    const payload = {
      is_enabled: lineConfig.is_enabled,
      target_id: lineConfig.target_id || null,
    }
    if (lineConfig.channel_access_token) {
      payload.channel_access_token = lineConfig.channel_access_token
    }
    if (lineConfig.channel_secret) {
      payload.channel_secret = lineConfig.channel_secret
    }
    await updateLineConfig(payload)
    ElMessage.success('LINE 通知設定已儲存')
    fetchLineConfig()
  } catch (error) {
    ElMessage.error(apiError(error, '儲存 LINE 設定失敗'))
  } finally {
    loadingLine.value = false
  }
}

const handleTestLine = async () => {
  testingLine.value = true
  try {
    await testLineNotify()
    ElMessage.success('測試訊息已發送，請確認 LINE 群組是否收到')
  } catch (error) {
    ElMessage.error(apiError(error, '測試發送失敗'))
  } finally {
    testingLine.value = false
  }
}

onMounted(fetchLineConfig)
</script>

<template>
  <div v-loading="loadingLine" style="max-width: 600px; margin-top: 16px;">
    <el-form label-width="160px">
      <el-form-item label="啟用 LINE 通知">
        <el-switch v-model="lineConfig.is_enabled" />
      </el-form-item>
      <el-form-item label="Channel Access Token">
        <el-input
          v-model="lineConfig.channel_access_token"
          type="password"
          show-password
          :placeholder="lineConfig.has_token ? '已設定（留空表示不更新）' : '請輸入 Channel Access Token'"
        />
        <div style="font-size: 12px; color: #909399; margin-top: 4px;">
          狀態：{{ lineConfig.has_token ? '已設定' : '尚未設定' }}
        </div>
      </el-form-item>
      <el-form-item label="Target ID">
        <el-input
          v-model="lineConfig.target_id"
          placeholder="群組 ID 或使用者 ID（如 Cxxxxxxx...）"
        />
      </el-form-item>
      <el-form-item label="Channel Secret">
        <el-input
          v-model="lineConfig.channel_secret"
          type="password"
          show-password
          :placeholder="lineConfig.has_secret ? '已設定（留空表示不更新）' : '請輸入 Channel Secret（Webhook 驗證用）'"
        />
        <div style="font-size: 12px; color: #909399; margin-top: 4px;">
          狀態：{{ lineConfig.has_secret ? '已設定' : '尚未設定' }}
        </div>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="saveLineConfig" :loading="loadingLine">儲存設定</el-button>
        <el-button @click="handleTestLine" :loading="testingLine" style="margin-left: 12px;">發送測試訊息</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
