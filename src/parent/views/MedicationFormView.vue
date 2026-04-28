<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import {
  createMedicationOrder,
  uploadMedicationPhoto,
} from '../api/medications'
import { toast } from '../utils/toast'
import { todayISO } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const childrenStore = useChildrenStore()

const submitting = ref(false)
const allergyWarning = ref(null) // { allergens: [...] } 出現時顯示確認彈框
const photoFiles = ref([]) // File[]

const form = ref({
  student_id: null,
  order_date: todayISO(),
  medication_name: '',
  dose: '',
  time_slots: ['08:00'],
  note: '',
})

const studentOptions = computed(() => childrenStore.items || [])

onMounted(async () => {
  await childrenStore.load()
  const fromQuery = Number(route.query.student_id)
  form.value.student_id =
    fromQuery || studentOptions.value[0]?.student_id || null
})

function addSlot() {
  if (form.value.time_slots.length >= 10) return
  form.value.time_slots.push('12:00')
}

function removeSlot(i) {
  if (form.value.time_slots.length === 1) return
  form.value.time_slots.splice(i, 1)
}

function onPick(e) {
  const incoming = Array.from(e.target.files || [])
  // 簡單前置檢查：max 3、size < 10MB
  const valid = []
  for (const f of incoming) {
    if (valid.length + photoFiles.value.length >= 3) break
    if (f.size > 10 * 1024 * 1024) {
      toast.warn(`${f.name} 超過 10MB，已略過`)
      continue
    }
    valid.push(f)
  }
  photoFiles.value = [...photoFiles.value, ...valid]
  e.target.value = ''
}

function removePhoto(i) {
  photoFiles.value.splice(i, 1)
}

async function submit(forceAcknowledge = false) {
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
    // 連續上傳照片
    for (const f of photoFiles.value) {
      try {
        await uploadMedicationPhoto(data.id, f)
      } catch (err) {
        toast.warn(`${f.name} 上傳失敗：${err?.displayMessage || ''}`)
      }
    }
    toast.success('已送出')
    router.replace({ path: `/medications/${data.id}` })
  } catch (err) {
    const detail = err?.response?.data?.detail
    if (detail && detail.code === 'ALLERGY_WARNING') {
      allergyWarning.value = detail
    } else {
      toast.error(err?.displayMessage || '送出失敗')
    }
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
    <h2>新增用藥單</h2>

    <label>子女</label>
    <select v-model="form.student_id">
      <option v-for="c in studentOptions" :key="c.student_id" :value="c.student_id">{{ c.name }}</option>
    </select>

    <label>用藥日期</label>
    <input type="date" v-model="form.order_date" />

    <label>藥名</label>
    <input v-model="form.medication_name" placeholder="例：退燒藥 / Amoxicillin 250mg" maxlength="100" />

    <label>劑量</label>
    <input v-model="form.dose" placeholder="例：5ml / 1顆" maxlength="50" />

    <label>用藥時段</label>
    <div class="slots">
      <div v-for="(t, i) in form.time_slots" :key="i" class="slot-row">
        <input type="time" v-model="form.time_slots[i]" />
        <button type="button" class="del-btn" @click="removeSlot(i)" :disabled="form.time_slots.length === 1">×</button>
      </div>
      <button type="button" class="add-slot" @click="addSlot" :disabled="form.time_slots.length >= 10">+ 新增時段</button>
    </div>

    <label>備註</label>
    <textarea v-model="form.note" placeholder="飯後服用 / 冷藏…" rows="2" maxlength="500" />

    <label>藥袋／處方照（最多 3 張）</label>
    <input type="file" accept="image/*,application/pdf" multiple @change="onPick" />
    <ul class="files">
      <li v-for="(f, i) in photoFiles" :key="i">
        <span>{{ f.name }} ({{ Math.round(f.size / 1024) }}KB)</span>
        <button type="button" @click="removePhoto(i)">移除</button>
      </li>
    </ul>

    <div class="actions">
      <button class="cancel" @click="router.back()">取消</button>
      <button class="submit" @click="submit(false)" :disabled="submitting">
        {{ submitting ? '送出中…' : '送出' }}
      </button>
    </div>

    <!-- 過敏軟警告彈框 -->
    <div v-if="allergyWarning" class="modal-overlay" @click.self="cancelAllergy">
      <div class="modal">
        <h3>⚠ 用藥可能與過敏原相關</h3>
        <p>偵測到該藥名與以下過敏原相關：</p>
        <ul>
          <li v-for="a in allergyWarning.allergens" :key="a.id">
            <strong>{{ a.allergen }}</strong>（{{ a.severity }}）
            <span v-if="a.reaction_symptom"> · {{ a.reaction_symptom }}</span>
          </li>
        </ul>
        <p class="hint">仍要送出嗎？老師端會看到此用藥單，請務必確認與兒科醫師討論過。</p>
        <div class="modal-actions">
          <button @click="cancelAllergy">取消</button>
          <button class="confirm" @click="confirmAllergy">仍要送出</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.med-form { padding: 16px; display: flex; flex-direction: column; gap: 8px; }
h2 { margin: 0 0 12px; font-size: 18px; }
label { font-size: 13px; color: #555; margin-top: 8px; }
input, select, textarea { padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
.slots { display: flex; flex-direction: column; gap: 6px; }
.slot-row { display: flex; gap: 6px; align-items: center; }
.slot-row input { flex: 1; }
.del-btn { width: 32px; padding: 0; background: #fde8e8; color: #a51c1c; border: none; border-radius: 4px; }
.del-btn:disabled { opacity: 0.4; }
.add-slot { padding: 6px; background: #f0f2f5; border: 1px dashed #aaa; border-radius: 4px; font-size: 13px; }
.files { list-style: none; padding: 0; font-size: 13px; }
.files li { display: flex; justify-content: space-between; padding: 4px 0; }
.actions { display: flex; gap: 8px; margin-top: 16px; }
.actions button { flex: 1; padding: 10px; border-radius: 6px; border: none; font-size: 15px; }
.cancel { background: #f0f2f5; color: #333; }
.submit { background: #2c7be5; color: #fff; }
.submit:disabled { opacity: 0.5; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 8px; padding: 16px; width: 90%; max-width: 360px; }
.modal h3 { margin: 0 0 8px; color: #a51c1c; }
.modal-actions { display: flex; gap: 8px; margin-top: 12px; }
.modal-actions button { flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #ccc; }
.modal-actions .confirm { background: #a51c1c; color: #fff; border-color: #a51c1c; }
.hint { color: #888; font-size: 13px; }
</style>
