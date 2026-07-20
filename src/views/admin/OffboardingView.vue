<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { Search } from '@element-plus/icons-vue'
import { getEmployees } from '@/api/employees'
import { getOffboardingCertificate, getOffboardingList, patchNhiUnenroll } from '@/api/offboarding'
import { useOffboardingStore } from '@/stores/offboarding'
import type { OffboardingDetail } from '@/stores/offboarding'
import { formatDateTimeTW } from '@/utils/format'
import MagicLinkPanel from '@/components/offboarding/MagicLinkPanel.vue'
import OffboardingModal from '@/components/offboarding/OffboardingModal.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import type { ApiResponse } from '@/api/_generated/typed'

// ── 型別 ────────────────────────────────────────────────

type ListItem = ApiResponse<'/offboarding/', 'get'>['items'][number]
type OffboardingProcessResult = ApiResponse<'/offboarding/{employee_id}/process', 'post'>

/** 辦理 modal 的目標（來自清單列或頁頭發起選擇器） */
interface ModalTarget {
    id: number
    name: string
    resignDate: string | null
}

// ── Store ────────────────────────────────────────────────

const store = useOffboardingStore()

// 手機（≤767.98px）：drawer 改滿版
const { isMobile } = useIsMobile()

// ── 清單載入（單一 list 請求；原 2N+1 的 N+1 修復）─────────

const rows = ref<ListItem[]>([])
const loading = ref(false)
const loadError = ref(false)

async function loadList(): Promise<void> {
    loading.value = true
    loadError.value = false
    try {
        const res = await getOffboardingList()
        rows.value = res.data.items
    } catch {
        // 整表錯誤態（非空清單）：載入失敗不得偽裝成「沒有離職員工」
        loadError.value = true
    } finally {
        loading.value = false
    }
}

onMounted(loadList)

// ── 搜尋＋狀態篩選（純前端；幼兒園規模不分頁，與員工列表慣例一致）──

const searchQuery = ref('')

type ChecklistStatus = 'no_record' | 'open' | 'closed'
type StatusFilter = 'all' | ChecklistStatus
const statusFilter = ref<StatusFilter>('all')

function getChecklistStatus(row: ListItem): ChecklistStatus {
    if (!row.has_record) return 'no_record'
    if (row.closed_at) return 'closed'
    return 'open'
}

const displayedRows = computed(() =>
    rows.value.filter((r) => {
        if (statusFilter.value !== 'all' && getChecklistStatus(r) !== statusFilter.value) return false
        const q = searchQuery.value.trim()
        return !q || (r.employee_name ?? '').includes(q)
    }),
)

const hasActiveFilters = computed(
    () => !!searchQuery.value.trim() || statusFilter.value !== 'all',
)

function clearFilters(): void {
    searchQuery.value = ''
    statusFilter.value = 'all'
}

// ── 三態顯示 ──────────────────────────────────────────────

const checklistLabel: Record<ChecklistStatus, string> = {
    no_record: '未建立紀錄',
    closed: '已結案',
    open: '未結案',
}

const checklistTagType: Record<ChecklistStatus, string> = {
    no_record: 'info',
    closed: 'success',
    open: 'warning',
}

// 動詞統一「辦理離職／繼續辦理」，與員工管理 tab 的入口同名
const actionButtonLabel: Record<ChecklistStatus, string> = {
    no_record: '辦理離職',
    open: '繼續辦理',
    closed: '查看文件',
}

/** closed（查看文件）為次要動作，其餘為主要動作 */
function isPrimaryAction(row: ListItem): boolean {
    return getChecklistStatus(row) !== 'closed'
}

function handleAction(row: ListItem): void {
    if (getChecklistStatus(row) === 'no_record') {
        openOffboardModal({
            id: row.employee_id,
            name: row.employee_name || `未填姓名（編號 ${row.employee_id}）`,
            resignDate: row.resign_date ?? null,
        })
    } else {
        openManage(row)
    }
}

