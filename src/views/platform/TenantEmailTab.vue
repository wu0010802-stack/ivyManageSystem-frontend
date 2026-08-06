<template>
  <div class="tenant-email">
    <el-alert
      type="info"
      :closable="false"
      title="憑證讀取一律遮罩（只回尾 4 碼），寫入後不回讀。留空 = 不變更該欄，不是清空。"
      class="tenant-email__alert"
    />
    <el-alert
      type="warning"
      :closable="false"
      title="寄件人名稱（from_name）同時是報名成功信 {org_name} 樣板的內容；沒填時該租戶的信件會顯示總部共用預設值，不是這間分校自己的名字。"
      class="tenant-email__alert"
    />

    <el-descriptions v-loading="loading" :column="1" border class="tenant-email__current">
      <el-descriptions-item label="啟用狀態">
        <el-tag :type="current?.is_enabled ? 'success' : 'info'" data-testid="email-enabled">
          {{ current?.is_enabled ? '已啟用' : '未啟用' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="寄件人名稱（from_name）">
        <code data-testid="email-from-name">{{ current?.from_name || '未設定（沿用總部共用預設值）' }}</code>
      </el-descriptions-item>
      <el-descriptions-item label="寄件信箱（from_address）">
        <code>{{ current?.from_address || '未設定（沿用總部共用預設值）' }}</code>
      </el-descriptions-item>
      <el-descriptions-item label="Resend API Key">
        <code data-testid="email-key-masked">{{ current?.resend_api_key_masked || '未設定（沿用總部共用金鑰）' }}</code>
      </el-descriptions-item>
      <el-descriptions-item label="最後更新">{{ current?.updated_at || '—' }}</el-descriptions-item>
    </el-descriptions>

    <template v-if="canManage">
      <h4>更新設定</h4>
      <el-form label-width="200px" @submit.prevent>
        <el-form-item label="啟用">
          <el-switch v-model="form.is_enabled" data-testid="email-form-enabled" />
        </el-form-item>
        <el-form-item label="寄件人名稱（from_name）">
          <el-input v-model="form.from_name" maxlength="100" data-testid="email-form-from-name" />
        </el-form-item>
        <el-form-item label="寄件信箱（from_address）">
          <el-input v-model="form.from_address" maxlength="255" data-testid="email-form-from-address" />
        </el-form-item>
        <el-form-item label="Resend API Key">
          <el-input
            v-model="form.resend_api_key"
            type="password"
            show-password
            data-testid="email-form-key"
          />
        </el-form-item>
      </el-form>
      <div class="tenant-email__actions">
        <el-button :loading="loading" data-testid="email-reload" @click="load">重新載入</el-button>
        <el-button type="primary" :loading="saving" data-testid="email-save" @click="save">儲存</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import { getErrorMessage } from '@/utils/errorHandler'
import { getTenantEmailConfig, updateTenantEmailConfig, type PlatformEmailConfig } from '@/api/platform'

const props = defineProps<{ tenantId: number }>()

const canManage = computed(() => hasPermission('PLATFORM_TENANTS_MANAGE'))
const loading = ref(false)
const saving = ref(false)
const current = ref<PlatformEmailConfig | null>(null)

const form = ref({
  is_enabled: false,
  from_name: '',
  from_address: '',
  // 憑證欄一律留空：畫面上永遠不會有明文可回填，留空語意 = 不變更。
  resend_api_key: '',
})

function resetForm(cfg: PlatformEmailConfig | null): void {
  form.value = {
    is_enabled: Boolean(cfg?.is_enabled),
    from_name: cfg?.from_name ?? '',
    from_address: cfg?.from_address ?? '',
    resend_api_key: '',
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await getTenantEmailConfig(props.tenantId)
    current.value = res.data ?? null
    resetForm(current.value)
  } catch (err) {
    ElMessage.error(getErrorMessage(err, 'Email 設定載入失敗'))
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  saving.value = true
  try {
    // 只送有填的欄位：空字串在此語意為「不變更」，一律不進 payload，
    // 否則按一次儲存就會把既有 API Key 洗成空值（憑證無法從畫面回填）。
    const payload: Record<string, string | boolean> = { is_enabled: form.value.is_enabled }
    const optional: (keyof typeof form.value)[] = ['from_name', 'from_address', 'resend_api_key']
    for (const key of optional) {
      const value = form.value[key]
      if (typeof value === 'string' && value.trim() !== '') payload[key] = value.trim()
    }
    const res = await updateTenantEmailConfig(props.tenantId, payload)
    current.value = res.data ?? current.value
    resetForm(current.value)
    ElMessage.success('Email 設定已更新')
  } catch (err) {
    ElMessage.error(getErrorMessage(err, 'Email 設定儲存失敗'))
  } finally {
    saving.value = false
  }
}

watch(() => props.tenantId, load, { immediate: true })
</script>

<style scoped>
.tenant-email__alert {
  margin-bottom: var(--space-4);
}

.tenant-email__current {
  margin-bottom: var(--space-5);
}

.tenant-email__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
