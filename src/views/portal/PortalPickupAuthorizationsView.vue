<script setup lang="ts">
/**
 * 教師 Portal：今日接送授權清單與核銷。
 *
 * 核銷流程：輸入取件碼驗證 → 成功即核銷；後端回 code_locked 時切人工核對模式
 * （必填備註 + 二次確認）——不可逆操作二次確認慣例。
 */
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { extractErrorCode, extractErrorDetail } from '@/utils/error'
import {
  getPortalPickupAuthorizations,
  getPortalPickupPendingCount,
  overridePickupAuthorization,
  verifyPickupAuthorization,
} from '@/api/portal'

interface PortalPickupAuth {
  id: number
  student_id: number
  student_name: string
  classroom_name: string
  person_name: string
  person_relation: string
  person_phone: string
  photo_url: string | null
  parent_name: string | null
  status: string
  effective_status: string
  code_locked: boolean
  completed_via: string | null
  [key: string]: unknown
}

const items = ref<PortalPickupAuth[]>([])
const loading = ref(false)
const pendingCount = ref(0)

const STATUS_LABEL: Record<string, string> = {
  active: '進行中', completed: '已完成', cancelled: '已取消', expired: '已過期',
}

async function fetchData() {
  loading.value = true
  try {
    const [listRes, countRes] = await Promise.all([
      getPortalPickupAuthorizations(),
      getPortalPickupPendingCount(),
    ])
    items.value = ((listRes.data as { items?: PortalPickupAuth[] })?.items || [])
    pendingCount.value = (countRes.data as { count?: number })?.count || 0
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

// ── 核銷 dialog ──────────────────────────────────────────────────────
const verifyTarget = ref<PortalPickupAuth | null>(null)
const verifyDialogOpen = ref(false)
const codeInput = ref('')
const verifying = ref(false)
const overrideMode = ref(false)
const overrideNote = ref('')

function openVerify(item: PortalPickupAuth) {
  verifyTarget.value = item
  codeInput.value = ''
  overrideMode.value = item.code_locked
  overrideNote.value = ''
  verifyDialogOpen.value = true
}

function closeVerify() {
  verifyDialogOpen.value = false
  verifyTarget.value = null
}

async function submitVerify() {
  const target = verifyTarget.value
  if (!target) return
  verifying.value = true
  try {
    await verifyPickupAuthorization(target.id, { code: codeInput.value })
    ElMessage.success('已完成核銷')
    closeVerify()
    fetchData()
  } catch (err) {
    const code = extractErrorCode(err)
    if (code === 'code_locked') {
      overrideMode.value = true
      ElMessage.warning('驗碼已鎖定，請人工核對證件後送出')
    } else {
      ElMessage.error(extractErrorDetail(err))
    }
  } finally {
    verifying.value = false
  }
}

async function submitOverride() {
  const target = verifyTarget.value
  if (!target || overrideNote.value.trim().length < 2) return
  try {
    await ElMessageBox.confirm(
      `確定人工核對 ${target.person_name}（${target.person_relation}）的證件後放行接送？`,
      '確認人工核銷',
      { confirmButtonText: '確定核銷', cancelButtonText: '返回', type: 'warning' },
    )
  } catch {
    return
  }
  verifying.value = true
  try {
    await overridePickupAuthorization(target.id, { note: overrideNote.value.trim() })
    ElMessage.success('已完成人工核銷')
    closeVerify()
    fetchData()
  } catch (err) {
    ElMessage.error(extractErrorDetail(err))
  } finally {
    verifying.value = false
  }
}

onMounted(fetchData)

defineExpose({ items, pendingCount, fetchData })
</script>

<template>
  <div class="portal-pickup-view" v-loading="loading">
    <h1 class="page-title">今日接送授權（{{ pendingCount }} 筆進行中）</h1>

    <div v-if="!loading && items.length === 0" class="empty-state">今日無接送授權</div>

    <div class="auth-cards">
      <el-card v-for="item in items" :key="item.id" class="auth-card">
        <div class="auth-main">
          <img
            v-if="item.photo_url"
            :src="item.photo_url"
            alt="接送人照片"
            class="person-photo"
          />
          <div class="auth-info">
            <div class="auth-title">
              <strong>{{ item.student_name }}</strong>
              <span class="classroom-tag">{{ item.classroom_name }}</span>
            </div>
            <p class="person-line">
              接送人：{{ item.person_name }}（{{ item.person_relation }}）· {{ item.person_phone }}
            </p>
            <p v-if="item.parent_name" class="parent-line">授權家長：{{ item.parent_name }}</p>
            <el-tag
              :type="item.effective_status === 'active' ? 'warning' : 'success'"
              size="small"
            >{{ STATUS_LABEL[item.effective_status] || item.effective_status }}</el-tag>
          </div>
        </div>
        <div v-if="item.effective_status === 'active'" class="auth-actions">
          <el-button type="primary" size="small" @click="openVerify(item)">核銷</el-button>
        </div>
      </el-card>
    </div>

    <el-dialog v-model="verifyDialogOpen" title="接送核銷" width="90%" class="verify-dialog">
      <template v-if="verifyTarget">
        <p class="verify-target-name">
          {{ verifyTarget.student_name }} · {{ verifyTarget.person_name }}（{{ verifyTarget.person_relation }}）
        </p>
        <img
          v-if="verifyTarget.photo_url"
          :src="verifyTarget.photo_url"
          alt="接送人照片"
          class="verify-photo"
        />

        <template v-if="!overrideMode">
          <el-input
            v-model="codeInput"
            maxlength="6"
            placeholder="請輸入接送人出示的 6 位取件碼"
            class="code-input"
          />
          <div class="dialog-actions">
            <el-button @click="closeVerify">取消</el-button>
            <el-button
              type="primary"
              :disabled="codeInput.length !== 6"
              :loading="verifying"
              @click="submitVerify"
            >驗證核銷</el-button>
          </div>
          <button type="button" class="switch-override-link" @click="overrideMode = true">
            改用人工核對證件
          </button>
        </template>

        <template v-else>
          <el-input
            v-model="overrideNote"
            type="textarea"
            :rows="3"
            placeholder="請輸入核對證件的說明（至少 2 字，將寫入稽核紀錄）"
            class="override-note"
          />
          <div class="dialog-actions">
            <el-button @click="closeVerify">取消</el-button>
            <el-button
              type="warning"
              :disabled="overrideNote.trim().length < 2"
              :loading="verifying"
              @click="submitOverride"
            >人工核銷</el-button>
          </div>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.portal-pickup-view {
  padding: 16px;
}
.page-title {
  font-size: 16px;
  margin: 0 0 12px;
}
.empty-state {
  padding: 32px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.auth-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.auth-card {
  width: 100%;
}
.auth-main {
  display: flex;
  gap: 12px;
}
.person-photo {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.auth-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.auth-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.classroom-tag {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.person-line, .parent-line {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.auth-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}
.verify-target-name {
  font-weight: 600;
  margin-bottom: 8px;
}
.verify-photo {
  width: 100%;
  max-height: 240px;
  object-fit: contain;
  border-radius: 8px;
  margin-bottom: 12px;
}
.code-input {
  margin-bottom: 12px;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.switch-override-link {
  display: block;
  margin-top: 12px;
  background: transparent;
  border: none;
  color: var(--el-color-warning);
  font-size: 13px;
  cursor: pointer;
}
.override-note {
  margin-bottom: 12px;
}
</style>