// ── 證明 PDF ──────────────────────────────────────────────

async function handleDownloadCertificate(id: number, name: string): Promise<void> {
    try {
        const res = await getOffboardingCertificate(id)
        const blob = res.data
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `離職證明_${name || id}.pdf`
        a.click()
        URL.revokeObjectURL(url)
    } catch (e) {
        ElMessage.error(friendlyError('下載離職證明失敗', e))
    }
}

// ── Drawer（開啟時抓 detail；清單只有列摘要）───────────────

const drawerVisible = ref(false)
const drawerRow = ref<ListItem | null>(null)
const drawerDetail = ref<OffboardingDetail | null>(null)
const drawerLoading = ref(false)
const drawerError = ref(false)

function openManage(row: ListItem): void {
    drawerRow.value = row
    drawerVisible.value = true
    void loadDrawerDetail(row.employee_id)
}

async function loadDrawerDetail(id: number): Promise<void> {
    drawerLoading.value = true
    drawerError.value = false
    drawerDetail.value = null
    try {
        drawerDetail.value = await store.refreshDetail(id)
    } catch {
        drawerError.value = true
    } finally {
        drawerLoading.value = false
    }
}

/** drawer 內任何異動後：刷新 detail（drawer 顯示）＋ 清單列摘要 */
async function syncAfterMutation(id: number): Promise<void> {
    await Promise.all([loadDrawerDetail(id), loadList()])
}

const drawerStatusClosed = computed(() => !!drawerDetail.value?.closed_at)

async function onMagicLinkUpdate(): Promise<void> {
    if (!drawerRow.value) return
    await syncAfterMutation(drawerRow.value.employee_id)
}

// ── 健保退保申報 ──────────────────────────────────────────

// el-switch 未覆寫 active-value/inactive-value，change 事件實際值恆為 boolean；
// 型別仍宣告聯集以符合 SwitchEmits 簽章，故用 Boolean() 明確窄化。
async function handleNhiUnenrollToggle(value: string | number | boolean): Promise<void> {
    if (!drawerRow.value) return
    const id = drawerRow.value.employee_id
    const submitted = Boolean(value)
    try {
        await patchNhiUnenroll(id, { submitted })
        await syncAfterMutation(id)
    } catch (e) {
        ElMessage.error(friendlyError('更新健保退保申報狀態失敗', e))
    }
}

// ── 檢核結案（手動結案鈕）─────────────────────────────────

/** 結案前置條件缺項（中文說明，供 disabled 按鈕旁列出） */
const closeMissingItems = computed<string[]>(() => {
    const detail = drawerDetail.value
    if (!detail) return []
    const missing: string[] = []
    if (!detail.nhi_unenroll_submitted_at) missing.push('健保退保申報')
    if (!detail.certificate_pdf_path) missing.push('產生離職證明')
    return missing
})

async function handleCloseChecklist(): Promise<void> {
    if (!drawerRow.value) return
    const id = drawerRow.value.employee_id
    try {
        await ElMessageBox.confirm(
            '結案代表此員工的離職作業已全部完成；結案後健保退保申報狀態將鎖定，無法再修改。確定結案？',
            '結案確認',
            { type: 'warning', confirmButtonText: '確定結案', cancelButtonText: '取消' },
        )
    } catch {
        return
    }
    try {
        await store.close(id)
        await syncAfterMutation(id)
        ElMessage.success('已結案')
    } catch {
        ElMessage.error('結案失敗，請稍後再試')
    }
}

// ── 辦理離職 Modal ────────────────────────────────────────

const offboardModalVisible = ref(false)
const offboardModalTarget = ref<ModalTarget | null>(null)

function openOffboardModal(target: ModalTarget): void {
    offboardModalTarget.value = target
    offboardModalVisible.value = true
}

async function onOffboardSuccess(_result: OffboardingProcessResult): Promise<void> {
    const target = offboardModalTarget.value
    await loadList()
    // 若 drawer 正開著同一位員工，順帶刷新
    if (target && drawerVisible.value && drawerRow.value?.employee_id === target.id) {
        await loadDrawerDetail(target.id)
    }
}

