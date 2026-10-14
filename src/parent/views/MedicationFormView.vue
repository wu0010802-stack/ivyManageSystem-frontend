<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import {
  createMedicationOrder,
  uploadMedicationPhoto,
} from '../api/medications'
import { toast } from '../utils/toast'
import { todayISO } from '@/utils/format'
import { MEDICATION_PHOTO_MAX, MEDICATION_PHOTO_MAX_BYTES, nextMedicationSlot } from '../utils/medicationForm'
import ParentIcon from '../components/ParentIcon.vue'
import AppModal from '../components/AppModal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useLeaveConfirm } from '../composables/useUnsavedGuard'

interface AllergyWarning {
  code?: string
  allergens?: { id: number | string; allergen?: string; severity?: string; reaction_symptom?: string }[]
}

const route = useRoute()
const router = useRouter()
const childrenStore = useChildrenStore()

const allergyTitleId = useId()
const allergyDescId = useId()

const submitting = ref(false)
const createdOrderId = ref<number | null>(null)
const allergyWarning = ref<AllergyWarning | null>(null)
const photoFiles = ref<File[]>([])

const form = ref<{
  student_id: number | null
  order_date: string
  medication_name: string
  dose: string
  time_slots: string[]
  note: string
}>({
  student_id: null,
  order_date: todayISO(),
  medication_name: '',
  dose: '',
  time_slots: ['08:00'],
  note: '',
})

const INITIAL_ORDER_DATE = form.value.order_date
const INITIAL_SLOTS = form.value.time_slots.join(',')

/** 還沒送出、且家長已經填了東西：離開前要確認 */
function isFormDirty(): boolean {
  if (createdOrderId.value !== null) return false
  const f = form.value
  return (
    !!f.medication_name.trim()
    || !!f.dose.trim()
    || !!f.note.trim()
    || photoFiles.value.length > 0
    || f.order_date !== INITIAL_ORDER_DATE
    || f.time_slots.join(',') !== INITIAL_SLOTS
  )
}
const { dialogOpen: leaveConfirmOpen, confirmLeave } = useLeaveConfirm(isFormDirty)

const studentOptions = computed(() => (childrenStore.items || []) as { student_id: number; name?: string }[])

const allergyModalOpen = computed({
  get: () => allergyWarning.value !== null,
  set: (v: boolean) => {
    if (!v) allergyWarning.value = null
  },
})

onMounted(async () => {
  await childrenStore.load()
  const fromQuery = Number(route.query.student_id)
  form.value.student_id =
    fromQuery || studentOptions.value[0]?.student_id || null
})

function addSlot() {
  if (form.value.time_slots.length >= 10) return
  // 依上一個時段推算（08:00 → 12:00 → 16:00），不再每次都塞 12:00 讓家長逐一改
  form.value.time_slots.push(nextMedicationSlot(form.value.time_slots))
}

function removeSlot(i: number) {
  if (form.value.time_slots.length === 1) return
  form.value.time_slots.splice(i, 1)
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const incoming = Array.from(input.files || [])
  // 簡單前置檢查：張數上限與詳情頁共用 MEDICATION_PHOTO_MAX、單檔 < 10MB
  const valid: File[] = []
  let overflow = 0
  for (const f of incoming) {
    if (valid.length + photoFiles.value.length >= MEDICATION_PHOTO_MAX) {
      overflow += 1
      continue
    }
    if (f.size > MEDICATION_PHOTO_MAX_BYTES) {
      toast.warn(`${f.name} 超過 10MB，已略過`)
      continue
    }
    valid.push(f)
  }
  if (overflow > 0) toast.warn(`最多 ${MEDICATION_PHOTO_MAX} 張，已略過 ${overflow} 張`)
  photoFiles.value = [...photoFiles.value, ...valid]
  input.value = ''
}

function removePhoto(i: number) {
  photoFiles.value.splice(i, 1)
}

async function submit(forceAcknowledge = false) {
  if (submitting.value || createdOrderId.value !== null) return
  if (!form.value.student_id) {
    toast.warn('請先選擇子女')
    return
  }
  if (!form.value.medication_name.trim() || !form.value.dose.trim()) {
    toast.warn('請填寫藥名與劑量')
    return
  }
  submitting.value = true
  try {
    const payload = {
      ...form.value,
      acknowledge_allergy_warning: forceAcknowledge,
    }
    const { data } = await createMedicationOrder(payload)
    const createdId = Number((data as { id: number | string }).id)
    createdOrderId.value = createdId
    await uploadRemainingPhotos(createdId)
  } catch (err) {
    const e = err as Record<string, unknown>
    const errData = (e?.response as Record<string, unknown>)?.data as Record<string, unknown> | undefined
    const detail = errData?.detail as AllergyWarning | undefined
    if (detail && detail.code === 'ALLERGY_WARNING') {
      allergyWarning.value = detail
    } else {
      toast.error(String(e?.displayMessage || '送出失敗'))
    }
  } finally {
    submitting.value = false
  }
}

