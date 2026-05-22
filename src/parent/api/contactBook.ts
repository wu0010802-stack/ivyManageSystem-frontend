/**
 * 家長端每日聯絡簿 API（v3.1 Phase 1）。
 *
 * 對應後端 api/parent_portal/contact_book.py。
 *
 * 本檔包含 facade：把後端 response 的 my_acknowledged_at / read_at /
 * already_marked 轉成 domain shape（readAt / isRead / alreadyMarked），
 * 讓 Vue 元件只看到統一的「已讀」軌語意，與公告對齊。
 *
 * 設計 spec：docs/superpowers/specs/2026-05-22-ack-terminology-facade-design.md
 */

import api from './index'

export interface ContactBookEntry {
  id: number | string
  log_date?: string
  student_id?: number
  mood?: string
  meal_lunch?: number | null
  meal_snack?: number | null
  nap_minutes?: number | null
  temperature_c?: number | null
  bowel?: string
  learning_highlight?: string
  teacher_note?: string
  photos?: unknown[]
  replies?: unknown[]
  readAt: string | null
  isRead: boolean
  [key: string]: unknown
}

export interface AckResponse {
  readAt: string | null
  alreadyMarked: boolean
}

interface RawEntry {
  my_acknowledged_at?: string | null
  [key: string]: unknown
}

interface RawAckResponse {
  read_at?: string | null
  already_marked?: boolean
  [key: string]: unknown
}

function toEntry(raw: RawEntry | null | undefined): ContactBookEntry | null {
  if (!raw) return null
  const { my_acknowledged_at, ...rest } = raw
  return {
    ...rest,
    readAt: my_acknowledged_at ?? null,
    isRead: !!my_acknowledged_at,
  } as ContactBookEntry
}

function toAckResponse(raw: RawAckResponse): AckResponse {
  return {
    readAt: raw.read_at ?? null,
    alreadyMarked: !!raw.already_marked,
  }
}

export async function getTodayContactBook(studentId: number, config: unknown = {}) {
  const res = await api.get('/parent/contact-book/today', {
    params: { student_id: studentId },
    ...(config as object),
  })
  return {
    ...res,
    data: { ...res.data, entry: toEntry(res.data?.entry) },
  }
}

export async function listContactBook(
  studentId: number,
  { from, to, limit = 30 }: { from?: string; to?: string; limit?: number } = {},
  config: unknown = {},
) {
  const res = await api.get('/parent/contact-book', {
    params: { student_id: studentId, from, to, limit },
    ...(config as object),
  })
  const rawEntries: RawEntry[] = res.data?.entries || []
  return {
    ...res,
    data: { ...res.data, entries: rawEntries.map((e) => toEntry(e)!).filter(Boolean) },
  }
}

export async function getContactBookDetail(entryId: number) {
  const res = await api.get(`/parent/contact-book/${entryId}`)
  return { ...res, data: toEntry(res.data) }
}

export async function ackContactBook(entryId: number) {
  const res = await api.post(`/parent/contact-book/${entryId}/ack`)
  return { ...res, data: toAckResponse(res.data || {}) }
}

export function replyContactBook(entryId: number, body: unknown) {
  return api.post(`/parent/contact-book/${entryId}/reply`, { body })
}

export function deleteContactBookReply(entryId: number, replyId: number) {
  return api.delete(`/parent/contact-book/${entryId}/replies/${replyId}`)
}
