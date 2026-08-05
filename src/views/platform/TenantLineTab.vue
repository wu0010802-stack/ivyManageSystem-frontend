<template>
  <div class="tenant-line">
    <el-alert
      type="info"
      :closable="false"
      title="憑證讀取一律遮罩（只回尾 4 碼），寫入後不回讀。留空 = 不變更該欄，不是清空。"
      class="tenant-line__alert"
    />

    <el-descriptions v-loading="loading" :column="1" border class="tenant-line__current">
      <el-descriptions-item label="啟用狀態">
        <el-tag :type="current?.is_enabled ? 'success' : 'info'" data-testid="line-enabled">
          {{ current?.is_enabled ? '已啟用' : '未啟用' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="頻道存取權杖（Channel access token）">
        <code data-testid="line-token-masked">{{ current?.channel_access_token_masked || '未設定' }}</code>
      </el-descriptions-item>
      <el-descriptions-item label="頻道密鑰（Channel secret）">
        <code data-testid="line-secret-masked">{{ current?.channel_secret_masked || '未設定' }}</code>
      </el-descriptions-item>
      <el-descriptions-item label="LINE Login 頻道 ID">
        <code>{{ current?.line_login_channel_id || '未設定' }}</code>
      </el-descriptions-item>
      <el-descriptions-item label="LINE Login 頻道密鑰">
        <code>{{ current?.line_login_channel_secret_masked || '未設定' }}</code>
      </el-descriptions-item>
      <el-descriptions-item label="LIFF ID">
        <code>{{ current?.liff_id || '未設定' }}</code>
      </el-descriptions-item>
      <el-descriptions-item label="推播對象 target id">
        <code>{{ current?.target_id || '未設定' }}</code>
      </el-descriptions-item>
      <el-descriptions-item label="最後更新">{{ current?.updated_at || '—' }}</el-descriptions-item>
    </el-descriptions>

    <template v-if="canManage">
      <h4>更新憑證</h4>
      <el-form label-width="220px" @submit.prevent>
        <el-form-item label="啟用">
          <el-switch v-model="form.is_enabled" data-testid="line-form-enabled" />
        </el-form-item>
        <el-form-item label="頻道存取權杖（Channel access token）">
          <el-input v-model="form.channel_access_token" type="password" show-password data-testid="line-form-token" />
        </el-form-item>
        <el-form-item label="頻道密鑰（Channel secret）">
          <el-input v-model="form.channel_secret" type="password" show-password data-testid="line-form-secret" />
        </el-form-item>
        <el-form-item label="LINE Login 頻道 ID">
          <el-input v-model="form.line_login_channel_id" maxlength="50" />
        </el-form-item>
        <el-form-item label="LINE Login 頻道密鑰">
          <el-input v-model="form.line_login_channel_secret" type="password" show-password />
        </el-form-item>
        <el-form-item label="LIFF ID">
          <el-input v-model="form.liff_id" maxlength="50" data-testid="line-form-liff" />
        </el-form-item>
        <el-form-item label="推播對象 target id">
          <el-input v-model="form.target_id" maxlength="100" />
        </el-form-item>
      </el-form>
      <div class="tenant-line__actions">
        <el-button :loading="loading" data-testid="line-reload" @click="load">重新載入</el-button>
        <el-button type="primary" :loading="saving" data-testid="line-save" @click="save">儲存</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import { getErrorMessage } from '@/utils/errorHandler'
import { getTenantLineConfig, updateTenantLineConfig, type PlatformLineConfig } from '@/api/platform'

const props = defineProps<{ tenantId: number }>()

const canManage = computed(() => hasPermission('PLATFORM_TENANTS_MANAGE'))
const loading = ref(false)
const saving = ref(false)
const current = ref<PlatformLineConfig | null>(null)

const form = ref({
  is_enabled: false,
  channel_access_token: '',
  channel_secret: '',
  line_login_channel_id: '',
  line_login_channel_secret: '',
  liff_id: '',
  target_id: '',
})

function resetForm(cfg: PlatformLineConfig | null): void {
  form.value = {
    is_enabled: Boolean(cfg?.is_enabled),
    // 憑證欄一律留空：畫面上永遠不會有明文可回填，留空語意 = 不變更。
    channel_access_token: '',
    channel_secret: '',
    line_login_channel_id: cfg?.line_login_channel_id ?? '',
    line_login_channel_secret: '',
    liff_id: cfg?.liff_id ?? '',
    target_id: cfg?.target_id ?? '',
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await getTenantLineConfig(props.tenantId)
    current.value = res.data ?? null
    resetForm(current.value)
  } catch (err) {
    ElMessage.error(getErrorMessage(err, 'LINE 設定載入失敗'))
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  saving.value = true
  try {
    // 只送有填的欄位：空字串在此語意為「不變更」，一律不進 payload，
    // 否則按一次儲存就會把既有 token 洗成空值（憑證無法從畫面回填）。
    const payload: Record<string, string | boolean> = { is_enabled: form.value.is_enabled }
    const optional: (keyof typeof form.value)[] = [
      'channel_access_token',
      'channel_secret',
      'line_login_channel_id',
      'line_login_channel_secret',
      'liff_id',
      'target_id',
    ]
    for (const key of optional) {
      const value = form.value[key]
      if (typeof value === 'string' && value.trim() !== '') payload[key] = value.trim()
    }
    const res = await updateTenantLineConfig(props.tenantId, payload)
    current.value = res.data ?? current.value
    resetForm(current.value)
    ElMessage.success('LINE 設定已更新')
  } catch (err) {
    ElMessage.error(getErrorMessage(err, 'LINE 設定儲存失敗'))
  } finally {
    saving.value = false
  }
}

watch(() => props.tenantId, load, { immediate: true })
</script>

<style scoped>
.tenant-line__alert {
  margin-bottom: var(--space-4);
}

.tenant-line__current {
  margin-bottom: var(--space-5);
}

.tenant-line__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
