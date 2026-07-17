<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getEmployees } from '@/api/employees'
import { getOffboardingCertificate, patchNhiUnenroll } from '@/api/offboarding'
import { useOffboardingStore } from '@/stores/offboarding'
import type { OffboardingDetail } from '@/stores/offboarding'
import { formatDateTimeTW } from '@/utils/format'
import MagicLinkPanel from '@/components/offboarding/MagicLinkPanel.vue'
import OffboardingModal from '@/components/offboarding/OffboardingModal.vue'
import type { ApiResponse } from '@/api/_generated/typed'

// ── 型別 ────────────────────────────────────────────────

interface EmployeeRow {
    id: number
    name?: string
    resign_date?: string | null
    [key: string]: unknown
}

interface ResignedEmployee {
    employee: EmployeeRow
    detail: OffboardingDetail | null
    /** detail 載入失敗（非 404）；true 時列狀態為 load_failed，不可與 no_record 混同 */
    loadFailed?: boolean
}

/** 後端 GET /offboarding/{id} 對「查無紀錄」回 404；其餘錯誤視為載入失敗 */
const isNotFound = (err: unknown): boolean =>
    (err as { response?: { status?: number } } | null)?.response?.status === 404

type OffboardingProcessResult = ApiResponse<'/offboarding/{employee_id}/process', 'post'>

// ── Store ────────────────────────────────────────────────

const store = useOffboardingStore()

// ── 狀態 ─────────────────────────────────────────────────

const rows = ref<ResignedEmployee[]>([])
const loading = ref(false)

// Drawer
const drawerVisible = ref(false)
const selectedRow = ref<ResignedEmployee | null>(null)

// 開始離職檢核 Modal（no_record 狀態列點擊觸發）
const offboardModalVisible = ref(false)
const offboardModalRow = ref<ResignedEmployee | null>(null)

// ── 初始化 ────────────────────────────────────────────────

onMounted(async () => {
    loading.value = true
    try {
        const res = await getEmployees()
        const all = (res.data ?? []) as EmployeeRow[]
        const resigned = all.filter((emp) => !!emp.resign_date)

        const results = await Promise.allSettled(
            resigned.map((emp) => store.fetchDetail(emp.id)),
        )

        rows.value = resigned.map((emp, i) => {
            const settled = results[i]
            if (settled.status === 'fulfilled') return { employee: emp, detail: settled.value }
            // 404＝真的沒有離職紀錄（no_record）；其餘失敗標 load_failed，
            // 不可折疊成 no_record（會誘導對已辦理員工重跑離職流程）
            return { employee: emp, detail: null, loadFailed: !isNotFound(settled.reason) }
        })
    } catch {
        ElMessage.error('載入離職員工清單失敗')
    } finally {
        loading.value = false
    }
})

// ── Checklist 狀態 ────────────────────────────────────────

type ChecklistStatus = 'no_record' | 'closed' | 'open' | 'load_failed'

function getChecklistStatus(row: ResignedEmployee): ChecklistStatus {
    if (row.loadFailed) return 'load_failed'
    if (!row.detail) return 'no_record'
    if (row.detail.closed_at) return 'closed'
    return 'open'
}

const checklistLabel: Record<ChecklistStatus, string> = {
    no_record: '未建立紀錄',
    closed: '已結案',
    open: '未結案',
    load_failed: '載入失敗',
}

const checklistTagType: Record<ChecklistStatus, string> = {
    no_record: 'info',
    closed: 'success',
    open: 'warning',
    load_failed: 'danger',
}

// 操作欄按鈕文案：依四態決定（no_record 進 modal 走辦理流程；open/closed 進既有 drawer；
// load_failed 重抓 detail）
const actionButtonLabel: Record<ChecklistStatus, string> = {
    no_record: '開始離職檢核',
    open: '繼續檢核',
    closed: '查看文件',
    load_failed: '重試載入',
}

/** closed（查看文件）與 load_failed（重試載入）為次要動作，其餘為主要動作 */
function isPrimaryAction(row: ResignedEmployee): boolean {
    const status = getChecklistStatus(row)
    return status !== 'closed' && status !== 'load_failed'
}

/** 依四態決定操作欄按鈕行為 */
function handleAction(row: ResignedEmployee): void {
    const status = getChecklistStatus(row)
    if (status === 'load_failed') {
        retryLoadDetail(row)
    } else if (status === 'no_record') {
        openOffboardModal(row)
    } else {
        openManage(row)
    }
}