async function uploadRemainingPhotos(orderId: number) {
  const failed: File[] = []
  for (const file of photoFiles.value) {
    try {
      await uploadMedicationPhoto(orderId, file)
    } catch {
      failed.push(file)
    }
  }
  photoFiles.value = failed
  if (failed.length > 0) return
  toast.success('用藥單已送出，所選附件已上傳完成')
  router.replace({ path: `/medications/${orderId}` })
}

async function retryPhotos() {
  if (submitting.value || createdOrderId.value === null) return
  submitting.value = true
  try {
    await uploadRemainingPhotos(createdOrderId.value)
  } finally {
    submitting.value = false
  }
}

function confirmAllergy() {
  allergyWarning.value = null
  submit(true)
}

function cancelAllergy() {
  allergyWarning.value = null
}
</script>

<template>
  <div class="med-form">
    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">新增用藥單</p>
      <h1 id="med-form-title" class="pt-page-hero-title">填寫服藥資訊</h1>
      <p class="pt-page-hero-note">老師收到後會依時段協助餵藥</p>
    </header>

    <fieldset class="med-fields" :disabled="submitting || createdOrderId !== null">
      <section class="pt-card">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded">child_care</span>
          基本資料
        </h2>

        <label for="med-student">子女</label>
        <select id="med-student" v-model="form.student_id">
          <option v-for="c in studentOptions" :key="c.student_id" :value="c.student_id">{{ c.name }}</option>
        </select>

        <label for="med-date">用藥日期</label>
        <input id="med-date" type="date" v-model="form.order_date" />

        <label for="med-name">藥名</label>
        <input
          id="med-name"
          v-model="form.medication_name"
          placeholder="例：退燒藥 / Amoxicillin 250mg"
          maxlength="100"
          autocomplete="off"
        />

        <label for="med-dose">劑量</label>
        <input
          id="med-dose"
          v-model="form.dose"
          placeholder="例：5ml / 1顆"
          maxlength="50"
          autocomplete="off"
        />
      </section>

      <section class="pt-card">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded">schedule</span>
          用藥時段
          <span class="pt-card-title-count">{{ form.time_slots.length }} / 10</span>
        </h2>
        <div class="slots">
          <div v-for="(_, i) in form.time_slots" :key="i" class="slot-row">
            <input :id="`med-time-${i}`" type="time" v-model="form.time_slots[i]" />
            <button
              type="button"
              class="pt-icon-btn del-btn"
              :aria-label="`移除第 ${i + 1} 個時段`"
              @click="removeSlot(i)"
              :disabled="form.time_slots.length === 1"
            >
              <ParentIcon name="close" size="sm" />
            </button>
          </div>
          <button
            type="button"
            class="add-slot"
            @click="addSlot"
            :disabled="form.time_slots.length >= 10"
          >
            <ParentIcon name="plus" size="sm" />
            新增時段
          </button>
        </div>
      </section>

      <section class="pt-card">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded">attach_file</span>
          備註與照片
        </h2>

        <label for="med-note">備註</label>
        <textarea
          id="med-note"
          v-model="form.note"
          placeholder="飯後服用 / 冷藏…"
          rows="2"
          maxlength="500"
        />

        <label for="med-files">藥袋／處方照（最多 {{ MEDICATION_PHOTO_MAX }} 張，已選 {{ photoFiles.length }} 張）</label>
        <input id="med-files" type="file" accept="image/*,application/pdf" multiple @change="onPick" />
        <ul class="files">
          <li v-for="(f, i) in photoFiles" :key="i">
            <span>{{ f.name }} ({{ Math.round(f.size / 1024) }}KB)</span>
            <button
              type="button"
              class="pt-ghost-btn"
              :aria-label="`移除 ${f.name}`"
              @click="removePhoto(i)"
            >
              移除
            </button>
          </li>
        </ul>
      </section>

    </fieldset>
    <section v-if="createdOrderId !== null && photoFiles.length" class="pt-card" role="status">
      <p v-if="submitting">用藥單已成立，正在上傳照片…</p>
      <p v-else>用藥單已成立，{{ photoFiles.length }} 張照片未上傳</p>
      <p>請重新上傳，或到用藥單詳情稍後補傳。</p>
      <button type="button" class="pt-action-btn" data-testid="retry-photos" :disabled="submitting" @click="retryPhotos">{{ submitting ? '上傳中…' : '重新上傳照片' }}</button>
      <button type="button" class="pt-ghost-btn" :disabled="submitting" @click="router.replace({ path: `/medications/${createdOrderId}` })">查看已成立的用藥單</button>
    </section>

    <div v-if="createdOrderId === null" class="actions">
      <button type="button" class="pt-ghost-btn cancel-btn" :disabled="submitting" @click="router.back()">取消</button>
      <button
        type="button"
        class="pt-action-btn submit-btn"
        :disabled="submitting"
        @click="submit(false)"
      >
        {{ submitting ? '送出中…' : '送出' }}
      </button>
    </div>

    <!-- 有未送出的修改時離開前確認（返回鍵／LINE 返回／底部導覽） -->
    <ConfirmDialog
      v-model:open="leaveConfirmOpen"
      title="要放棄這張用藥單嗎？"
      message="剛剛填寫的內容還沒送出，離開後不會保留。"
      confirm-label="離開"
      cancel-label="繼續填寫"
      destructive
      @confirm="confirmLeave"
    />

    <!-- 過敏軟警告彈框（已套 AppModal：focus trap + esc + a11y） -->
    <AppModal
      v-model:open="allergyModalOpen"
      :labelled-by="allergyTitleId"
      :described-by="allergyDescId"
      max-width="360px"
    >
      <div class="allergy-modal">
        <h3 :id="allergyTitleId" class="allergy-title">
          <ParentIcon name="warn" size="sm" />
          用藥可能與過敏原相關
        </h3>
        <p :id="allergyDescId">偵測到該藥名與以下過敏原相關：</p>
        <ul>
          <li v-for="a in allergyWarning?.allergens || []" :key="a.id">
            <strong>{{ a.allergen }}</strong>（{{ a.severity }}）
            <span v-if="a.reaction_symptom"> · {{ a.reaction_symptom }}</span>
          </li>
        </ul>
        <p class="hint">仍要送出嗎？老師端會看到此用藥單，請務必確認與兒科醫師討論過。</p>
        <div class="modal-actions">
          <button type="button" class="pt-ghost-btn cancel-modal" @click="cancelAllergy">取消</button>
          <button type="button" class="confirm-modal" @click="confirmAllergy">仍要送出</button>
        </div>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.med-form { padding-bottom: 24px; }