// ── 頁頭發起離職（在職員工選擇器；懶載清單）────────────────

interface ActiveEmployee {
    id: number
    name?: string
    resign_date?: string | null
    is_active?: boolean
    [key: string]: unknown
}

const initiateVisible = ref(false)
const initiateEmployeeId = ref<number | null>(null)
const activeEmployees = ref<ActiveEmployee[]>([])
const initiateLoading = ref(false)

async function openInitiate(): Promise<void> {
    initiateEmployeeId.value = null
    initiateVisible.value = true
    initiateLoading.value = true
    try {
        const res = await getEmployees()
        const all = (res.data ?? []) as ActiveEmployee[]
        activeEmployees.value = all.filter((e) => !!e.is_active && !e.resign_date)
    } catch (e) {
        ElMessage.error(friendlyError('載入在職員工清單失敗', e))
    } finally {
        initiateLoading.value = false
    }
}

function confirmInitiate(): void {
    const emp = activeEmployees.value.find((e) => e.id === initiateEmployeeId.value)
    if (!emp) return
    initiateVisible.value = false
    openOffboardModal({
        id: emp.id,
        name: emp.name || `未填姓名（編號 ${emp.id}）`,
        resignDate: emp.resign_date ?? null,
    })
}
</script>

<template>
    <div class="offboarding-view">
        <PageHeader title="離職管理" subtitle="已設定離職日期的員工清單">
            <template #actions>
                <el-input
                    v-model="searchQuery"
                    class="offboard-search"
                    placeholder="搜尋姓名"
                    :prefix-icon="Search"
                    clearable
                    aria-label="搜尋離職員工姓名"
                />
                <el-select v-model="statusFilter" class="status-filter" aria-label="檢核狀態篩選">
                    <el-option label="全部狀態" value="all" />
                    <el-option label="未建立紀錄" value="no_record" />
                    <el-option label="未結案" value="open" />
                    <el-option label="已結案" value="closed" />
                </el-select>
                <el-button class="initiate-offboard-btn" type="primary" @click="openInitiate">
                    辦理離職
                </el-button>
            </template>
        </PageHeader>

        <!-- 整表錯誤態：載入失敗不得偽裝成空清單 -->
        <el-alert
            v-if="loadError"
            type="error"
            title="離職清單載入失敗"
            description="請檢查網路後重試"
            show-icon
            :closable="false"
        >
            <el-button class="reload-list-btn" size="small" style="margin-top: 8px" @click="loadList">
                重新載入
            </el-button>
        </el-alert>

        <el-table
            v-else
            v-loading="loading"
            :data="displayedRows"
            border
            stripe
        >
            <!-- 員工名：連結至該員工詳情頁，與員工管理 tab 的姓名連結一致 -->
            <el-table-column label="員工名" min-width="120">
                <template #default="{ row }: { row: ListItem }">
                    <router-link :to="`/employees/${row.employee_id}`" class="emp-name-link">
                        {{ row.employee_name || `未填姓名（編號 ${row.employee_id}）` }}
                    </router-link>
                </template>
            </el-table-column>

            <!-- 離職日 -->
            <el-table-column label="離職日" min-width="110">
                <template #default="{ row }: { row: ListItem }">
                    <span>{{ row.resign_date ?? '—' }}</span>
                </template>
            </el-table-column>

            <!-- 離職檢核 -->
            <el-table-column label="離職檢核" min-width="110">
                <template #default="{ row }: { row: ListItem }">
                    <el-tag :type="(checklistTagType[getChecklistStatus(row)] as 'success' | 'warning' | 'info')">
                        {{ checklistLabel[getChecklistStatus(row)] }}
                    </el-tag>
                </template>
            </el-table-column>

            <!-- 離職證明 PDF -->
            <el-table-column label="離職證明" min-width="120">
                <template #default="{ row }: { row: ListItem }">
                    <template v-if="row.certificate_pdf_path">
                        <el-button
                            link
                            type="primary"
                            size="small"
                            @click="handleDownloadCertificate(row.employee_id, row.employee_name)"
                        >
                            下載 PDF
                        </el-button>
                    </template>
                    <span v-else class="text-muted">未產生</span>
                </template>
            </el-table-column>

            <!-- 下載連結狀態 -->
            <el-table-column label="下載連結" min-width="110">
                <template #default="{ row }: { row: ListItem }">
                    <el-tag v-if="row.magic_link_active" type="success">啟用中</el-tag>
                    <el-tag v-else-if="row.has_record" type="info">未啟用</el-tag>
                    <span v-else class="text-muted">—</span>
                </template>
            </el-table-column>

            <!-- 操作 -->
            <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }: { row: ListItem }">
                    <el-button
                        class="offboard-action-btn"
                        size="small"
                        :type="isPrimaryAction(row) ? 'primary' : undefined"
                        :plain="!isPrimaryAction(row)"
                        @click="handleAction(row)"
                    >
                        {{ actionButtonLabel[getChecklistStatus(row)] }}
                    </el-button>
                </template>
            </el-table-column>
            <template #empty>
                <EmptyState
                    v-if="hasActiveFilters"
                    title="查無符合條件的員工"
                    description="試著調整搜尋關鍵字或狀態篩選"
                >
                    <template #action>
                        <el-button size="small" @click="clearFilters">清除條件</el-button>
                    </template>
                </EmptyState>
                <EmptyState
                    v-else
                    title="目前沒有離職中的員工"
                    description="點擊右上角「辦理離職」，選擇在職員工即可開始離職流程"
                >
                    <template #action>
                        <el-button size="small" type="primary" @click="openInitiate">辦理離職</el-button>
                    </template>
                </EmptyState>
            </template>
        </el-table>

        <!-- 發起離職：在職員工選擇器（懶載） -->
        <el-dialog v-model="initiateVisible" title="辦理離職" width="420px">
            <p class="initiate-desc">選擇要辦理離職的在職員工</p>
            <el-select
                v-model="initiateEmployeeId"
                class="initiate-select"
                filterable
                :loading="initiateLoading"
                placeholder="搜尋姓名"
                style="width: 100%"
            >
                <el-option
                    v-for="e in activeEmployees"
                    :key="e.id"
                    :label="e.name || `未填姓名（編號 ${e.id}）`"
                    :value="e.id"
                />
            </el-select>
            <template #footer>
                <el-button @click="initiateVisible = false">取消</el-button>
                <el-button
                    class="initiate-confirm-btn"
                    type="primary"
                    :disabled="initiateEmployeeId == null"
                    @click="confirmInitiate"
                >
                    下一步
                </el-button>
            </template>
        </el-dialog>

        <!-- 管理 Drawer（開啟時抓 detail） -->
        <el-drawer
            v-model="drawerVisible"
            :title="`離職管理 — ${drawerRow?.employee_name ?? ''}`"
            :size="isMobile ? '100%' : '480px'"
            destroy-on-close
        >
            <div v-loading="drawerLoading">
                <el-alert
                    v-if="drawerError"
                    type="error"
                    title="離職詳情載入失敗"
                    show-icon
                    :closable="false"
                >
                    <el-button
                        size="small"
                        style="margin-top: 8px"
                        @click="drawerRow && loadDrawerDetail(drawerRow.employee_id)"
                    >
                        重新載入
                    </el-button>
                </el-alert>

                <template v-else-if="drawerDetail">
                    <div class="drawer-section">
                        <h4 class="drawer-section-title">離職證明下載連結</h4>
                        <p class="drawer-section-desc">提供給離職員工免登入下載離職文件包（含離職證明）</p>
                        <MagicLinkPanel
                            :employee-id="drawerDetail.employee_id"
                            :active="drawerDetail.magic_link_active"
                            :expires-at="drawerDetail.magic_link_expires_at ?? null"
                            :download-count="drawerDetail.magic_link_download_count"
                            :last-used-at="drawerDetail.magic_link_last_used_at ?? null"
                            @update="onMagicLinkUpdate"
                        />
                    </div>

                    <!-- 健保退保申報 -->
                    <div class="drawer-section">
                        <h4 class="drawer-section-title">健保退保申報</h4>
                        <el-switch
                            class="nhi-unenroll-switch"
                            :model-value="!!drawerDetail.nhi_unenroll_submitted_at"
                            active-text="已申報"
                            inactive-text="未申報"
                            :disabled="drawerStatusClosed"
                            @change="handleNhiUnenrollToggle"
                        />
                        <p class="nhi-hint">此為人工申報進度記錄，仍需自行向健保署辦理退保。</p>
                    </div>

                    <!-- 離職證明 -->
                    <div class="drawer-section">
                        <h4 class="drawer-section-title">離職證明</h4>
                        <el-button
                            v-if="drawerDetail.certificate_pdf_path"
                            class="drawer-download-cert-btn"
                            link
                            type="primary"
                            size="small"
                            @click="handleDownloadCertificate(drawerDetail.employee_id, drawerDetail.employee_name)"
                        >
                            下載 PDF
                        </el-button>
                        <span v-else class="text-muted">未產生</span>
                    </div>

                    <!-- 檢核結案 -->
                    <div class="drawer-section">
                        <h4 class="drawer-section-title">檢核結案</h4>
                        <p v-if="drawerDetail.closed_at" class="closed-at-info">
                            已於 {{ formatDateTimeTW(drawerDetail.closed_at) }} 結案
                        </p>
                        <template v-else>
                            <el-button
                                class="close-offboarding-btn"
                                type="primary"
                                :disabled="closeMissingItems.length > 0"
                                @click="handleCloseChecklist"
                            >
                                結案
                            </el-button>
                            <p v-if="closeMissingItems.length > 0" class="close-prereq-hint">
                                結案前需完成：{{ closeMissingItems.join('、') }}
                            </p>
                        </template>
                    </div>
                </template>
            </div>
        </el-drawer>

        <!-- 辦理離職 Modal（清單列或頁頭發起） -->
        <OffboardingModal
            v-if="offboardModalTarget"
            v-model="offboardModalVisible"
            :employee-id="offboardModalTarget.id"
            :employee-name="offboardModalTarget.name"
            :initial-resign-date="offboardModalTarget.resignDate"
            @success="onOffboardSuccess"
        />
    </div>
