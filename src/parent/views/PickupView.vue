<script setup lang="ts">
/**
 * 臨時接送：進行中/歷史授權列表 + 常用接送人管理。
 * 建立新授權導去 /pickup/new（Task 11）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ChildContextHeader from '../components/ChildContextHeader.vue'
import {
  listPickupAuthorizations,
  listPickupPersons,
  createPickupPerson,
  updatePickupPerson,
  deletePickupPerson,
  cancelPickupAuthorization,
  regeneratePickupCode,
} from '../api/pickup'
import { toast } from '../utils/toast'
import { useFriendlyError } from '@/composables/useFriendlyError'
import ParentBottomSheet from '../components/ParentBottomSheet.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import PickupPersonForm from '../components/pickup/PickupPersonForm.vue'
import PickupCodeCard from '../components/pickup/PickupCodeCard.vue'
import M3Card from '../components/m3/M3Card.vue'
import M3Button from '../components/m3/M3Button.vue'
import M3Chip from '../components/m3/M3Chip.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import EmptyState from '@/components/common/EmptyState.vue'

interface PickupAuth {
  id: number
  student_id: number
  student_name: string
  person_name: string
  person_relation: string
  person_phone: string
  pickup_date: string
  status: string
  effective_status: string
  batch_key: string | null
  [key: string]: unknown
}

interface PickupPerson {
  id: number
  student_id: number
  person_name: string
  person_relation: string
  person_phone: string
  is_active: boolean
  [key: string]: unknown
}

const router = useRouter()
const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()
const { getFriendly } = useFriendlyError()

function _toastFriendly(err: unknown, fallback: string) {
  const f = getFriendly(err)
  const msg = f.message || fallback
  const text = f.nextStep ? `${msg}｜${f.nextStep}` : msg
  if (f.level === 'info') toast.info(text)
  else if (f.level === 'warning') toast.warn(text)
  else toast.error(text)
}

const authorizations = ref<PickupAuth[]>([])
const persons = ref<PickupPerson[]>([])
const loading = ref(false)
// F2：原本失敗只靠 transient toast，畫面留白與「沒有資料」無法區分；
// 補一個持久錯誤旗標讓「進行中授權」與「常用接送人」兩區塊改顯示可重試的錯誤態。
const loadError = ref(false)

const activeAuths = computed(() =>
  authorizations.value.filter((a) => a.effective_status === 'active'),
)
const historyAuths = computed(() =>
  authorizations.value.filter((a) => a.effective_status !== 'active'),
)
const showHistory = ref(false)

const STATUS_LABEL: Record<string, string> = {
  active: '進行中',
  completed: '已完成',
  cancelled: '已取消',
  expired: '已過期',
}

async function fetchData() {
  loading.value = true
  loadError.value = false
  try {
    const [authRes, personRes] = await Promise.all([
      listPickupAuthorizations(),
      selectedId.value
        ? listPickupPersons(selectedId.value)
        : Promise.resolve({ data: { items: [] } }),
    ])
    authorizations.value = (authRes.data as { items?: PickupAuth[] })?.items || []
    persons.value = (personRes.data as { items?: PickupPerson[] })?.items || []
  } catch (err) {
    loadError.value = true
    _toastFriendly(err, '載入失敗')
  } finally {
    loading.value = false
  }
}

function goCreate() {
  router.push('/pickup/new')
}

// ── 取件碼重發 ────────────────────────────────────────────────────────
const codeCardAuth = ref<PickupAuth | null>(null)
const codeCardCode = ref('')

async function askRegenerate(auth: PickupAuth) {
  try {
    const { data } = await regeneratePickupCode(auth.id)
    codeCardCode.value = (data as { code: string }).code
    codeCardAuth.value = auth
  } catch (err) {
    _toastFriendly(err, '重發取件碼失敗')
  }
}

// ── 取消授權 ──────────────────────────────────────────────────────────
const cancelTarget = ref<PickupAuth | null>(null)
const cancelOpen = computed({
  get: () => cancelTarget.value !== null,
  set: (v: boolean) => {
    if (!v) cancelTarget.value = null
  },
})

function askCancel(auth: PickupAuth) {
  cancelTarget.value = auth
}

async function doCancel() {
  const auth = cancelTarget.value
  cancelTarget.value = null
  if (!auth) return
  try {
    await cancelPickupAuthorization(auth.id)
    toast.success('已取消授權')
    fetchData()
  } catch (err) {
    _toastFriendly(err, '取消失敗')
  }
}

// ── 常用接送人管理 ────────────────────────────────────────────────────
const showPersonForm = ref(false)
const personSubmitting = ref(false)
const editingPersonId = ref<number | null>(null)
const personForm = ref({
  personName: '', personRelation: '', personPhone: '', note: '',
  photoFile: null as File | null,
})

function openAddPerson() {
  editingPersonId.value = null
  personForm.value = { personName: '', personRelation: '', personPhone: '', note: '', photoFile: null }
  showPersonForm.value = true
}

function openEditPerson(p: PickupPerson) {
  editingPersonId.value = p.id
  personForm.value = {
    personName: p.person_name, personRelation: p.person_relation,
    personPhone: p.person_phone, note: (p.note as string) || '', photoFile: null,
  }
  showPersonForm.value = true
}

function _buildPersonFormData(): FormData {
  const fd = new FormData()
  fd.append('person_name', personForm.value.personName.trim())
  fd.append('person_relation', personForm.value.personRelation.trim())
  fd.append('person_phone', personForm.value.personPhone.trim())
  if (personForm.value.note.trim()) fd.append('note', personForm.value.note.trim())
  if (personForm.value.photoFile) fd.append('photo', personForm.value.photoFile)
  return fd
}

async function submitPerson() {
  if (!selectedId.value) {
    toast.warn('請先選擇孩子')
    return
  }
  personSubmitting.value = true
  try {
    if (editingPersonId.value) {
      await updatePickupPerson(editingPersonId.value, _buildPersonFormData())
      toast.success('已更新')
    } else {
      const fd = _buildPersonFormData()
      fd.append('student_id', String(selectedId.value))
      await createPickupPerson(fd)
      toast.success('已新增')
    }
    showPersonForm.value = false
    fetchData()
  } catch (err) {
    _toastFriendly(err, '儲存失敗')
  } finally {
    personSubmitting.value = false
  }
}

const deletePersonTarget = ref<PickupPerson | null>(null)
const deletePersonOpen = computed({
  get: () => deletePersonTarget.value !== null,
  set: (v: boolean) => {
    if (!v) deletePersonTarget.value = null
  },
})

function askDeletePerson(p: PickupPerson) {
  deletePersonTarget.value = p
}

async function doDeletePerson() {
  const p = deletePersonTarget.value
  deletePersonTarget.value = null
  if (!p) return
  try {
    await deletePickupPerson(p.id)
    toast.success('已移除')
    fetchData()
  } catch (err) {
    _toastFriendly(err, '移除失敗')
  }
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected((childrenStore.items || []) as { student_id: number }[])
  fetchData()
})
</script>

<template>
  <div class="pickup-view">
    <ChildContextHeader variant="page" />

    <M3Card class="create-cta">
      <p class="create-cta-text">臨時有事無法接送？授權親友代為到園接送。</p>
      <M3Button variant="filled" @click="goCreate">
        <template #icon><span class="material-symbols-rounded">add</span></template>
        建立臨時接送授權
      </M3Button>
    </M3Card>

    <!-- F2：載入中骨架（僅初次載入、兩區塊皆空時）-->
    <div v-if="loading && authorizations.length === 0 && persons.length === 0" class="skeleton-wrap">
      <SkeletonBlock variant="card" :count="3" />
    </div>

    <!-- F2：失敗持久錯誤態＋重試（僅兩區塊皆空時，避免蓋掉已成功載入的舊資料） -->
    <MobileErrorRetry
      v-else-if="loadError && authorizations.length === 0 && persons.length === 0"
      @retry="fetchData"
    />

    <template v-else>
      <section class="pickup-section">
        <h2 class="section-title">進行中授權</h2>
        <EmptyState v-if="activeAuths.length === 0" variant="inline" title="目前沒有進行中的授權" />
        <M3Card v-for="a in activeAuths" :key="a.id" class="auth-card">
          <div class="auth-row">
            <div class="auth-info">
              <strong>{{ a.student_name }}</strong>
              <span class="auth-meta">{{ a.person_name }}（{{ a.person_relation }}）· {{ a.pickup_date }}</span>
            </div>
            <M3Chip>{{ STATUS_LABEL[a.effective_status] || a.effective_status }}</M3Chip>
          </div>
          <div class="auth-actions">
            <button type="button" class="link-btn" @click="askRegenerate(a)">重發取件碼</button>
            <button type="button" class="link-btn danger" @click="askCancel(a)">取消授權</button>
          </div>
        </M3Card>
      </section>

      <section class="pickup-section">
        <div class="section-header">
          <h2 class="section-title">常用接送人</h2>
          <button type="button" class="link-btn" @click="openAddPerson">+ 新增</button>
        </div>
        <EmptyState v-if="persons.length === 0" variant="inline" title="尚未建立常用接送人" />
        <M3Card
          v-for="p in persons"
          :key="p.id"
          class="person-card"
          clickable
          @click="openEditPerson(p)"
        >
          <div class="auth-row">
            <div class="auth-info">
              <strong>{{ p.person_name }}</strong>
              <span class="auth-meta">{{ p.person_relation }} · {{ p.person_phone }}</span>
            </div>
            <button
              type="button"
              class="link-btn danger"
              @click.stop="askDeletePerson(p)"
            >移除</button>
          </div>
        </M3Card>
      </section>

      <section class="pickup-section">
        <button type="button" class="section-toggle" @click="showHistory = !showHistory">
          歷史授權（{{ historyAuths.length }}）{{ showHistory ? '收起' : '展開' }}
        </button>
        <template v-if="showHistory">
          <M3Card v-for="a in historyAuths" :key="a.id" class="auth-card history">
            <div class="auth-row">
              <div class="auth-info">
                <strong>{{ a.student_name }}</strong>
                <span class="auth-meta">{{ a.person_name }}（{{ a.person_relation }}）· {{ a.pickup_date }}</span>
              </div>
              <M3Chip>{{ STATUS_LABEL[a.effective_status] || a.effective_status }}</M3Chip>
            </div>
          </M3Card>
        </template>
      </section>
    </template>

    <!-- 常用接送人新增/編輯 -->
    <ParentBottomSheet
      v-model="showPersonForm"
      :title="editingPersonId ? '編輯接送人' : '新增常用接送人'"
      :snap-points="['mid', 'full']"
      default-snap="mid"
    >
      <PickupPersonForm
        v-model="personForm"
        :submitting="personSubmitting"
        @submit="submitPerson"
        @cancel="showPersonForm = false"
      />
    </ParentBottomSheet>

    <!-- 取件碼重發結果 -->
    <ParentBottomSheet
      :model-value="!!codeCardAuth"
      title="取件碼"
      :snap-points="['mid']"
      default-snap="mid"
      @update:model-value="(v) => { if (!v) codeCardAuth = null }"
    >
      <PickupCodeCard
        v-if="codeCardAuth"
        :code="codeCardCode"
        :person-name="codeCardAuth.person_name"
        :pickup-date="codeCardAuth.pickup_date"
      />
    </ParentBottomSheet>

    <ConfirmDialog
      v-model:open="cancelOpen"
      title="確定取消此授權？"
      message="取消後接送人將無法再使用此取件碼。"
      confirm-label="取消授權"
      cancel-label="不取消"
      destructive
      @confirm="doCancel"
    />
    <ConfirmDialog
      v-model:open="deletePersonOpen"
      title="確定移除此常用接送人？"
      message="移除後不影響已成立的授權紀錄。"
      confirm-label="移除"
      destructive
      @confirm="doDeletePerson"
    />
  </div>
</template>

<style scoped>
.pickup-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 16px;
}

.create-cta {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
.create-cta-text {
  margin: 0;
  font-size: 14px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}

.skeleton-wrap {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pickup-section {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}
.empty-hint {
  font-size: 13px;
  color: var(--m3-on-surface-variant, var(--pt-text-placeholder));
  padding: 8px 0;
}

.auth-card, .person-card {
  padding: 12px;
}
.auth-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.auth-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.auth-meta {
  font-size: 12px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}
.auth-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
.link-btn {
  background: transparent;
  border: none;
  color: var(--m3-primary, var(--brand-primary));
  font-size: 13px;
  padding: 4px 0;
  cursor: pointer;
}
.link-btn.danger {
  color: var(--m3-error, var(--color-danger));
}
.history {
  opacity: 0.85;
}
.section-toggle {
  background: transparent;
  border: none;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  font-size: 13px;
  padding: 8px 0;
  text-align: left;
  cursor: pointer;
}
</style>
