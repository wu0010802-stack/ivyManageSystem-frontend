<template>
  <div class="platform-tenants">
    <PageHeader title="分校管理" subtitle="建立、停用與檢視平台上的所有分校">
      <template #actions>
        <el-button :loading="pending" data-testid="refresh" @click="refresh(true)">重新整理</el-button>
        <el-button
          v-if="canManage"
          type="primary"
          data-testid="open-create"
          @click="openCreate"
        >
          建立分校
        </el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="loadError"
      type="error"
      :closable="false"
      data-testid="load-error"
      :title="loadErrorText"
      class="platform-tenants__alert"
    />

    <el-table :data="rows" v-loading="pending" data-testid="tenant-table" row-key="id">
      <el-table-column label="分校" min-width="200">
        <template #default="{ row }">
          <router-link class="tenant-link" :to="`/platform/tenants/${row.id}`" :data-testid="`tenant-link-${row.id}`">
            {{ row.display_name || row.name }}
          </router-link>
          <div class="tenant-slug">{{ row.slug }}</div>
        </template>
      </el-table-column>
      <el-table-column label="類型" width="90">
        <template #default="{ row }">{{ tenantKindLabel(row.kind) }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="110">
        <template #default="{ row }">
          <el-tag :type="tenantStatusTagType(row.status)" :data-testid="`status-${row.id}`">
            {{ tenantStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="學生 / 員工" width="130">
        <template #default="{ row }">
          <span v-if="row.student_count === null || row.student_count === undefined">—</span>
          <span v-else>{{ row.student_count }} / {{ row.employee_count ?? '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="對外網址" min-width="200">
        <template #default="{ row }">
          <a v-if="originOf(row)" :href="originOf(row)!" target="_blank" rel="noopener">{{ originOf(row) }}</a>
          <span v-else class="muted">未設定</span>
        </template>
      </el-table-column>
      <el-table-column v-if="canManage" label="操作" width="200" align="right">
        <template #default="{ row }">
          <template v-if="row.kind !== 'platform'">
            <el-button
              v-if="row.status === 'active'"
              link
              type="warning"
              :data-testid="`suspend-${row.id}`"
              @click="changeStatus(row, 'suspend')"
            >停用</el-button>
            <el-button
              v-else-if="row.status === 'suspended'"
              link
              type="success"
              :data-testid="`resume-${row.id}`"
              @click="changeStatus(row, 'resume')"
            >恢復</el-button>
            <el-button
              v-if="row.status !== 'archived'"
              link
              type="danger"
              :data-testid="`archive-${row.id}`"
              @click="changeStatus(row, 'archive')"
            >封存</el-button>
          </template>
          <span v-else class="muted">總部不可停用</span>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState title="沒有分校資料" description="總部功能未開通時本頁一律為空（後端 PLATFORM_ENABLED）。" />
      </template>
    </el-table>

    <!-- 建立分校：先 dry-run 驗前置條件，再實建（CT-X-12 三條件閘門） -->
    <el-dialog v-model="createVisible" title="建立分校" width="560px" data-testid="create-dialog">
      <el-form label-width="120px" @submit.prevent>
        <el-form-item label="slug">
          <el-input v-model="form.slug" data-testid="create-slug" placeholder="例：branch2（將成為 branch2.<base domain>）" />
          <div v-if="slugError" class="field-error" data-testid="slug-error">{{ slugError }}</div>
          <div v-else class="field-hint">建立後不可修改：公開連結、og tags 與 LINE 綁定都掛在它上面。</div>
        </el-form-item>
        <el-form-item label="園所名稱">
          <el-input v-model="form.name" data-testid="create-name" maxlength="100" />
        </el-form-item>
        <el-form-item label="初始管理員">
          <el-input v-model="form.admin_username" data-testid="create-admin-username" maxlength="50" />
        </el-form-item>
        <el-form-item label="初始密碼">
          <el-input
            v-model="form.admin_password"
            type="password"
            show-password
            data-testid="create-admin-password"
            placeholder="留空由系統產生一次性密碼"
          />
        </el-form-item>
        <el-form-item label="複製角色自">
          <el-select v-model="form.copy_roles_from_tenant_id" clearable placeholder="不複製（僅建立系統角色）" data-testid="create-copy-roles">
            <el-option
              v-for="t in selectableSchools"
              :key="t.id"
              :label="`${t.display_name || t.name}（${t.slug}）`"
              :value="t.id"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="blockers.length"
        type="error"
        :closable="false"
        title="前置條件未滿足，尚不能建立"
        data-testid="create-blockers"
        class="platform-tenants__alert"
      >
        <ul class="blocker-list">
          <li v-for="b in blockers" :key="b">{{ b }}</li>
        </ul>
      </el-alert>
      <el-alert
        v-else-if="dryRunPassed"
        type="success"
        :closable="false"
        title="前置條件檢查通過，可以建立"
        data-testid="create-dryrun-ok"
        class="platform-tenants__alert"
      />

      <template #footer>
        <el-button data-testid="create-cancel" @click="createVisible = false">取消</el-button>
        <el-button :loading="checking" data-testid="create-dryrun" @click="runDryRun">檢查前置條件</el-button>
        <el-button
          type="primary"
          :disabled="!dryRunPassed"
          :loading="creating"
          data-testid="create-submit"
          @click="submitCreate"
        >
          確認建立
        </el-button>
      </template>
    </el-dialog>

    <!-- 一次性密碼只顯示這一次；連結一律由後端 public_origin 組（GAP-09） -->
    <el-dialog v-model="resultVisible" title="分校已建立" width="520px" data-testid="create-result">
      <p class="result-line">分校 slug：<strong>{{ createResult?.slug }}</strong></p>
      <p class="result-line">管理員帳號：<strong>{{ createResult?.admin_username || '—' }}</strong></p>
      <p v-if="createResult?.admin_one_time_password" class="result-line">
        一次性密碼：<code data-testid="one-time-password">{{ createResult.admin_one_time_password }}</code>
      </p>
      <p v-if="resultLoginUrl" class="result-line">
        登入網址：<a :href="resultLoginUrl" target="_blank" rel="noopener" data-testid="result-login-url">{{ resultLoginUrl }}</a>
      </p>
      <p v-else class="result-line muted" data-testid="result-no-origin">
        該分校尚未設定對外網址（public_origin），請在分校詳情頁補上後再把登入連結交給對方。
      </p>
      <el-alert
        type="warning"
        :closable="false"
        title="密碼只顯示這一次，關閉後無法再查看；首次登入會強制改密碼。"
        class="platform-tenants__alert"
      />
      <template #footer>
        <el-button type="primary" data-testid="result-close" @click="closeResult">我已記錄</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { hasPermission } from '@/utils/auth'
import { buildTenantOrigin } from '@/utils/tenant'
import { getErrorMessage } from '@/utils/errorHandler'
import {
  archiveTenant,
  createTenant,
  resumeTenant,
  suspendTenant,
  type TenantCreateResult,
  type TenantSummary,
} from '@/api/platform'
import { usePlatformTenants } from './usePlatformTenants'
import {
  tenantKindLabel,
  tenantStatusLabel,
  tenantStatusTagType,
  validateTenantSlug,
} from './tenantDisplay'

const canManage = computed(() => hasPermission('PLATFORM_TENANTS_MANAGE'))

const { tenants, selectableSchools, error: loadError, pending, refresh } = usePlatformTenants()

const rows = computed(() => tenants.value)
const loadErrorText = computed(() => getErrorMessage(loadError.value, '分校清單載入失敗'))

const originOf = (t: TenantSummary): string | null => buildTenantOrigin(t)

// ── 狀態切換 ──

const STATUS_ACTIONS = {
  suspend: { request: suspendTenant, title: '停用分校', hint: '停用後該分校無法登入、公開報名與家長端也會被擋；排程與資料保留照跑。' },
  resume: { request: resumeTenant, title: '恢復分校', hint: '恢復後該分校立即可以登入。' },
  archive: { request: archiveTenant, title: '封存分校', hint: '封存後該分校的網址會回 404，且不再出現在報表預設範圍。' },
} as const

async function changeStatus(row: TenantSummary, action: keyof typeof STATUS_ACTIONS): Promise<void> {
  const meta = STATUS_ACTIONS[action]
  try {
    await ElMessageBox.confirm(
      `${meta.hint}\n\n確定要對「${row.display_name || row.name}」執行嗎？`,
      meta.title,
      { type: 'warning', confirmButtonText: '確定', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消
  }
  try {
    await meta.request(row.id)
    ElMessage.success(`${meta.title}完成`)
    // 後端在同一交易後已呼 invalidate_tenant_cache()；前端只需重抓清單。
    await refresh(true)
  } catch (err) {
    ElMessage.error(getErrorMessage(err, `${meta.title}失敗`))
  }
}

// ── 建立分校（dry-run → 實建）──

const createVisible = ref(false)
const checking = ref(false)
const creating = ref(false)
const dryRunPassed = ref(false)
const blockers = ref<string[]>([])
const resultVisible = ref(false)
const createResult = ref<TenantCreateResult | null>(null)

const form = ref({
  slug: '',
  name: '',
  admin_username: 'admin',
  admin_password: '',
  copy_roles_from_tenant_id: null as number | null,
})

const slugError = computed(() => (form.value.slug ? validateTenantSlug(form.value.slug) : null))

const resultLoginUrl = computed(() => {
  const t = tenants.value.find((x) => x.slug === createResult.value?.slug)
  // public_origin 缺值時**隱藏連結**（fail-closed，GAP-09）：
  // 用 window.location.origin 組會產出 hq.<base> 的連結，收到的人根本登不進去。
  return t ? buildTenantOrigin(t) : null
})

function openCreate(): void {
  form.value = { slug: '', name: '', admin_username: 'admin', admin_password: '', copy_roles_from_tenant_id: null }
  blockers.value = []
  dryRunPassed.value = false
  createVisible.value = true
}

function buildPayload(dryRun: boolean) {
  return {
    slug: form.value.slug.trim(),
    name: form.value.name.trim(),
    admin_username: form.value.admin_username.trim() || 'admin',
    ...(form.value.admin_password ? { admin_password: form.value.admin_password } : {}),
    ...(form.value.copy_roles_from_tenant_id
      ? { copy_roles_from_tenant_id: form.value.copy_roles_from_tenant_id }
      : {}),
    dry_run: dryRun,
  }
}

function validateForm(): boolean {
  if (slugError.value || !form.value.slug.trim()) {
    ElMessage.warning(slugError.value || '請輸入 slug')
    return false
  }
  if (!form.value.name.trim()) {
    ElMessage.warning('請輸入園所名稱')
    return false
  }
  return true
}

async function runDryRun(): Promise<void> {
  if (!validateForm()) return
  checking.value = true
  dryRunPassed.value = false
  blockers.value = []
  try {
    const res = await createTenant(buildPayload(true))
    blockers.value = res.data?.blockers ?? []
    dryRunPassed.value = blockers.value.length === 0
  } catch (err) {
    ElMessage.error(getErrorMessage(err, '前置條件檢查失敗'))
  } finally {
    checking.value = false
  }
}

async function submitCreate(): Promise<void> {
  if (!dryRunPassed.value || !validateForm()) return
  creating.value = true
  try {
    const res = await createTenant(buildPayload(false))
    createResult.value = res.data ?? null
    createVisible.value = false
    // 先刷新清單再開結果視窗：登入連結要靠清單裡的 public_origin 才組得出來。
    await refresh(true)
    resultVisible.value = true
  } catch (err) {
    ElMessage.error(getErrorMessage(err, '建立分校失敗'))
  } finally {
    creating.value = false
  }
}

function closeResult(): void {
  resultVisible.value = false
  createResult.value = null
}
</script>

<style scoped>
.platform-tenants__alert {
  margin: var(--space-3) 0;
}

.tenant-link {
  color: var(--el-color-primary);
  font-weight: 600;
  text-decoration: none;
}

.tenant-slug {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.muted {
  color: var(--text-tertiary);
}

.field-error {
  color: var(--el-color-danger);
  font-size: var(--text-xs);
}

.field-hint {
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}

.blocker-list {
  margin: 0;
  padding-left: var(--space-5);
}

.result-line {
  margin: var(--space-2) 0;
}

.result-line code {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--neutral-100, #f1f5f9);
  font-size: var(--text-base);
  letter-spacing: 1px;
}
</style>
