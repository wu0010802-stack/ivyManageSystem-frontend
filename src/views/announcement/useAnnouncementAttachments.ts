import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadUserFile } from 'element-plus'
import { apiError } from '@/utils/error'
import { deleteAnnouncementAttachment, uploadAnnouncementAttachment } from '@/api/announcements'

export type AttachmentItem = {
  id: number
  filename: string
  mime_type: string
  size_bytes: number
  url: string
  thumb_url: string | null
}

type PendingAttachment = { file: File; uid: number }

export const ATTACHMENT_MAX = 5
export const ATTACHMENT_MAX_MB = 10
const ATTACHMENT_MAX_BYTES = ATTACHMENT_MAX_MB * 1024 * 1024

/**
 * 公告附件的編輯狀態與送出結算。
 *
 * 狀態分三份：已存在的（existing）、待上傳的（pending）、待刪除的（toDelete）。
 * 送出時 syncAttachments 逐筆結算：成功的從待處理清單移除，失敗的留著讓使用者重試，
 * 並回傳失敗訊息；呼叫端據此決定是否保持對話框開啟（公告本體此時已存檔）。
 */
export function useAnnouncementAttachments() {
  const pendingAttachments = ref<PendingAttachment[]>([])
  const existingAttachments = ref<AttachmentItem[]>([])
  const attachmentsToDelete = ref<number[]>([])
  // el-upload 的顯示清單與 pendingAttachments 同步（auto-upload=false 時 before-upload 不會觸發，
  // 大小檢查與「移除」都必須在 on-change／on-remove 處理，否則畫面移除了檔案、送出時仍會上傳）。
  const attachmentFileList = ref<UploadUserFile[]>([])

  const attachmentSlotsLeft = computed(() => ATTACHMENT_MAX - existingAttachments.value.length)
  /** 有尚未送出的附件變更（供未儲存保護判斷） */
  const hasAttachmentChanges = computed(
    () => pendingAttachments.value.length > 0 || attachmentsToDelete.value.length > 0,
  )

  const resetAttachments = (existing: AttachmentItem[] = []) => {
    pendingAttachments.value = []
    attachmentFileList.value = []
    attachmentsToDelete.value = []
    existingAttachments.value = existing
  }

  const handleAttachmentChange = (uploadFile: { uid: number; raw?: File; name?: string }) => {
    if (!uploadFile.raw) return
    if (uploadFile.raw.size > ATTACHMENT_MAX_BYTES) {
      ElMessage.warning(`單檔上限 ${ATTACHMENT_MAX_MB}MB（${uploadFile.raw.name || uploadFile.name || ''} 超過）`)
      attachmentFileList.value = attachmentFileList.value.filter(f => f.uid !== uploadFile.uid)
      return
    }
    pendingAttachments.value.push({ file: uploadFile.raw, uid: uploadFile.uid })
  }

  const handleAttachmentRemove = (uploadFile: { uid: number }) => {
    pendingAttachments.value = pendingAttachments.value.filter(p => p.uid !== uploadFile.uid)
  }

  const handleAttachmentExceed = () => {
    ElMessage.warning(`附件上限 ${ATTACHMENT_MAX} 個`)
  }

  const handleAttachmentBefore = (file: File) => {
    if (file.size > ATTACHMENT_MAX_BYTES) {
      ElMessage.warning(`單檔上限 ${ATTACHMENT_MAX_MB}MB（${file.name} 超過）`)
      return false
    }
    return true
  }

  const markAttachmentForDelete = (attId: number) => {
    existingAttachments.value = existingAttachments.value.filter(a => a.id !== attId)
    attachmentsToDelete.value.push(attId)
  }

  /** 結算待刪除＋待上傳；回傳失敗訊息清單（空陣列＝全部成功）。 */
  const syncAttachments = async (annId: number): Promise<string[]> => {
    const failures: string[] = []
    if (attachmentsToDelete.value.length > 0) {
      const targets = [...attachmentsToDelete.value]
      const results = await Promise.allSettled(
        targets.map(attId => deleteAnnouncementAttachment(annId, attId)),
      )
      attachmentsToDelete.value = targets.filter((_, i) => results[i].status === 'rejected')
      results.forEach((r) => {
        if (r.status === 'rejected') failures.push(apiError(r.reason, '移除附件失敗'))
      })
    }
    if (pendingAttachments.value.length > 0) {
      const targets = [...pendingAttachments.value]
      const results = await Promise.allSettled(
        targets.map(p => uploadAnnouncementAttachment(annId, p.file)),
      )
      const uploadedUids = new Set<number>()
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          uploadedUids.add(targets[i].uid)
          const att = r.value?.data as AttachmentItem | undefined
          if (att && typeof att.id === 'number') existingAttachments.value.push(att)
        } else {
          failures.push(`${targets[i].file.name}：${apiError(r.reason, '上傳失敗')}`)
        }
      })
      pendingAttachments.value = pendingAttachments.value.filter(p => !uploadedUids.has(p.uid))
      attachmentFileList.value = attachmentFileList.value.filter(f => f.uid === undefined || !uploadedUids.has(f.uid))
    }
    return failures
  }

  return {
    existingAttachments,
    attachmentFileList,
    attachmentSlotsLeft,
    hasAttachmentChanges,
    resetAttachments,
    handleAttachmentChange,
    handleAttachmentRemove,
    handleAttachmentExceed,
    handleAttachmentBefore,
    markAttachmentForDelete,
    syncAttachments,
  }
}
