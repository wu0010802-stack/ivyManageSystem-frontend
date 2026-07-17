<script setup lang="ts">
import { ref } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { postMagicLink, deleteMagicLink } from '@/api/offboarding'
import type { ApiResponse } from '@/api/_generated/typed'

type MagicLinkToken = ApiResponse<'/offboarding/{employee_id}/magic-link', 'post'>

const props = defineProps<{
    employeeId: number
    active: boolean
    expiresAt: string | null
    downloadCount: number
    lastUsedAt: string | null
}>()

const emit = defineEmits<{
    update: []
}>()

/** 剛產生的 token（一次性顯示，關掉即清除）*/
const newToken = ref<MagicLinkToken | null>(null)
const showTokenDialog = ref(false)

/** 格式化 ISO datetime 為可讀字串 */
function formatDateTime(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

/** 產生下載連結 */
async function handleGenerate(): Promise<void> {
    try {
        const resp = await postMagicLink(props.employeeId)
        newToken.value = resp.data
        showTokenDialog.value = true
    } catch {
        ElMessage.error('產生下載連結失敗，請稍後再試')
    }
}

/** 複製 download_url 到剪貼簿 */
async function handleCopy(): Promise<void> {
    if (!newToken.value) return
    try {
        await navigator.clipboard.writeText(newToken.value.download_url)
        ElMessage.success('已複製到剪貼簿')
    } catch {
        ElMessage.warning('無法自動複製，請手動複製上方連結')
    }
}

/** dialog 關閉：清除 token，觸發父頁 refetch */
function onTokenDialogClose(): void {
    newToken.value = null
    showTokenDialog.value = false
    emit('update')
}

/** 撤銷連結 */
async function handleRevoke(): Promise<void> {
    try {
        await ElMessageBox.confirm('確定要撤銷此下載連結？撤銷後員工將無法使用舊連結下載，需重新產生。', '撤銷確認', {
            type: 'warning',
            confirmButtonText: '確定撤銷',
            cancelButtonText: '取消',
        })
    } catch {
        // 使用者取消，不做任何事
        return
    }
    try {
        await deleteMagicLink(props.employeeId)
        ElMessage.success('已撤銷下載連結')
        emit('update')
    } catch {
        ElMessage.error('撤銷失敗，請稍後再試')
    }
}
</script>

<template>
    <div class="magic-link-panel">
        <!-- Active state -->
        <template v-if="active">
            <div class="status-row">
                <el-tag type="success">啟用中</el-tag>
                <span class="meta-item">到期：{{ formatDateTime(expiresAt) }}</span>
                <span class="meta-item">已下載：{{ downloadCount }} 次</span>
                <span class="meta-item">最後使用：{{ formatDateTime(lastUsedAt) }}</span>
            </div>
            <div class="action-row">
                <el-button class="revoke-button" type="warning" @click="handleRevoke">
                    撤銷連結
                </el-button>
                <el-button class="generate-button" type="primary" @click="handleGenerate">
                    重新產生
                </el-button>
            </div>
        </template>

        <!-- Inactive state -->
        <template v-else>
            <p class="no-link-text">尚未產生下載連結</p>
            <el-button class="generate-button" type="primary" @click="handleGenerate">
                產生下載連結
            </el-button>
        </template>

        <!-- Token 一次性顯示 dialog -->
        <el-dialog
            v-model="showTokenDialog"
            title="下載連結已產生"
            width="560px"
            :close-on-click-modal="false"
            @close="onTokenDialogClose"
        >
            <template v-if="newToken">
                <el-descriptions :column="1" border>
                    <el-descriptions-item label="下載連結">
                        <span class="token-url">{{ newToken.download_url }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="到期時間">
                        {{ formatDateTime(newToken.expires_at) }}
                    </el-descriptions-item>
                </el-descriptions>
                <el-alert
                    title="請立即複製連結並傳送給離職員工；關閉此視窗後將無法再次查看，如遺失可重新產生。"
                    type="warning"
                    :closable="false"
                    style="margin-top: 12px;"
                />
            </template>
            <template #footer>
                <el-button type="primary" @click="handleCopy">
                    複製到剪貼簿
                </el-button>
                <el-button @click="onTokenDialogClose">關閉</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<style scoped>
.magic-link-panel {
    padding: 4px 0;
}

.status-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
}

.meta-item {
    color: #606266;
    font-size: 14px;
}

.action-row {
    display: flex;
    gap: 8px;
}

.no-link-text {
    color: #909399;
    margin: 0 0 12px;
}

.token-url {
    word-break: break-all;
    font-family: monospace;
    font-size: 13px;
}
</style>
