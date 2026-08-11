<script setup lang="ts">
/**
 * 建立臨時接送授權精靈：選孩子 → 選接送人（常用或臨時填寫）→ 選日期 → 確認。
 * 送出成功後在原頁顯示取件碼卡（不導頁，避免明碼因導頁遺失）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import {
  createPickupAuthorizations,
  listPickupPersons,
} from '../api/pickup'
import { toast } from '../utils/toast'
import { useFriendlyError } from '@/composables/useFriendlyError'
import PickupPersonForm from '../components/pickup/PickupPersonForm.vue'
import PickupCodeCard from '../components/pickup/PickupCodeCard.vue'
import M3Card from '../components/m3/M3Card.vue'
import M3Checkbox from '../components/m3/M3Checkbox.vue'
import M3Button from '../components/m3/M3Button.vue'

interface Child {
  student_id: number
  name?: string
}

interface PickupPerson {
  id: number
  person_name: string
  person_relation: string
  person_phone: string
  [key: string]: unknown
}

const router = useRouter()
const childrenStore = useChildrenStore()
const { getFriendly } = useFriendlyError()

function _toastFriendly(err: unknown, fallback: string) {
  const f = getFriendly(err)
  const msg = f.message || fallback
  const text = f.nextStep ? `${msg}｜${f.nextStep}` : msg
  if (f.level === 'info') toast.info(text)
  else if (f.level === 'warning') toast.warn(text)
  else toast.error(text)
}

const children = computed(() => (childrenStore.items || []) as Child[])
const selectedStudentIds = ref<number[]>([])

function toggleStudent(id: number) {
  const idx = selectedStudentIds.value.indexOf(id)
  if (idx === -1) selectedStudentIds.value.push(id)
  else selectedStudentIds.value.splice(idx, 1)
}

// 常用接送人：僅載入第一位選中孩子的名單（多孩批次常見情境是同一位親友，
// 若名單因孩子而異，家長仍可切換到「臨時填寫」）。
const persons = ref<PickupPerson[]>([])
async function loadPersonsForFirstSelected() {
  const sid = selectedStudentIds.value[0]
  if (!sid) {
    persons.value = []
    return
  }
  try {
    const { data } = await listPickupPersons(sid)
    persons.value = (data as { items?: PickupPerson[] })?.items || []
  } catch {
    persons.value = []
  }
}
watch(() => selectedStudentIds.value[0], loadPersonsForFirstSelected)

type PersonMode = 'saved' | 'manual'
const personMode = ref<PersonMode>('saved')
const selectedPersonId = ref<number | null>(null)
const manualForm = ref({
  personName: '', personRelation: '', personPhone: '', note: '',
  photoFile: null as File | null,
})
const saveToList = ref(false)

const todayStr = (() => {
  const d = new Date()
  return d.toISOString().slice(0, 10)
})()
const maxDateStr = (() => {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
})()
const pickupDate = ref(todayStr)

const submitting = ref(false)
const resultCode = ref<string | null>(null)
const resultPersonName = ref('')

const canSubmit = computed(() => {
  if (selectedStudentIds.value.length === 0) return false
  if (!pickupDate.value) return false
  if (personMode.value === 'saved') return !!selectedPersonId.value
  return (
    !!manualForm.value.personName.trim() &&
    !!manualForm.value.personRelation.trim() &&
    !!manualForm.value.personPhone.trim()
  )
})

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const fd = new FormData()
    fd.append('student_ids', selectedStudentIds.value.join(','))
    fd.append('pickup_date', pickupDate.value)
    if (personMode.value === 'saved' && selectedPersonId.value) {
      fd.append('pickup_person_id', String(selectedPersonId.value))
    } else {
      fd.append('person_name', manualForm.value.personName.trim())
      fd.append('person_relation', manualForm.value.personRelation.trim())
      fd.append('person_phone', manualForm.value.personPhone.trim())
      if (manualForm.value.note.trim()) fd.append('note', manualForm.value.note.trim())
      if (manualForm.value.photoFile) fd.append('photo', manualForm.value.photoFile)
      if (saveToList.value) fd.append('save_to_list', 'true')
    }
    const { data } = await createPickupAuthorizations(fd)
    const body = data as { code: string; items: { person_name: string }[] }
    resultCode.value = body.code
    resultPersonName.value = body.items[0]?.person_name || ''
    toast.success('授權已成立')
  } catch (err) {
    _toastFriendly(err, '建立授權失敗')
  } finally {
    submitting.value = false
  }
}

function backToList() {
  router.push('/pickup')
}

onMounted(async () => {
  await childrenStore.load()
})
</script>

<template>
  <div class="pickup-create-view">
    <template v-if="resultCode">
      <PickupCodeCard
        :code="resultCode"
        :person-name="resultPersonName"
        :pickup-date="pickupDate"
      />
      <div class="result-footer">
        <M3Button variant="filled" @click="backToList">回到臨時接送</M3Button>
      </div>
    </template>

    <template v-else>
      <section class="wizard-step">
        <h2 class="step-title">1. 選擇孩子</h2>
        <M3Card
          v-for="c in children"
          :key="c.student_id"
          class="child-row"
          clickable
          @click="toggleStudent(c.student_id)"
        >
          <div class="checkbox-row">
            <M3Checkbox :model-value="selectedStudentIds.includes(c.student_id)" />
            <span>{{ c.name || `學生 #${c.student_id}` }}</span>
          </div>
        </M3Card>
      </section>

      <section class="wizard-step">
        <h2 class="step-title">2. 接送人</h2>
        <div class="mode-toggle">
          <button
            type="button"
            :class="['mode-btn', { active: personMode === 'saved' }]"
            @click="personMode = 'saved'"
          >常用接送人</button>
          <button
            type="button"
            :class="['mode-btn', { active: personMode === 'manual' }]"
            @click="personMode = 'manual'"
          >臨時填寫</button>
        </div>

        <template v-if="personMode === 'saved'">
          <p v-if="persons.length === 0" class="empty-hint">
            尚無常用接送人，請選擇「臨時填寫」或先到「臨時接送」頁新增。
          </p>
          <M3Card
            v-for="p in persons"
            :key="p.id"
            class="person-option"
            clickable
            @click="selectedPersonId = p.id"
          >
            <div class="checkbox-row">
              <M3Checkbox :model-value="selectedPersonId === p.id" />
              <span>{{ p.person_name }}（{{ p.person_relation }}）</span>
            </div>
          </M3Card>
        </template>

        <template v-else>
          <PickupPersonForm v-model="manualForm" :submitting="false" hide-footer />
          <label class="save-to-list-row">
            <input type="checkbox" v-model="saveToList" />
            同時存入常用接送人名單
          </label>
        </template>
      </section>

      <section class="wizard-step">
        <h2 class="step-title">3. 接送日期</h2>
        <input
          type="date"
          class="date-input"
          :min="todayStr"
          :max="maxDateStr"
          v-model="pickupDate"
        />
      </section>

      <div class="wizard-footer">
        <M3Button variant="filled" :disabled="!canSubmit || submitting" @click="submit">
          {{ submitting ? '送出中...' : '確認建立授權' }}
        </M3Button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pickup-create-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
  padding-bottom: 32px;
}

.wizard-step {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.step-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.child-row, .person-option {
  padding: 10px 12px;
}
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
.empty-hint {
  font-size: 13px;
  color: var(--m3-on-surface-variant, var(--pt-text-placeholder));
}
.mode-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}
.mode-btn {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--m3-outline-variant, var(--pt-border-strong));
  border-radius: 8px;
  background: var(--neutral-0);
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  font-size: 13px;
}
.mode-btn.active {
  background: var(--m3-primary, var(--brand-primary));
  color: var(--neutral-0);
  border-color: transparent;
}
.save-to-list-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  padding: 0 16px;
}
.date-input {
  padding: 8px 10px;
  border: 1px solid var(--m3-outline-variant, var(--pt-border-strong));
  border-radius: 6px;
  font-size: 14px;
}
.wizard-footer, .result-footer {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}
</style>
