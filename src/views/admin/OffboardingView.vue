<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getEmployees } from '@/api/employees'
import { getOffboardingCertificate } from '@/api/offboarding'
import { useOffboardingStore } from '@/stores/offboarding'
import type { OffboardingDetail } from '@/stores/offboarding'
import MagicLinkPanel from '@/components/offboarding/MagicLinkPanel.vue'

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
}

// ── Store ────────────────────────────────────────────────

const store = useOffboardingStore()

// ── 狀態 ─────────────────────────────────────────────────

const rows = ref<ResignedEmployee[]>([])
const loading = ref(false)

// Drawer
const drawerVisible = ref(false)
const selectedRow = ref<ResignedEmployee | null>(null)

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
            const detail = settled.status === 'fulfilled' ? settled.value : null
            return { employee: emp, detail }
        })
    } catch {
        ElMessage.error('載入離職員工清單失敗')
    } finally {
        loading.value = false
    }
})

// ── Checklist 狀態 ────────────────────────────────────────

type ChecklistStatus = 'no_record' | 'closed' | 'open'

function getChecklistStatus(row: ResignedEmployee): ChecklistStatus {
    if (!row.detail) return 'no_record'
    if (row.detail.closed_at) return 'closed'
    return 'open'
}

const checklistLabel: Record<ChecklistStatus, string> = {
    no_record: '無 record',
    closed: '已結案',
    open: '未結案',
}

const checklistTagType: Record<ChecklistStatus, string> = {
    no_record: 'info',
    closed: 'success',
    open: 'warning',
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

async function onMagicLinkUpdate(): Promise<void> {
    if (!selectedRow.value) return
    const id = selectedRow.value.employee.id
    try {
        const detail = await store.refreshDetail(id)
        // 同步更新清單列
        const idx = rows.value.findIndex((r) => r.employee.id === id)
        if (idx !== -1) {
            rows.value[idx] = { ...rows.value[idx], detail }
        }
        // 更新 drawer 內選中列
        if (selectedRow.value) {
            selectedRow.value = { ...selectedRow.value, detail }
        }
    } catch {
        ElMessage.error('更新 Magic Link 狀態失敗')
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
            <!-- 員工名 -->
            <el-table-column label="員工名" min-width="120">
                <template #default="{ row }: { row: ResignedEmployee }">
                    <span>{{ row.employee.name ?? `員工 #${row.employee.id}` }}</span>
                </template>
            </el-table-column>

            <!-- 離職日 -->
            <el-table-column label="離職日" min-width="110">
                <template #default="{ row }: { row: ResignedEmployee }">
                    <span>{{ row.employee.resign_date ?? '—' }}</span>
                </template>
            </el-table-column>

            <!-- Checklist 狀態 -->
            <el-table-column label="Checklist 狀態" min-width="110">
                <template #default="{ row }: { row: ResignedEmployee }">
                    <el-tag :type="(checklistTagType[getChecklistStatus(row)] as 'success' | 'warning' | 'info')">
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

            <!-- 操作 -->
            <el-table-column label="操作" width="90" fixed="right">
                <template #default="{ row }: { row: ResignedEmployee }">
                    <el-button
                        size="small"
                        type="primary"
                        @click="openManage(row)"
                    >
                        管理
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
                    <h4 class="drawer-section-title">Magic Link 下載連結</h4>
                    <MagicLinkPanel
                        v-if="selectedRow.detail"
                        :employee-id="selectedRow.employee.id"
                        :active="selectedRow.detail.magic_link_active"
                        :expires-at="selectedRow.detail.magic_link_expires_at ?? null"
                        :download-count="selectedRow.detail.magic_link_download_count"
                        :last-used-at="selectedRow.detail.magic_link_last_used_at ?? null"
                        @update="onMagicLinkUpdate"
                    />
                    <p v-else class="text-muted">此員工尚無離職 Record，無法管理 Magic Link。</p>
                </div>
            </template>
        </el-drawer>
    </div>
</template>

<style scoped>
/* 已內嵌於 EmployeeHubView 整合頁，page padding 由 wrapper(.employee-hub-view) 提供，此處歸零避免雙重留白 */
.offboarding-view {
    padding: 0;
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
</style>
