<template>
  <div class="role-sync">
    <PageHeader title="角色同步" subtitle="把來源分校的角色與權限套用到其他分校">
      <template #actions>
        <el-button data-testid="tenants-refresh" @click="refreshTenants(true)">重新整理分校清單</el-button>
      </template>
    </PageHeader>

    <el-alert
      type="info"
      :closable="false"
      class="role-sync__alert"
      title="預設為「預覽（dry-run）」：後端會實際跑一遍再回滾，回報的內容就是實跑會發生的事。"
    />

    <el-form label-width="140px" class="role-sync__form" @submit.prevent>
      <el-form-item label="來源分校">
        <el-select v-model="sourceId" filterable placeholder="選擇來源" data-testid="sync-source">
          <el-option
            v-for="t in selectableSchools"
            :key="t.id"
            :label="`${t.display_name || t.name}（${t.slug}）`"
            :value="t.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="目標分校">
        <el-select
          v-model="targetIds"
          multiple
          filterable
          collapse-tags
          placeholder="可多選"
          data-testid="sync-targets"
          class="role-sync__targets"
        >
          <el-option
            v-for="t in targetOptions"
            :key="t.id"
            :label="`${t.display_name || t.name}（${t.slug}）`"
            :value="t.id"
          />
        </el-select>
        <div class="field-hint">來源分校不會出現在目標清單；總部（hq）不可作為來源或目標。</div>
      </el-form-item>
      <el-form-item label="模式">
        <el-radio-group v-model="mode" data-testid="sync-mode">
          <el-radio label="merge">合併（只補缺少的角色與權限）</el-radio>
          <el-radio label="overwrite">覆寫（目標分校自訂的角色設定會被蓋掉）</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <div class="role-sync__actions">
      <el-button
        type="primary"
        :loading="running"
        :disabled="!canSubmit"
        data-testid="sync-preview"
        @click="run(true)"
      >
        預覽差異（dry-run）
      </el-button>
      <el-button
        v-if="canManage"
        type="danger"
        plain
        :loading="running"
        :disabled="!canSubmit || !previewed"
        data-testid="sync-apply"
        @click="confirmApply"
      >
        實際執行
      </el-button>
    </div>

    <section v-if="report" class="role-sync__result" data-testid="sync-result">
      <h3>
        {{ report.dry_run ? '預覽結果（未寫入）' : '執行結果（已寫入）' }}
        <el-tag :type="report.dry_run ? 'info' : 'success'" size="small">
          {{ report.dry_run ? 'dry-run' : '已套用' }}
        </el-tag>
      </h3>

      <el-table :data="report.results ?? []" row-key="tenant_id" data-testid="sync-result-table">
        <el-table-column label="目標分校" min-width="160">
          <template #default="{ row }">{{ row.tenant_slug }}</template>
        </el-table-column>
        <el-table-column label="狀態" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.errors?.length" type="danger" size="small" :data-testid="`sync-status-${row.tenant_id}`">失敗</el-tag>
            <el-tag v-else-if="row.committed" type="success" size="small" :data-testid="`sync-status-${row.tenant_id}`">已寫入</el-tag>
            <el-tag v-else type="info" size="small" :data-testid="`sync-status-${row.tenant_id}`">未寫入</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="新增角色" min-width="160">
          <template #default="{ row }">
            <span :data-testid="`sync-created-${row.tenant_id}`">{{ listText(row.created) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新角色" min-width="160">
          <template #default="{ row }">
            <span :data-testid="`sync-updated-${row.tenant_id}`">{{ listText(row.updated) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="略過" min-width="140">
          <template #default="{ row }">{{ listText(row.skipped) }}</template>
        </el-table-column>
        <el-table-column label="連帶影響" min-width="180">
          <template #default="{ row }">
            <div v-if="row.users_token_bumped">{{ row.users_token_bumped }} 位使用者需重新登入</div>
            <div v-if="row.legacy_snapshots_migrated">{{ row.legacy_snapshots_migrated }} 筆舊快照已轉移</div>
            <div v-if="row.errors?.length" class="error-text">{{ row.errors.join('；') }}</div>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="resultsWithChanges.length" class="role-sync__diff" data-testid="sync-diff">
        <h4>權限差異</h4>
        <div
          v-for="row in resultsWithChanges"
          :key="row.tenant_id"
          class="role-sync__diff-target"
          :data-testid="`sync-diff-${row.tenant_id}`"
        >
          <div class="role-sync__diff-tenant">{{ row.tenant_slug }}</div>
          <ul class="role-sync__diff-list">
            <li
              v-for="change in row.role_changes"
              :key="change.code"
              class="role-sync__diff-role"
              :data-testid="`sync-diff-${row.tenant_id}-${change.code}`"
            >
              <div class="role-sync__diff-head">
                <span class="role-sync__diff-code">{{ change.code }}</span>
                <el-tag :type="change.action === 'created' ? 'success' : 'warning'" size="small">
                  {{ change.action === 'created' ? '新建' : '覆寫' }}
                </el-tag>
                <span v-if="labelText(change)" class="role-sync__diff-meta">{{ labelText(change) }}</span>
                <span v-if="change.description_changed" class="role-sync__diff-meta">描述將更新</span>
              </div>
              <div v-if="change.permissions_added?.length" class="perm-added" data-testid="sync-diff-added">
                ＋ 新增權限：{{ change.permissions_added.join('、') }}
              </div>
              <div v-if="change.permissions_removed?.length" class="perm-removed" data-testid="sync-diff-removed">
                － 移除權限：{{ change.permissions_removed.join('、') }}
              </div>
              <div
                v-if="!change.permissions_added?.length && !change.permissions_removed?.length"
                class="role-sync__diff-meta"
              >
                權限不變
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { hasPermission } from '@/utils/auth'
import { classifyError, ErrorType, getErrorMessage } from '@/utils/errorHandler'
import { syncRoles, type RoleSyncReport, type RoleSyncRoleChange } from '@/api/platform'
import { usePlatformTenants } from './usePlatformTenants'

const canManage = computed(() => hasPermission('PLATFORM_TENANTS_MANAGE'))

const { selectableSchools, refresh: refreshTenants } = usePlatformTenants({ schoolsOnly: true })

const sourceId = ref<number | null>(null)
const targetIds = ref<number[]>([])
const mode = ref<'merge' | 'overwrite'>('merge')
const running = ref(false)
const previewed = ref(false)
const report = ref<RoleSyncReport | null>(null)
/**
 * 預覽回傳的來源快照雜湊（F57／MT-08）。實跑時帶回，後端比對當下來源；
 * 預覽後來源被改過 → 409，確保寫入的就是總部看過的那份差異。
 */
const snapshotHash = ref<string | null>(null)
/** 表單參數世代：在途的預覽回來時若參數已變，結果不得解鎖實跑。 */
let paramsGeneration = 0

const targetOptions = computed(() => selectableSchools.value.filter((t) => t.id !== sourceId.value))
const canSubmit = computed(() => Boolean(sourceId.value) && targetIds.value.length > 0)
const resultsWithChanges = computed(() =>
  (report.value?.results ?? []).filter((row) => row.role_changes?.length),
)

const listText = (items?: string[] | null): string => (items?.length ? items.join('、') : '—')

function labelText(change: RoleSyncRoleChange): string {
  if (change.action === 'created') return change.label_to ? `名稱：${change.label_to}` : ''
  if ((change.label_from ?? null) === (change.label_to ?? null)) return ''
  return `名稱：${change.label_from || '（空白）'} → ${change.label_to || '（空白）'}`
}

/**
 * 回到「必須重新預覽」：清掉雜湊與 previewed；畫面上的預覽差異一併收掉，
 * 免得把舊參數／舊來源的差異當成接下來要寫入的內容。
 */
function invalidatePreview(): void {
  previewed.value = false
  snapshotHash.value = null
  if (report.value?.dry_run) report.value = null
}

// 來源、目標或模式任一變更，預覽的差異與雜湊就不再對應接下來的實跑。
watch([sourceId, targetIds, mode], () => {
  paramsGeneration += 1
  invalidatePreview()
}, { deep: true })

/** 後端 F57 409 沒有結構化 code，detail 為固定句；以關鍵片語辨識「來源在預覽後已變動」。 */
const SOURCE_CHANGED_MARKER = '預覽之後已變動'

async function run(dryRun: boolean): Promise<void> {
  if (!canSubmit.value || !sourceId.value) return
  const generation = paramsGeneration
  running.value = true
  try {
    const res = await syncRoles({
      source_tenant_id: sourceId.value,
      // 來源被選進目標會被後端拒；先在前端濾掉，避免整批因一個明顯錯誤而失敗。
      target_tenant_ids: targetIds.value.filter((id) => id !== sourceId.value),
      mode: mode.value,
      dry_run: dryRun,
      ...(dryRun ? {} : { source_snapshot_hash: snapshotHash.value }),
    })
    if (dryRun) {
      // 在途期間改了參數：這份預覽對應的是舊參數，不能拿它的雜湊解鎖實跑。
      if (generation !== paramsGeneration) return
      report.value = res.data ?? null
      snapshotHash.value = res.data?.source_snapshot_hash ?? null
      previewed.value = true
      ElMessage.success('預覽完成，請確認差異後再執行')
    } else {
      report.value = res.data ?? null
      previewed.value = false
      snapshotHash.value = null
      ElMessage.success('角色同步已執行')
    }
  } catch (err) {
    if (!dryRun && classifyError(err) === ErrorType.CONFLICT) {
      // 實跑 409 一律回到需預覽：來源在預覽後被改過（F57），或目標正被另一個同步鎖住
      // （advisory lock）——後者結束後目標角色也已不同，舊預覽同樣不可信。
      invalidatePreview()
      const message = getErrorMessage(err, '同步失敗')
      if (message.includes(SOURCE_CHANGED_MARKER)) {
        ElMessage.warning('來源已變動，請重新預覽')
      } else {
        ElMessage.error(message)
      }
      return
    }
    ElMessage.error(getErrorMessage(err, dryRun ? '預覽失敗' : '同步失敗'))
  } finally {
    running.value = false
  }
}

async function confirmApply(): Promise<void> {
  if (mode.value === 'overwrite') {
    try {
      await ElMessageBox.prompt(
        '覆寫模式會蓋掉目標分校自訂的角色設定，且無法自動還原。請輸入 OVERWRITE 以確認。',
        '確認覆寫',
        {
          confirmButtonText: '執行覆寫',
          cancelButtonText: '取消',
          inputPattern: /^OVERWRITE$/,
          inputErrorMessage: '請完整輸入 OVERWRITE',
        },
      )
    } catch {
      return
    }
  } else {
    try {
      await ElMessageBox.confirm(
        `即將把來源分校的角色同步到 ${targetIds.value.length} 間分校，確定執行？`,
        '確認同步',
        { type: 'warning', confirmButtonText: '執行', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  await run(false)
}
</script>

<style scoped>
.role-sync__alert {
  margin-bottom: var(--space-4);
}

.role-sync__form {
  max-width: 720px;
}

.role-sync__targets {
  width: 100%;
}

.role-sync__actions {
  display: flex;
  gap: var(--space-3);
  margin: var(--space-4) 0;
}

.role-sync__result h3 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.field-hint {
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}

.error-text {
  color: var(--el-color-danger);
}

.role-sync__diff {
  margin-top: var(--space-4);
}

.role-sync__diff-target + .role-sync__diff-target {
  margin-top: var(--space-3);
}

.role-sync__diff-tenant {
  font-weight: 600;
}

.role-sync__diff-list {
  margin: var(--space-2) 0 0;
  padding-left: var(--space-4);
}

.role-sync__diff-role + .role-sync__diff-role {
  margin-top: var(--space-2);
}

.role-sync__diff-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.role-sync__diff-code {
  font-family: var(--font-mono, monospace);
}

.role-sync__diff-meta {
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}

.perm-added,
.perm-removed {
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.perm-added {
  color: var(--el-color-success);
}

.perm-removed {
  color: var(--el-color-danger);
}
</style>
