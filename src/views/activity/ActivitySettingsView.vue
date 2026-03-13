<template>
  <div class="activity-settings">
    <h2>報名時間設定</h2>

    <el-card style="max-width: 500px" v-loading="loading">
      <el-form :model="form" label-width="110px">
        <el-form-item label="開放報名">
          <el-switch v-model="form.is_open" active-text="開放" inactive-text="關閉" />
        </el-form-item>
        <el-form-item label="開放時間">
          <el-date-picker
            v-model="form.open_at"
            type="datetime"
            placeholder="選擇開放時間"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DDTHH:mm"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="截止時間">
          <el-date-picker
            v-model="form.close_at"
            type="datetime"
            placeholder="選擇截止時間"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DDTHH:mm"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSave" :loading="saving">儲存設定</el-button>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="savedAt"
        type="success"
        :title="`已於 ${savedAt} 儲存`"
        :closable="false"
        style="margin-top: 8px"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getRegistrationTime, updateRegistrationTime } from '@/api/activity'

const loading = ref(false)
const saving = ref(false)
const savedAt = ref('')
const form = ref({ is_open: false, open_at: null, close_at: null })

async function fetchSettings() {
  loading.value = true
  try {
    const res = await getRegistrationTime()
    form.value = {
      is_open: res.data.is_open ?? false,
      open_at: res.data.open_at || null,
      close_at: res.data.close_at || null,
    }
  } catch {
    ElMessage.error('載入設定失敗')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await updateRegistrationTime(form.value)
    ElMessage.success('設定已儲存')
    savedAt.value = new Date().toLocaleString('zh-TW')
  } catch {
    ElMessage.error('儲存失敗')
  } finally {
    saving.value = false
  }
}

onMounted(fetchSettings)
</script>

<style scoped>
.activity-settings { padding: 16px; }
.activity-settings h2 { margin-bottom: 16px; font-size: 20px; font-weight: 600; }
</style>
