<template>
  <div class="tenant-brand">
    <p class="tenant-brand__intro">
      這些字串會出現在該分校的瀏覽器標題、PWA 安裝名稱與分享卡片上。
      <strong>留空不是壞事</strong>——未填的 key 不會進 <code>tenant-meta</code> payload，
      前端會落到內建預設值；填了空字串反而會把預設值蓋成空白。
    </p>

    <el-alert
      v-if="missingKeys.length"
      type="warning"
      :closable="false"
      data-testid="brand-missing"
      :title="`尚有 ${missingKeys.length} 個品牌字串未填`"
      class="tenant-brand__alert"
    />
    <el-alert
      v-else-if="loaded"
      type="success"
      :closable="false"
      data-testid="brand-complete"
      title="品牌字串已全部填寫"
      class="tenant-brand__alert"
    />

    <el-form v-loading="loading" label-position="top">
      <section v-for="group in groups" :key="group.key" class="brand-group">
        <h4 class="brand-group__title">{{ group.title }}</h4>
        <div class="brand-group__fields">
          <el-form-item v-for="field in group.fields" :key="field.key" :label="field.label">
            <el-input
              v-model="values[field.key]"
              :data-testid="`brand-input-${field.key}`"
              :placeholder="field.missing ? '未填' : ''"
            />
            <div class="field-key">
              <code>{{ field.key }}</code>
              <el-tag v-if="field.missing" size="small" type="warning">未填</el-tag>
            </div>
          </el-form-item>
        </div>
      </section>
    </el-form>

    <div class="tenant-brand__actions">
      <el-button data-testid="brand-reload" :loading="loading" @click="load">重新載入</el-button>
      <el-button
        v-if="canManage"
        type="primary"
        :loading="saving"
        :disabled="!dirtyKeys.length"
        data-testid="brand-save"
        @click="save"
      >
        儲存變更（{{ dirtyKeys.length }}）
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import { getErrorMessage } from '@/utils/errorHandler'
import { getTenantBrand, updateTenantBrand } from '@/api/platform'

const props = defineProps<{ tenantId: number }>()

const canManage = computed(() => hasPermission('PLATFORM_TENANTS_MANAGE'))

const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const knownKeys = ref<string[]>([])
const missingKeys = ref<string[]>([])
/** key → 目前輸入值（空字串代表「未填」，送出時轉 null）。 */
const values = reactive<Record<string, string>>({})
/** 伺服器上的原值，用來算 dirty（只送有改的 key）。 */
const original = reactive<Record<string, string>>({})

/**
 * 分組純粹由 key 結構推導（`brand.<group>.<field>` / `brand.<field>`），
 * **不在前端複製一份後端的中文標籤表**——那會變成第二份會漂移的目錄。
 * 欄位標籤取最後一段並把底線換成空白；完整 key 一律顯示在輸入框下方。
 */
const GROUP_TITLES: Record<string, string> = {
  titles: '瀏覽器標題（各端）',
  share: '分享 / og 卡片',
  manifest: 'PWA 安裝名稱',
  theme: '主題色',
  contact: '聯絡資訊',
  _root: '基本品牌字串',
}

interface BrandField {
  key: string
  label: string
  missing: boolean
}

const groups = computed(() => {
  const missing = new Set(missingKeys.value)
  const buckets = new Map<string, BrandField[]>()
  for (const key of knownKeys.value) {
    const rest = key.startsWith('brand.') ? key.slice('brand.'.length) : key
    const segments = rest.split('.')
    const groupKey = segments.length > 1 ? segments[0] : '_root'
    const label = segments[segments.length - 1].replace(/_/g, ' ')
    const list = buckets.get(groupKey) ?? []
    list.push({ key, label, missing: missing.has(key) })
    buckets.set(groupKey, list)
  }
  return [...buckets.entries()]
    .map(([key, fields]) => ({ key, title: GROUP_TITLES[key] ?? key, fields }))
    // 已知分組照 GROUP_TITLES 的宣告順序，未知分組排在後面（後端新增分組時不會消失）
    .sort((a, b) => groupOrder(a.key) - groupOrder(b.key))
})

const KNOWN_GROUP_ORDER = Object.keys(GROUP_TITLES)
const groupOrder = (key: string): number => {
  const idx = KNOWN_GROUP_ORDER.indexOf(key)
  return idx === -1 ? KNOWN_GROUP_ORDER.length : idx
}

const dirtyKeys = computed(() => knownKeys.value.filter((k) => (values[k] ?? '') !== (original[k] ?? '')))

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await getTenantBrand(props.tenantId)
    const payload = res.data
    knownKeys.value = payload?.known_keys ?? []
    missingKeys.value = payload?.missing_keys ?? []
    const stored = (payload?.values ?? {}) as Record<string, string | null>
    for (const key of knownKeys.value) {
      const v = stored[key] ?? ''
      values[key] = v
      original[key] = v
    }
    loaded.value = true
  } catch (err) {
    ElMessage.error(getErrorMessage(err, '品牌設定載入失敗'))
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  const changed = dirtyKeys.value
  if (!changed.length) return
  saving.value = true
  try {
    // 清空欄位＝送 null（刪除該 key，回退前端預設值），不是送空字串。
    const payload: Record<string, string | null> = {}
    for (const key of changed) payload[key] = values[key].trim() === '' ? null : values[key]
    const res = await updateTenantBrand(props.tenantId, { values: payload })
    ElMessage.success(`已更新 ${changed.length} 個品牌字串`)
    missingKeys.value = res.data?.missing_keys ?? missingKeys.value
    const stored = (res.data?.values ?? {}) as Record<string, string | null>
    for (const key of knownKeys.value) {
      const v = stored[key] ?? ''
      values[key] = v
      original[key] = v
    }
  } catch (err) {
    ElMessage.error(getErrorMessage(err, '品牌設定儲存失敗'))
  } finally {
    saving.value = false
  }
}

watch(() => props.tenantId, load, { immediate: true })
</script>

<style scoped>
.tenant-brand__intro {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.tenant-brand__alert {
  margin-bottom: var(--space-4);
}

.brand-group__title {
  margin: var(--space-4) 0 var(--space-2);
}

.brand-group__fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0 var(--space-4);
}

.field-key {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  word-break: break-all;
}

.tenant-brand__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
</style>
