import { nextTick, onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import { useBodyLock } from '@/composables/useBodyLock'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useAccessibleDialog({
  open,
  dialogRef,
  close,
  initialFocus,
}: {
  open: () => boolean
  dialogRef: Ref<HTMLElement | null>
  close: () => void
  initialFocus?: () => HTMLElement | null
}) {
  const previouslyFocused = shallowRef<HTMLElement | null>(null)
  const { lock, unlock } = useBodyLock()

  function focusableElements() {
    if (!dialogRef.value) return []
    return Array.from(
      dialogRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
  }

  function trapFocus(event: KeyboardEvent) {
    const elements = focusableElements()
    if (elements.length === 0) {
      event.preventDefault()
      dialogRef.value?.focus()
      return
    }
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function onDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'Tab') trapFocus(event)
  }

  watch(
    open,
    async (isOpen) => {
      if (isOpen) {
        previouslyFocused.value = document.activeElement as HTMLElement | null
        lock()
        await nextTick()
        const target = initialFocus?.() || focusableElements()[0] || dialogRef.value
        target?.focus()
      } else {
        unlock()
        previouslyFocused.value?.focus()
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(unlock)

  return { onDialogKeydown }
}
