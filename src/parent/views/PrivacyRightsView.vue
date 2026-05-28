<script setup lang="ts">
/**
 * P0c-3 家長個人資料權利專區（個資法 §3 五權 UX）。
 *
 * 4 sections:
 * 1. 同意紀錄 — getMyConsents()
 * 2. 申請刪除 — submitDeleteRequest()（admin review）
 * 3. 申請更正 — submitCorrectRequest()（admin review）
 * 4. 申請停止處理 — submitOptOutRequest() + 直接撤回特定 scope
 *
 * Refs: ivy-backend docs/superpowers/specs/2026-05-28-consent-dsr-rights-design.md
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  CONSENT_SCOPES,
  SCOPE_LABELS,
  getMyConsents,
  listMyDsrRequests,
  submitDeleteRequest,
  submitCorrectRequest,
  submitOptOutRequest,
  writeConsent,
  type ConsentScope,
  type DsrRequestOut,
  type ScopeStatusOut,
} from '../api/consent'
import { useChildrenStore } from '../stores/children'

const router = useRouter()
const childrenStore = useChildrenStore()

const tab = ref<'consents' | 'delete' | 'correct' | 'opt_out' | 'history'>('consents')

const consentStatus = ref<ScopeStatusOut[]>([])
const dsrHistory = ref<DsrRequestOut[]>([])
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function refresh() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [{ data: consents }, { data: requests }] = await Promise.all([
      getMyConsents(),
      listMyDsrRequests(),
    ])
    consentStatus.value = consents.current_status
    dsrHistory.value = requests
  } catch (err) {
    const e = err as { message?: string; displayMessage?: string }
    errorMessage.value = e?.displayMessage || e?.message || '載入失敗'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await childrenStore.load()
  await refresh()
})

// ── Consent 撤回 ──
async function revokeScope(scope: ConsentScope, policyVersionId: number) {
  if (!confirm(`確定要撤回「${SCOPE_LABELS[scope]}」的同意？`)) return
  loading.value = true
  try {
    await writeConsent({
      policy_version_id: policyVersionId,
      scope,
      consented: false,
      note: '從個人權利頁面撤回',
    })
    successMessage.value = `已撤回「${SCOPE_LABELS[scope]}」`
    await refresh()
  } catch (err) {
    const e = err as { displayMessage?: string }
    errorMessage.value = e?.displayMessage || '撤回失敗'
  } finally {
    loading.value = false
  }
}

// ── Delete request ──
const deleteForm = ref({
  subject_entity_id: 0,
  reason: '',
})

async function submitDelete() {
  if (deleteForm.value.reason.length < 5) {
    errorMessage.value = '刪除理由需 ≥5 字'
    return
  }
  if (!deleteForm.value.subject_entity_id) {
    errorMessage.value = '請選擇要刪除的子女'
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    await submitDeleteRequest({
      subject_entity_type: 'student',
      subject_entity_id: deleteForm.value.subject_entity_id,
      reason: deleteForm.value.reason,
    })
    successMessage.value = '刪除申請已送出，園所將於 30 天內回覆'
    deleteForm.value = { subject_entity_id: 0, reason: '' }
    await refresh()
  } catch (err) {
    const e = err as { displayMessage?: string; response?: { status?: number } }
    if (e.response?.status === 409) {
      errorMessage.value = '已有相同類型的待處理申請，請等候園所處理'
    } else {
      errorMessage.value = e?.displayMessage || '送出失敗'
    }
  } finally {
    loading.value = false
  }
}

// ── Correct request ──
const correctForm = ref({
  subject_entity_id: 0,
  field_name: 'address',
  new_value: '',
  reason: '',
})

const CORRECT_FIELDS = [
  { value: 'address', label: '聯絡地址' },
  { value: 'parent_phone', label: '家長電話' },
  { value: 'emergency_contact_name', label: '緊急聯絡人姓名' },
  { value: 'emergency_contact_phone', label: '緊急聯絡人電話' },
  { value: 'allergy', label: '過敏資訊' },
  { value: 'medication', label: '用藥資訊' },
] as const

async function submitCorrect() {
  if (correctForm.value.reason.length < 5) {
    errorMessage.value = '更正理由需 ≥5 字'
    return
  }
  if (!correctForm.value.subject_entity_id || !correctForm.value.new_value) {
    errorMessage.value = '請填寫所有必要欄位'
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    await submitCorrectRequest({
      subject_entity_type: 'student',
      subject_entity_id: correctForm.value.subject_entity_id,
      field_name: correctForm.value.field_name,
      new_value: correctForm.value.new_value,
      reason: correctForm.value.reason,
    })
    successMessage.value = '更正申請已送出，園所將於 30 天內回覆'
    correctForm.value = {
      subject_entity_id: 0,
      field_name: 'address',
      new_value: '',
      reason: '',
    }
    await refresh()
  } catch (err) {
    const e = err as { displayMessage?: string; response?: { status?: number } }
    if (e.response?.status === 409) {
      errorMessage.value = '已有待處理的更正申請'
    } else {
      errorMessage.value = e?.displayMessage || '送出失敗'
    }
  } finally {
    loading.value = false
  }
}

// ── Opt-out request ──
const optOutScope = ref<ConsentScope>('photo_publish')
const optOutReason = ref('')

async function submitOptOut() {
  loading.value = true
  errorMessage.value = ''
  try {
    await submitOptOutRequest({
      scope: optOutScope.value,
      reason: optOutReason.value || undefined,
    })
    successMessage.value = '停止處理申請已送出'
    optOutReason.value = ''
    await refresh()
  } catch (err) {
    const e = err as { displayMessage?: string; response?: { status?: number } }
    if (e.response?.status === 409) {
      errorMessage.value = '已有待處理的停止處理申請'
    } else {
      errorMessage.value = e?.displayMessage || '送出失敗'
    }
  } finally {
    loading.value = false
  }
}

const children = computed(
  () =>
    (childrenStore.items || []) as {
      student_id: number
      name?: string
    }[],
)
</script>

<template>
  <div class="rights-view">
    <header class="rights-header">
      <button class="back-btn" type="button" @click="router.back()" aria-label="返回">
        <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>
      </button>
      <h1 class="title">個人資料權利</h1>
    </header>

    <p class="intro">
      依個人資料保護法 §3，您可隨時查詢、要求更正、停止處理或刪除您及子女的個人資料。
      所有申請進入園所處理 queue，30 天內回覆。
    </p>

    <nav class="tab-bar" role="tablist">
      <button
        v-for="t in [
          { v: 'consents', label: '同意紀錄' },
          { v: 'history', label: '歷次申請' },
          { v: 'delete', label: '申請刪除' },
          { v: 'correct', label: '申請更正' },
          { v: 'opt_out', label: '停止處理' },
        ]"
        :key="t.v"
        :class="['tab', { active: tab === t.v }]"
        type="button"
        role="tab"
        :aria-selected="tab === t.v"
        @click="tab = t.v as typeof tab"
      >
        {{ t.label }}
      </button>
    </nav>

    <div v-if="errorMessage" class="msg msg-error" role="alert">{{ errorMessage }}</div>
    <div v-if="successMessage" class="msg msg-success" role="status">
      {{ successMessage }}
    </div>

    <!-- Consents tab -->
    <section v-if="tab === 'consents'" class="panel">
      <ul class="consent-list">
        <li v-for="row in consentStatus" :key="row.scope" class="consent-row">
          <div class="consent-row-main">
            <strong>{{ SCOPE_LABELS[row.scope as ConsentScope] || row.scope }}</strong>
            <small v-if="row.consented_at">{{ row.consented_at.slice(0, 10) }}</small>
          </div>
          <span :class="['badge', row.consented === true ? 'ok' : 'no']">
            {{ row.consented === true ? '已同意' : row.consented === false ? '已撤回' : '未簽署' }}
          </span>
          <button
            v-if="row.consented === true && row.policy_version_id"
            type="button"
            class="revoke-btn"
            @click="revokeScope(row.scope as ConsentScope, row.policy_version_id!)"
          >
            撤回
          </button>
        </li>
      </ul>
    </section>

    <!-- History tab -->
    <section v-if="tab === 'history'" class="panel">
      <p v-if="dsrHistory.length === 0" class="empty">尚無申請紀錄</p>
      <ul v-else class="dsr-list">
        <li v-for="r in dsrHistory" :key="r.id" class="dsr-row">
          <div class="dsr-meta">
            <strong>{{ r.request_type === 'delete' ? '刪除' : r.request_type === 'correct' ? '更正' : '停止處理' }}</strong>
            <small>{{ r.submitted_at.slice(0, 10) }}</small>
          </div>
          <span :class="['badge', r.status]">{{ r.status === 'pending' ? '待處理' : r.status === 'approved' ? '已同意' : '已拒絕' }}</span>
          <p class="dsr-reason">{{ r.reason || '—' }}</p>
        </li>
      </ul>
    </section>

    <!-- Delete -->
    <section v-if="tab === 'delete'" class="panel">
      <p class="panel-hint">
        申請刪除子女資料。基於合班/出席稽核與稅務 7 年保留義務，實際刪除由園所決定。
      </p>
      <label class="field">
        <span>選擇子女</span>
        <select v-model="deleteForm.subject_entity_id">
          <option :value="0">請選擇</option>
          <option v-for="c in children" :key="c.student_id" :value="c.student_id">
            {{ c.name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>刪除理由（≥5 字）</span>
        <textarea v-model="deleteForm.reason" rows="3" />
      </label>
      <button class="submit-btn" type="button" :disabled="loading" @click="submitDelete">
        送出申請
      </button>
    </section>

    <!-- Correct -->
    <section v-if="tab === 'correct'" class="panel">
      <p class="panel-hint">
        申請更正子女資料欄位。為防 IDOR，更正由園所審核後實際套用。
      </p>
      <label class="field">
        <span>選擇子女</span>
        <select v-model="correctForm.subject_entity_id">
          <option :value="0">請選擇</option>
          <option v-for="c in children" :key="c.student_id" :value="c.student_id">
            {{ c.name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>要更正的欄位</span>
        <select v-model="correctForm.field_name">
          <option v-for="f in CORRECT_FIELDS" :key="f.value" :value="f.value">
            {{ f.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>新值</span>
        <input v-model="correctForm.new_value" type="text" />
      </label>
      <label class="field">
        <span>更正理由（≥5 字）</span>
        <textarea v-model="correctForm.reason" rows="3" />
      </label>
      <button class="submit-btn" type="button" :disabled="loading" @click="submitCorrect">
        送出申請
      </button>
    </section>

    <!-- Opt-out -->
    <section v-if="tab === 'opt_out'" class="panel">
      <p class="panel-hint">
        申請停止特定資料處理範疇。比「撤回同意」具更高法律意義（園所須備案）。
      </p>
      <label class="field">
        <span>停止範疇</span>
        <select v-model="optOutScope">
          <option v-for="s in CONSENT_SCOPES" :key="s" :value="s">
            {{ SCOPE_LABELS[s] }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>原因（選填）</span>
        <textarea v-model="optOutReason" rows="3" />
      </label>
      <button class="submit-btn" type="button" :disabled="loading" @click="submitOptOut">
        送出申請
      </button>
    </section>
  </div>
</template>

<style scoped>
.rights-view {
  padding: 16px;
  max-width: 640px;
  margin: 0 auto;
}

.rights-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.back-btn {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--pt-text);
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--brand-primary, #0d9053);
}

.intro {
  font-size: 13px;
  line-height: 1.7;
  color: var(--pt-text-muted);
  background: rgba(13, 144, 83, 0.06);
  padding: 12px;
  border-radius: 12px;
  margin: 0 0 16px;
}

.tab-bar {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  padding-bottom: 0;
}

.tab {
  background: none;
  border: none;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--pt-text-muted);
  white-space: nowrap;
  border-bottom: 2px solid transparent;
}

.tab.active {
  color: var(--brand-primary, #0d9053);
  border-bottom-color: var(--brand-primary, #0d9053);
  font-weight: 600;
}

.msg {
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 12px;
}

.msg-error { background: var(--coral-100, #ffe3e0); color: var(--coral-700, #b14545); }
.msg-success { background: rgba(13, 144, 83, 0.08); color: var(--brand-primary, #0d9053); }

.panel { padding: 0; }
.panel-hint { font-size: 13px; color: var(--pt-text-muted); margin-bottom: 16px; line-height: 1.7; }

.consent-list, .dsr-list { list-style: none; padding: 0; margin: 0; }

.consent-row, .dsr-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  margin-bottom: 8px;
}

.consent-row-main strong, .dsr-meta strong {
  display: block;
  font-size: 14px;
  color: var(--pt-text);
}
.consent-row-main small, .dsr-meta small {
  display: block;
  font-size: 11px;
  color: var(--pt-text-muted);
  margin-top: 2px;
}

.dsr-reason {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--pt-text-muted);
  margin: 4px 0 0;
}

.badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.badge.ok, .badge.approved { background: rgba(13, 144, 83, 0.12); color: var(--brand-primary, #0d9053); }
.badge.no, .badge.rejected { background: var(--coral-100, #ffe3e0); color: var(--coral-700, #b14545); }
.badge.pending { background: rgba(0, 0, 0, 0.06); color: var(--pt-text-muted); }

.revoke-btn {
  background: none;
  border: 1px solid var(--coral-300, #f4b8b3);
  color: var(--coral-700, #b14545);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.field {
  display: block;
  margin-bottom: 12px;
}
.field > span {
  display: block;
  font-size: 12px;
  color: var(--pt-text-muted);
  margin-bottom: 4px;
}
.field input, .field select, .field textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.16);
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.submit-btn {
  width: 100%;
  background: var(--brand-primary, #0d9053);
  color: white;
  border: none;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  margin-top: 8px;
}

.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.empty {
  text-align: center;
  color: var(--pt-text-muted);
  font-size: 13px;
  padding: 32px 0;
}
</style>