.med-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
.med-fields > .pt-card { margin-top: var(--space-3, 12px); }

.pt-card label {
  display: block;
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
  margin-top: var(--space-3, 12px);
  margin-bottom: var(--space-1, 4px);
  font-weight: var(--font-weight-medium, 500);
}
.pt-card label:first-of-type { margin-top: 0; }

.pt-card input,
.pt-card select,
.pt-card textarea {
  width: 100%;
  padding: 10px;
  min-height: var(--touch-target-min, 44px);
  border: 1px solid var(--pt-border-strong);
  border-radius: var(--radius-md, 8px);
  font-size: 16px; /* <16px 會讓 iOS/LIFF 聚焦時整頁放大，見 inputFontSize.spec.ts */
  font-family: inherit;
  background: var(--pt-surface-card, #fff);
}
.pt-card input:focus-visible,
.pt-card select:focus-visible,
.pt-card textarea:focus-visible {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-primary-soft);
}

.pt-card textarea { min-height: 60px; }

.slots {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 6px);
  margin-top: 4px;
}

.slot-row {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
}

.slot-row input { flex: 1; }

.del-btn {
  background: var(--color-danger-soft);
  color: var(--color-danger);
  border-color: var(--color-danger-soft);
}
.del-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px);
  background: var(--pt-surface-mute, #f5fbe6);
  border: 1px dashed var(--pt-border-strong);
  border-radius: 10px;
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
  cursor: pointer;
}

.add-slot:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.files {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  font-size: var(--text-sm, 13px);
}

.files li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1, 4px) 0;
}

.actions {
  display: flex;
  gap: var(--space-2, 8px);
  margin: var(--space-4, 16px) 16px 0;
}

.cancel-btn,
.submit-btn { flex: 1; }

/* ===== 過敏 modal 內容（AppModal 提供 dialog 框架） ===== */
.allergy-modal {
  padding: var(--space-4, 16px);
}

.allergy-title {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  margin: 0 0 var(--space-2, 8px);
  color: var(--color-danger);
  font-size: var(--text-lg, 16px);
}

.allergy-modal p {
  margin: var(--space-2, 8px) 0;
  color: var(--m3-on-surface, var(--pt-text-strong));
  font-size: var(--text-base, 14px);
}

.allergy-modal ul {
  margin: var(--space-2, 8px) 0;
  padding-left: var(--space-5, 20px);
  font-size: var(--text-base, 14px);
}

.allergy-modal .hint {
  color: var(--pt-text-muted);
  font-size: var(--text-sm, 13px);
}

.modal-actions {
  display: flex;
  gap: var(--space-2, 8px);
  margin-top: var(--space-3, 12px);
}

.modal-actions button {
  flex: 1;
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px);
  border-radius: var(--radius-md, 6px);
  border: 1px solid var(--pt-text-hint);
  cursor: pointer;
  font-size: var(--text-base, 14px);
}

.cancel-modal {
  background: var(--neutral-0);
  color: var(--m3-on-surface, var(--pt-text-strong));
}

.confirm-modal {
  background: var(--color-danger);
  color: var(--neutral-0);
  border-color: var(--color-danger);
}
</style>
