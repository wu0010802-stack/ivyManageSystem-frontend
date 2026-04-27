<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { bindAdditional } from '../api/auth'
import { useChildrenStore } from '../stores/children'
import { toast } from '../utils/toast'

const router = useRouter()
const childrenStore = useChildrenStore()

const code = ref('')
const submitting = ref(false)

const trimmed = computed(() => code.value.trim().toUpperCase())

async function submit() {
  if (!trimmed.value) {
    toast.warn('請輸入綁定碼')
    return
  }
  submitting.value = true
  try {
    await bindAdditional(trimmed.value)
    toast.success('已加綁，正在重新整理子女清單')
    childrenStore.invalidate()
    await childrenStore.load(true)
    router.replace('/home')
  } catch (err) {
    toast.error(err?.displayMessage || '綁定碼無效或已被使用')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="bind-add-view">
    <div class="card">
      <h2 class="title">加綁第二個小孩</h2>
      <p class="desc">
        請輸入由園所提供的另一張綁定碼。完成後，新的小孩將會出現在您的子女清單中。
      </p>
      <div class="input-group">
        <input
          v-model="code"
          type="text"
          inputmode="latin"
          autocapitalize="characters"
          placeholder="例：ABCD1234"
          maxlength="20"
          @keydown.enter="submit"
        />
      </div>
      <button class="submit" :disabled="submitting" @click="submit">
        {{ submitting ? '綁定中...' : '送出' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.bind-add-view {
  padding: 8px 0;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.title {
  margin: 0 0 8px;
  font-size: 18px;
  color: #3f7d48;
}

.desc {
  color: #666;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 16px;
}

.input-group input {
  width: 100%;
  padding: 12px 14px;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  font-family: ui-monospace, "Menlo", monospace;
  text-transform: uppercase;
}

.submit {
  margin-top: 16px;
  width: 100%;
  padding: 12px;
  background: #3f7d48;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
}

.submit:disabled { opacity: 0.6; }
</style>