/** load_failed 列重抓 detail：成功轉真實狀態；404 轉 no_record；其餘維持 load_failed */
async function retryLoadDetail(row: ResignedEmployee): Promise<void> {
    const id = row.employee.id
    try {
        await syncRow(id)
    } catch (err) {
        const idx = rows.value.findIndex((r) => r.employee.id === id)
        if (isNotFound(err)) {
            if (idx !== -1) rows.value[idx] = { ...rows.value[idx], detail: null, loadFailed: false }
        } else {
            ElMessage.error('載入離職詳情失敗，請稍後再試')
        }
    }
}

// ── 證明 PDF ──────────────────────────────────────────────

async function handleDownloadCertificate(row: ResignedEmployee): Promise<void> {
    try {
        const res = await getOffboardingCertificate(row.employee.id)
        const blob = res.data
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `離職證明_${row.employee.name ?? row.employee.id}.pdf`
        a.click()
        URL.revokeObjectURL(url)
    } catch {
        ElMessage.error('下載離職證明失敗')
    }
}

// ── Drawer ────────────────────────────────────────────────

function openManage(row: ResignedEmployee): void {
    selectedRow.value = row
    drawerVisible.value = true
}

/** 強制重抓指定員工的離職詳情，同步更新清單列與 drawer 內選中列（若正被選中） */
async function syncRow(id: number): Promise<void> {
    const detail = await store.refreshDetail(id)
    const idx = rows.value.findIndex((r) => r.employee.id === id)
    if (idx !== -1) {
        rows.value[idx] = { ...rows.value[idx], detail, loadFailed: false }
    }
    if (selectedRow.value?.employee.id === id) {
        selectedRow.value = { ...selectedRow.value, detail, loadFailed: false }
    }
}

async function onMagicLinkUpdate(): Promise<void> {
    if (!selectedRow.value) return
    try {
        await syncRow(selectedRow.value.employee.id)
    } catch {
        ElMessage.error('更新 Magic Link 狀態失敗')
    }
}

// ── 健保退保申報 ──────────────────────────────────────────

// el-switch 未覆寫 active-value/inactive-value，change 事件實際值恆為 boolean；
// 型別仍宣告聯集以符合 SwitchEmits 簽章，故用 Boolean() 明確窄化。
async function handleNhiUnenrollToggle(value: string | number | boolean): Promise<void> {
    if (!selectedRow.value) return
    const id = selectedRow.value.employee.id
    const submitted = Boolean(value)
    try {
        await patchNhiUnenroll(id, { submitted })
        await syncRow(id)
    } catch {
        ElMessage.error('更新健保退保申報狀態失敗')
    }
}

// ── 檢核結案（手動結案鈕）─────────────────────────────────

/** 結案前置條件缺項（中文說明，供 disabled 按鈕旁列出） */
const closeMissingItems = computed<string[]>(() => {
    const detail = selectedRow.value?.detail
    if (!detail) return []
    const missing: string[] = []
    if (!detail.nhi_unenroll_submitted_at) missing.push('健保退保申報')
    if (!detail.certificate_pdf_path) missing.push('產生離職證明')
    return missing
})

async function handleCloseChecklist(): Promise<void> {
    if (!selectedRow.value) return
    const id = selectedRow.value.employee.id
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
        await syncRow(id)
        ElMessage.success('已結案')
    } catch {
        ElMessage.error('結案失敗，請稍後再試')
    }
}

// ── 開始離職檢核 Modal ────────────────────────────────────

function openOffboardModal(row: ResignedEmployee): void {
    offboardModalRow.value = row
    offboardModalVisible.value = true
}

async function onOffboardSuccess(_result: OffboardingProcessResult): Promise<void> {
    if (!offboardModalRow.value) return
    try {
        await syncRow(offboardModalRow.value.employee.id)
    } catch {
        ElMessage.error('更新離職檢核狀態失敗')
    }
}
</script>