</template>

<style scoped>
/* 已內嵌於 EmployeeHubView 整合頁，page padding 由 wrapper(.employee-hub-view) 提供，此處歸零避免雙重留白 */
.offboarding-view {
    padding: 0;
}

/* 員工名連結：對齊員工管理 tab 的 .name-link 樣式（primary 色、hover 底線） */
.emp-name-link {
    color: var(--el-color-primary);
    text-decoration: none;
}
.emp-name-link:hover {
    text-decoration: underline;
}

.offboard-search {
    width: 180px;
}

.status-filter {
    width: 132px;
}

.initiate-desc {
    margin: 0 0 12px;
    font-size: 14px;
    color: var(--text-secondary, #606266);
}

.text-muted {
    color: var(--text-tertiary, #909399);
    font-size: 13px;
}

.drawer-section {
    padding: 4px 0;
}

.drawer-section-title {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px;
    color: var(--text-primary, #303133);
}

.closed-at-info {
    margin: 0;
    font-size: 14px;
    color: var(--text-secondary, #606266);
}

.close-prereq-hint {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--text-tertiary, #909399);
}

.drawer-section-desc {
    margin: -8px 0 12px;
    font-size: 13px;
    color: var(--text-tertiary, #909399);
}

.nhi-hint {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--text-tertiary, #909399);
}
</style>
