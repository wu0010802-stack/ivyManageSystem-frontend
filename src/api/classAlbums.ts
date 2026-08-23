import api from './index'
import type { components } from './_generated/schema'
import type { AxiosResp } from './_generated/typed'

// ----- 班級相簿（教師端） -----
// 型別一律來自 OpenAPI codegen（後端 api/portal/class_albums.py 已標 response_model）。
// 本檔曾手刻 interface 描形，其中 thumb_url / original_filename 漏標 null，實際後端
// 兩者都可能是 null——手描形跟不上後端是遲早的事，故改為型別由契約長出來。
// 下方 export 的別名只是把 codegen 的 schema 名字換成呼叫端慣用的名字，保持既有
// import 不必改；欄位形狀完全由後端決定。
type Schemas = components['schemas']

export type AlbumSummary = Schemas['AlbumSummaryOut']
export type AlbumClassroomOption = Schemas['ClassroomOptionOut']
export type AlbumTaggedStudent = Schemas['TaggedStudentOut']
export type AlbumPhoto = Schemas['AlbumPhotoOut']
export type AlbumDetail = Schemas['AlbumDetailOut']
export type PhotoUploadResultItem = Schemas['PhotoUploadItemOut']
export type PhotoUploadResponse = Schemas['PhotoUploadResponseOut']

export const listAlbums = (): AxiosResp<'/portal/class-albums', 'get'> =>
  api.get('/portal/class-albums')

export const getAlbumClassrooms = (): AxiosResp<'/portal/class-albums/my-classrooms', 'get'> =>
  api.get('/portal/class-albums/my-classrooms')

export const createAlbum = (
  data: { classroom_id: number; title: string; event_date: string; description?: string },
): AxiosResp<'/portal/class-albums', 'post'> => api.post('/portal/class-albums', data)

export const getAlbum = (albumId: number): AxiosResp<'/portal/class-albums/{album_id}', 'get'> =>
  api.get(`/portal/class-albums/${albumId}`)

export const updateAlbum = (
  albumId: number,
  data: { title?: string; description?: string; event_date?: string },
): AxiosResp<'/portal/class-albums/{album_id}', 'patch'> =>
  api.patch(`/portal/class-albums/${albumId}`, data)

export const deleteAlbum = (albumId: number) => api.delete(`/portal/class-albums/${albumId}`)

export const uploadAlbumPhotos = (
  albumId: number,
  formData: FormData,
): AxiosResp<'/portal/class-albums/{album_id}/photos', 'post'> =>
  api.post(`/portal/class-albums/${albumId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const deleteAlbumPhoto = (albumId: number, attachmentId: number) =>
  api.delete(`/portal/class-albums/${albumId}/photos/${attachmentId}`)

export const setPhotoTags = (
  albumId: number,
  items: Array<{ attachment_id: number; student_ids: number[] }>,
): AxiosResp<'/portal/class-albums/{album_id}/photos/tags', 'put'> =>
  api.put(`/portal/class-albums/${albumId}/photos/tags`, { items })

export const publishAlbum = (
  albumId: number,
): AxiosResp<'/portal/class-albums/{album_id}/publish', 'post'> =>
  api.post(`/portal/class-albums/${albumId}/publish`)
