<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { bindAdditional } from '../api/auth'
import { useChildrenStore } from '../stores/children'
import { toast } from '../utils/toast'
import BrandMark from '@/parent/components/brand/BrandMark.vue'

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
    <BrandMark variant="full" :size="100" class="welcome-mark" />
    <div class="card">
      <h2 class="title">加綁第二個小孩</h2>
      <p class="desc">
        請輸入由園所提供的另一張綁定碼。完成後，新的小孩將會出現在您的子女清單中。
      </p>
      <div class="input-group">
        <label for="bind-add-code" class="sr-only">加綁綁定碼</label>
        <input
          id="bind-add-code"
          v-model="code"
          type="text"
          inputmode="latin"
          autocapitalize="characters"
          autocomplete="one-time-code"
          placeholder="例：ABCD1234"
          maxlength="20"
          @keydown.enter="submit"
        />
      </div>
      <button
        class="submit"
        type="button"
        :disabled="submitting"
        @click="submit"
      >
        {{ submitting ? '綁定中...' : '送出' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.bind-add-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--pt-gradient-hero);
}

.welcome-mark {
  margin: var(--space-6, 32px) auto var(--space-5, 24px);
  display: block;}

.card {
  background: var(--pt-surface-card, var(--neutral-0));
  border-radius: var(--radius-xl, 16px);
  padding: 28px 22px;
  width: 100%;
  max-width: 360px;
  box-shadow: var(--pt-elev-2);
  border: var(--pt-hairline);
}

.title {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--brand-primary);
}

.desc {
  color: var(--pt-text-soft);
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 16px;
}

.input-group input {
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  padding: 12px 14px;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
  border: 1px solid var(--pt-border-strong);
  border-radius: var(--radius-md, 8px);
  font-family: ui-monospace, "Menlo", monospace;
  text-transform: uppercase;
}

.input-group input:focus-visible {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-primary-soft);
}

.submit {
  margin-top: 16px;
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  padding: 12px;
  background: var(--brand-primary);
  color: var(--neutral-0);
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 16px;
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: background var(--transition-fast, 0.15s ease);
}

.submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.submit:active:not(:disabled) {
  background: var(--brand-primary-hover);
}
</style>
