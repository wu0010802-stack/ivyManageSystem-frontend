<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface FaqAction {
  type: 'route' | 'contact_teacher' | 'external'
  label: string
  path?: string
  url?: string
}

interface FaqItem {
  answer?: string
  action?: FaqAction
}

const props = defineProps<{
  item: FaqItem
}>()

const router = useRouter()

marked.setOptions({ breaks: true, gfm: true })

const answerHtml = computed<string>(() => {
  const raw = marked.parse(props.item.answer || '')
  return DOMPurify.sanitize(raw as string, { USE_PROFILES: { html: true } })
})

function runAction(): void {
  const a = props.item.action
  if (!a) return
  if (a.type === 'route') router.push(a.path ?? '/')
  else if (a.type === 'contact_teacher') router.push('/messages')
  else if (a.type === 'external' && a.url) window.open(a.url, '_blank', 'noopener')
}
</script>

<template>
  <div class="faq-answer">
    <div class="markdown" v-html="answerHtml"></div>
    <button v-if="item.action" class="cta" @click="runAction">
      {{ item.action.label }}
    </button>
  </div>
</template>

<style scoped>
.faq-answer { display: flex; flex-direction: column; gap: 10px; }
.markdown :deep(p) { margin: 0 0 6px; }
.markdown :deep(p:last-child) { margin-bottom: 0; }
.markdown :deep(strong) { font-weight: 600; }
.markdown :deep(a) { color: #0d9053; text-decoration: underline; }
.markdown :deep(ul), .markdown :deep(ol) { margin: 4px 0; padding-left: 20px; }
.markdown :deep(code) {
  background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-size: 0.9em;
}
.cta {
  align-self: flex-start;
  padding: 6px 14px;
  border: 1.5px solid #0d9053;
  border-radius: 999px;
  background: #fff;
  color: #0d9053;
  font-size: 14px; font-weight: 500;
  cursor: pointer;
}
.cta:active { background: #ecfdf5; }
</style>
