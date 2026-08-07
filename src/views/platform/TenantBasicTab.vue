<template>
  <div class="tenant-basic">
    <el-form label-width="140px" @submit.prevent>
      <el-form-item label="slug">
        <el-input :model-value="tenant.slug" disabled data-testid="basic-slug" />
        <div class="field-hint">建立後不可修改（公開連結 / og tags / LINE 綁定都掛在它上面）。</div>
      </el-form-item>
      <el-form-item label="園所名稱">
        <el-input v-model="form.name" maxlength="100" data-testid="basic-name" />
      </el-form-item>
      <el-form-item label="顯示名稱">
        <el-input v-model="form.display_name" maxlength="100" data-testid="basic-display-name" />
      </el-form-item>
      <el-form-item label="簡稱">
        <el-input v-model="form.short_name" maxlength="50" data-testid="basic-short-name" />
      </el-form-item>
      <el-form-item label="主題色">
        <el-input v-model="form.theme_color" maxlength="16" placeholder="#1e88e5" data-testid="basic-theme-color" />
      </el-form-item>
      <el-form-item label="對外網址">
        <el-input v-model="form.public_origin" maxlength="255" placeholder="https://branch2.example.tw" data-testid="basic-public-origin" />
        <div class="field-hint">總部產生的登入連結一律以本欄組出；留空時 UI 會隱藏連結而非猜一個。</div>
      </el-form-item>
      <el-form-item label="自訂網域">
        <el-input v-model="form.custom_domain" maxlength="255" data-testid="basic-custom-domain" />
      </el-form-item>
      <el-form-item label="電話">
        <el-input v-model="contactKnown.phone" maxlength="50" placeholder="02-1234-5678" data-testid="basic-contact-phone" />
      </el-form-item>
      <el-form-item label="Email">
        <el-input v-model="contactKnown.email" maxlength="100" placeholder="hi@example.tw" data-testid="basic-contact-email" />
      </el-form-item>
      <el-form-item label="統一編號">
        <el-input v-model="contactKnown.tax_id" maxlength="20" placeholder="12345678" data-testid="basic-contact-tax-id" />
      </el-form-item>
      <el-form-item label="地址">
        <el-input v-model="contactKnown.address" maxlength="255" data-testid="basic-contact-address" />
      </el-form-item>
      <el-form-item label="其他資訊（進階，選填）">
        <el-input
          v-model="contactOtherText"
          type="textarea"
          :rows="3"
          placeholder='{"note": "…"}'
          data-testid="basic-contact-other"
        />
        <div v-if="contactOtherError" class="field-error" data-testid="contact-other-error">{{ contactOtherError }}</div>
        <div v-else class="field-hint">
          電話／Email／統編／地址以外的聯絡資訊（JSON 物件，選填）；上面四個已知欄位不需要在這裡重複填寫。
        </div>
      </el-form-item>
    </el-form>

    <div class="tenant-basic__actions">
      <el-button v-if="canManage" type="primary" :loading="saving" data-testid="basic-save" @click="save">儲存</el-button>
    </div>

    <el-divider />

    <section class="logo-section">
      <h4>校徽（logo）</h4>
      <p class="field-hint">
        上傳後由 <code>GET /api/public/tenant-logo</code> 依 Host 提供給該分校的公開頁；
        SVG 不放行（公開端點吐 SVG 等於在自家 origin 開 stored XSS）。
      </p>
      <div class="logo-section__body">
        <img v-if="tenant.logo_url" :src="tenant.logo_url" alt="校徽預覽" class="logo-preview" data-testid="logo-preview" />
        <span v-else class="muted" data-testid="logo-empty">尚未上傳</span>
        <input
          v-if="canManage"
          ref="fileInput"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          class="logo-input"
          data-testid="logo-input"
          @change="onFileChange"
        />
      </div>
    </section>

    <el-divider />

    <section class="onboarding-section">
      <h4>
        設定完成度
        <el-tag :type="allDone ? 'success' : 'warning'" size="small" data-testid="onboarding-overall">
          {{ allDone ? '已完成' : '尚有待辦' }}
        </el-tag>
      </h4>
      <ul class="onboarding-list">
        <li data-testid="onboarding-roles">
          <el-tag :type="tenant.system_roles_ok === false ? 'danger' : 'success'" size="small">
            {{ tenant.system_roles_ok === false ? '缺角色' : '角色齊備' }}
          </el-tag>
          七個系統角色
        </li>
        <li data-testid="onboarding-config">
          <el-tag :type="missingConfig.length ? 'warning' : 'success'" size="small">
            {{ missingConfig.length ? `缺 ${missingConfig.length} 項` : '已完成' }}
          </el-tag>
          必要系統設定
          <div v-if="missingConfig.length" class="key-list">{{ missingConfig.join('、') }}</div>
        </li>
        <li data-testid="onboarding-brand">
          <el-tag :type="missingBrand.length ? 'warning' : 'success'" size="small">
            {{ missingBrand.length ? `缺 ${missingBrand.length} 項` : '已完成' }}
          </el-tag>
          品牌字串（見「品牌設定」分頁）
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import { getErrorMessage } from '@/utils/errorHandler'
import { updateTenant, uploadTenantLogo, type TenantDetail } from '@/api/platform'
import { onboardingComplete } from './tenantDisplay'

