<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  ackContactBook,
  deleteContactBookReply,
  getContactBookDetail,
  replyContactBook,
} from '../api/contactBook'
import { toast } from '../utils/toast'

const route = useRoute()
const entryId = Number(route.params.entryId)
const entry = ref(null)
const replies = ref([])
const newReply = ref('')
const loading = ref(false)
const submitting = ref(false)

const MOOD_LABEL = {
  happy: '開心 😄',
  normal: '普通 🙂',
  tired: '想睡 😴',
  sad: '難過 😢',
  sick: '不舒服 🤒',
}

const BOWEL_LABEL = {
  none: '未排便',
  normal: '正常',
  loose: '稀',
  constipated: '硬',
}

async function fetchData() {
  loading.value = true
  try {
    const { data } = await getContactBookDetail(entryId)
    entry.value = data
    replies.value = data?.replies || []
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

async function markRead() {
  try {
    const { data } = await ackContactBook(entryId)
    if (entry.value) {
      entry.value.my_acknowledged_at = data.read_at
    }
    if (!data.already_marked) {
      toast.success('已標記為已讀')
    }
  } catch (err) {
    toast.error(err?.displayMessage || '標記失敗')
  }
}

async function submitReply() {
  const body = newReply.value.trim()
  if (!body) return
  if (body.length > 500) {
    toast.warn('回覆不可超過 500 字')
    return
  }
  submitting.value = true
  try {
    const { data } = await replyContactBook(entryId, body)
    replies.value.push(data)
    newReply.value = ''
  } catch (err) {
    toast.error(err?.displayMessage || '送出失敗')
  } finally {
    submitting.value = false
  }
}

async function removeReply(replyId) {
  try {
    await deleteContactBookReply(entryId, replyId)
    replies.value = replies.value.filter((r) => r.id !== replyId)
  } catch (err) {
    toast.error(err?.displayMessage || '刪除失敗')
  }
}

onMounted(async () => {
  await fetchData()
  // 自動標記為已讀（家長一打開即視為閱讀）
  if (entry.value && !entry.value.my_acknowledged_at) {
    await markRead()
  }
})
</script>

<template>
  <div class="detail">
    <p v-if="loading" class="hint">載入中…</p>
    <div v-else-if="entry" class="card-wrap">
      <div class="card">
        <h2 class="title">{{ entry.log_date }} 聯絡簿</h2>

        <div class="grid">
          <div v-if="entry.mood" class="cell">
            <label>心情</label>
            <span>{{ MOOD_LABEL[entry.mood] || entry.mood }}</span>
          </div>
          <div v-if="entry.meal_lunch != null" class="cell">
            <label>午餐</label>
            <span>{{ entry.meal_lunch }} / 3 份</span>
          </div>
          <div v-if="entry.meal_snack != null" class="cell">
            <label>點心</label>
            <span>{{ entry.meal_snack }} / 3 份</span>
          </div>
          <div v-if="entry.nap_minutes != null" class="cell">
            <label>午睡</label>
            <span>{{ entry.nap_minutes }} 分鐘</span>
          </div>
          <div v-if="entry.bowel" class="cell">
            <label>排便</label>
            <span>{{ BOWEL_LABEL[entry.bowel] || entry.bowel }}</span>
          </div>
          <div v-if="entry.temperature_c != null" class="cell">
            <label>體溫</label>
            <span>{{ entry.temperature_c }}°C</span>
          </div>
        </div>

        <div v-if="entry.teacher_note" class="block">
          <h3>老師留言</h3>
          <p>{{ entry.teacher_note }}</p>
        </div>

        <div v-if="entry.learning_highlight" class="block">
          <h3>學習亮點</h3>
          <p>{{ entry.learning_highlight }}</p>
        </div>

        <div v-if="(entry.photos || []).length" class="photos">
          <a
            v-for="p in entry.photos"
            :key="p.id"
            :href="p.display_url"
            target="_blank"
            rel="noopener"
          >
            <img :src="p.thumb_url || p.display_url" alt="聯絡簿照片" />
          </a>
        </div>
      </div>

      <div class="card">
        <h3>家長回覆</h3>
        <ul v-if="replies.length" class="reply-list">
          <li v-for="r in replies" :key="r.id">
            <p class="body">{{ r.body }}</p>
            <small class="meta">
              {{ new Date(r.created_at).toLocaleString('zh-TW') }}
              <button class="link-btn" @click="removeReply(r.id)">刪除</button>
            </small>
          </li>
        </ul>
        <p v-else class="hint">尚無回覆</p>

        <textarea
          v-model="newReply"
          rows="3"
          placeholder="留個訊息給老師（最多 500 字）"
          maxlength="500"
        />
        <div class="actions">
          <span class="counter">{{ newReply.length }} / 500</span>
          <button class="primary" :disabled="submitting" @click="submitReply">
            送出回覆
          </button>
        </div>
      </div>
    </div>
    <p v-else class="hint">找不到聯絡簿。</p>
  </div>
</template>

<style scoped>
.detail { padding: 12px; }
.hint { color: #999; text-align: center; padding: 24px 0; }
.card {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.title { margin: 0 0 12px; font-size: 17px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.cell { padding: 8px; background: #f7f9fc; border-radius: 6px; }
.cell label { display: block; font-size: 11px; color: #777; margin-bottom: 2px; }
.cell span { font-size: 14px; }
.block { margin-top: 12px; }
.block h3 { font-size: 14px; color: #555; margin: 0 0 4px; }
.block p { margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; }
.photos img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; }
.reply-list { list-style: none; padding: 0; margin: 0 0 12px; }
.reply-list li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
.reply-list .body { margin: 0 0 4px; font-size: 14px; }
.reply-list .meta { font-size: 11px; color: #999; }
.link-btn { background: none; border: none; color: #d33; margin-left: 8px; cursor: pointer; }
textarea {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px;
  font-family: inherit;
  font-size: 14px;
  box-sizing: border-box;
}
.actions { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.counter { color: #999; font-size: 12px; }
.primary {
  background: #4a90e2;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
}
.primary:disabled { background: #aac4e2; }
</style>