<template>
    <div class="offboarding-view">
        <div class="page-header">
            <h2 class="page-title">離職管理</h2>
            <p class="page-subtitle">已設定離職日期的員工清單</p>
        </div>

        <el-table
            v-loading="loading"
            :data="rows"
            border
            stripe
            empty-text="暫無離職員工"
        >
            <!-- 員工名：連結至該員工詳情頁，與員工管理 tab 的姓名連結一致（#7） -->
            <el-table-column label="員工名" min-width="120">
                <template #default="{ row }: { row: ResignedEmployee }">
                    <router-link :to="`/employees/${row.employee.id}`" class="emp-name-link">
                        {{ row.employee.name ?? `未填姓名（編號 ${row.employee.id}）` }}
                    </router-link>
                </template>
            </el-table-column>

            <!-- 離職日 -->
            <el-table-column label="離職日" min-width="110">
                <template #default="{ row }: { row: ResignedEmployee }">
                    <span>{{ row.employee.resign_date ?? '—' }}</span>
                </template>
            </el-table-column>

            <!-- 離職檢核 -->
            <el-table-column label="離職檢核" min-width="110">
                <template #default="{ row }: { row: ResignedEmployee }">
                    <el-tag :type="(checklistTagType[getChecklistStatus(row)] as 'success' | 'warning' | 'info' | 'danger')">
                        {{ checklistLabel[getChecklistStatus(row)] }}
                    </el-tag>
                </template>
            </el-table-column>

            <!-- 離職證明 PDF -->
            <el-table-column label="離職證明" min-width="120">
                <template #default="{ row }: { row: ResignedEmployee }">
                    <template v-if="row.detail?.certificate_pdf_path">
                        <el-button
                            link
                            type="primary"
                            size="small"
                            @click="handleDownloadCertificate(row)"
                        >
                            下載 PDF
                        </el-button>
                    </template>
                    <span v-else class="text-muted">未產生</span>
                </template>
            </el-table-column>

            <!-- Magic Link 狀態 -->
            <el-table-column label="下載連結" min-width="110">
                <template #default="{ row }: { row: ResignedEmployee }">
                    <el-tag v-if="row.detail?.magic_link_active" type="success">啟用中</el-tag>
                    <el-tag v-else-if="row.detail" type="info">未啟用</el-tag>
                    <span v-else class="text-muted">—</span>
                </template>
            </el-table-column>

            <!-- 操作：依三態顯示不同文案（no_record 開辦理 modal；open/closed 開既有 drawer） -->
            <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }: { row: ResignedEmployee }">
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
        </el-table>

        <!-- 管理 Drawer -->
        <el-drawer
            v-model="drawerVisible"
            :title="`離職管理 — ${selectedRow?.employee.name ?? ''}`"
            size="480px"
            destroy-on-close
        >
            <template v-if="selectedRow">
                <div class="drawer-section">
                    <h4 class="drawer-section-title">離職證明下載連結</h4>
                    <p class="drawer-section-desc">提供給離職員工免登入下載離職文件包（含離職證明）</p>
                    <MagicLinkPanel
                        v-if="selectedRow.detail"
                        :employee-id="selectedRow.employee.id"
                        :active="selectedRow.detail.magic_link_active"
                        :expires-at="selectedRow.detail.magic_link_expires_at ?? null"
                        :download-count="selectedRow.detail.magic_link_download_count"
                        :last-used-at="selectedRow.detail.magic_link_last_used_at ?? null"
                        @update="onMagicLinkUpdate"
                    />
                    <p v-else class="text-muted">此員工尚無離職紀錄，無法產生下載連結。</p>
                </div>

                <template v-if="selectedRow.detail">
                    <!-- 健保退保申報 -->
                    <div class="drawer-section">
                        <h4 class="drawer-section-title">健保退保申報</h4>
                        <el-switch
                            class="nhi-unenroll-switch"
                            :model-value="!!selectedRow.detail.nhi_unenroll_submitted_at"
                            active-text="已申報"
                            inactive-text="未申報"
                            :disabled="getChecklistStatus(selectedRow) === 'closed'"
                            @change="handleNhiUnenrollToggle"
                        />
                        <p class="nhi-hint">此為人工申報進度記錄，仍需自行向健保署辦理退保。</p>
                    </div>

                    <!-- 離職證明 -->
                    <div class="drawer-section">
                        <h4 class="drawer-section-title">離職證明</h4>
                        <el-button
                            v-if="selectedRow.detail.certificate_pdf_path"
                            class="drawer-download-cert-btn"
                            link
                            type="primary"
                            size="small"
                            @click="handleDownloadCertificate(selectedRow)"
                        >
                            下載 PDF
                        </el-button>
                        <span v-else class="text-muted">未產生</span>
                    </div>

                    <!-- 檢核結案 -->
                    <div class="drawer-section">
                        <h4 class="drawer-section-title">檢核結案</h4>
                        <p v-if="selectedRow.detail.closed_at" class="closed-at-info">
                            已於 {{ formatDateTimeTW(selectedRow.detail.closed_at) }} 結案
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
            </template>
        </el-drawer>

        <!-- 開始離職檢核 Modal（no_record 狀態列點擊觸發） -->
        <OffboardingModal
            v-if="offboardModalRow"
            v-model="offboardModalVisible"
            :employee-id="offboardModalRow.employee.id"
            :employee-name="offboardModalRow.employee.name ?? `未填姓名（編號 ${offboardModalRow.employee.id}）`"
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

.page-header {
    margin-bottom: 20px;
}

.page-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 4px;
    color: var(--text-primary, #303133);
}

.page-subtitle {
    margin: 0;
    color: var(--text-secondary, #606266);
    font-size: 14px;
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