const props = defineProps<{ tenant: TenantDetail }>()
const emit = defineEmits<{ updated: [TenantDetail] }>()

const canManage = computed(() => hasPermission('PLATFORM_TENANTS_MANAGE'))
const saving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const form = ref({
  name: '',
  display_name: '',
  short_name: '',
  theme_color: '',
  public_origin: '',
  custom_domain: '',
})

/**
 * `contact_json` 已知常見欄位（`models/tenant.py` 註解：
 * `contact_json = Column(JSON, nullable=True)  # {phone, address, email, tax_id}`；
 * `tax_id` 即統編，見交接文件）。拆成獨立輸入框，不再要求操作人員手打 JSON。
 * 其餘未知 key 走 `contactOtherText`（進階、選填），避免遺失既有資料。
 */
const KNOWN_CONTACT_KEYS = ['phone', 'email', 'tax_id', 'address'] as const
type KnownContactKey = (typeof KNOWN_CONTACT_KEYS)[number]

const contactKnown = ref<Record<KnownContactKey, string>>({ phone: '', email: '', tax_id: '', address: '' })
const contactOtherText = ref('')
const contactOtherError = ref<string | null>(null)

const missingConfig = computed(() => props.tenant.missing_config_keys ?? [])
const missingBrand = computed(() => props.tenant.missing_brand_keys ?? [])
const allDone = computed(() => onboardingComplete(props.tenant))

/** 把後端 `contact_json` 物件拆成「已知欄位」與「其餘 key」兩份。 */
function splitContact(raw: Record<string, unknown> | null | undefined): {
  known: Record<KnownContactKey, string>
  other: Record<string, unknown>
} {
  const known: Record<KnownContactKey, string> = { phone: '', email: '', tax_id: '', address: '' }
  const other: Record<string, unknown> = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if ((KNOWN_CONTACT_KEYS as readonly string[]).includes(k)) {
        known[k as KnownContactKey] = v == null ? '' : String(v)
      } else {
        other[k] = v
      }
    }
  }
  return { known, other }
}

watch(
  () => props.tenant,
  (t) => {
    form.value = {
      name: t.name ?? '',
      display_name: t.display_name ?? '',
      short_name: t.short_name ?? '',
      theme_color: t.theme_color ?? '',
      public_origin: t.public_origin ?? '',
      custom_domain: t.custom_domain ?? '',
    }
    const { known, other } = splitContact(t.contact_json)
    contactKnown.value = known
    contactOtherText.value = Object.keys(other).length ? JSON.stringify(other, null, 2) : ''
    contactOtherError.value = null
  },
  { immediate: true },
)

/** 空字串一律送 `null`（＝清除該欄），避免把「沒填」寫成空白值污染公開頁。 */
const orNull = (v: string): string | null => (v.trim() === '' ? null : v.trim())

/** 解析「其他資訊」textarea：留空視為沒有其餘 key，格式錯誤時回 `undefined` 擋下儲存。 */
function parseContactOther(): Record<string, unknown> | undefined {
  const raw = contactOtherText.value.trim()
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      contactOtherError.value = '請填 JSON 物件（例：{"note": "…"}）'
      return undefined
    }
    contactOtherError.value = null
    return parsed as Record<string, unknown>
  } catch {
    contactOtherError.value = 'JSON 格式錯誤'
    return undefined
  }
}

/** 已知欄位（非空才送）+ 其他資訊合併回 `contact_json`；全空時送 `null`（＝不設定）。 */
function buildContact(): Record<string, unknown> | null | undefined {
  const other = parseContactOther()
  if (other === undefined) return undefined
  const merged: Record<string, unknown> = { ...other }
  for (const key of KNOWN_CONTACT_KEYS) {
    const value = contactKnown.value[key].trim()
    if (value) merged[key] = value
  }
  return Object.keys(merged).length ? merged : null
}

async function save(): Promise<void> {
  const contact = buildContact()
  if (contact === undefined) return
  if (!form.value.name.trim()) {
    ElMessage.warning('園所名稱不可為空')
    return
  }
  saving.value = true
  try {
    const res = await updateTenant(props.tenant.id, {
      name: form.value.name.trim(),
      display_name: orNull(form.value.display_name),
      short_name: orNull(form.value.short_name),
      theme_color: orNull(form.value.theme_color),
      public_origin: orNull(form.value.public_origin),
      custom_domain: orNull(form.value.custom_domain),
      contact_json: contact,
    })
    ElMessage.success('已儲存')
    if (res.data) emit('updated', res.data)
  } catch (err) {
    ElMessage.error(getErrorMessage(err, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const res = await uploadTenantLogo(props.tenant.id, file)
    ElMessage.success('校徽已更新')
    if (res.data) emit('updated', res.data)
  } catch (err) {
    ElMessage.error(getErrorMessage(err, '校徽上傳失敗'))
  } finally {
    // 同一個檔案再選一次也要能觸發 change
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<style scoped>
.tenant-basic__actions {
  display: flex;
  justify-content: flex-end;
}

.field-hint {
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}

.field-error {
  color: var(--el-color-danger);
  font-size: var(--text-xs);
}

.muted {
  color: var(--text-tertiary);
}

.logo-section__body {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-3);
}

.logo-preview {
  width: 72px;
  height: 72px;
  object-fit: contain;
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-md);
}

.onboarding-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.key-list {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  word-break: break-all;
}
</style>
