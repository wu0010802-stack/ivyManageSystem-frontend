# 教師端 Portal 大 polish — Phase 3 設計（簡化版，2026-05-06）

## 背景

`PortalContactBookView.vue` 是教師端最大 view（890 行），承載聯絡簿全功能：班級/日期篩選、學生網格、編輯抽屜（8 欄位 + 照片）、範本套用、批次發布。後端 `api/portal/contact_book.py` 列表端點對每個 entry 觸發一次 photos query，30 student = 30 query。

## 範圍

### 後端必做

**`api/portal/contact_book.py` photos N+1 修補**：
- 既有：`for s in roster: photos = _load_photos(session, entry.id) if entry else []` 每 entry 一次 query
- 改：列表前一次 `Attachment.owner_id.in_(entry_ids)` + dict[entry_id, list] lookup
- 預期：30 student → 30+1 query → ~3 query
- pytest 補 query count assertion test

**409 衝突 response payload 擴充**：
- 既有：`updateEntry` 衝突回 409 + 簡單 detail message
- 改：409 + body 含 `{"detail": "...", "current_entry": {完整 entry dict}, "current_photos": [...]}`，前端可直接局部 refetch
- **status code 保留 409**（不改 412，避免 breaking change）
- pytest 補衝突 payload schema test

### 前端必做

**PortalContactBookView 拆解（890 → ~280 行）**：

子元件統一放 `src/views/portal/components/contactBook/`：

| 元件 | 預估行數 | 職責 |
|---|---|---|
| `ContactBookFilterBar.vue` | ~80 | 班級 / 日期 / 「重新整理」按鈕 / 「套用範本」按鈕 |
| `ContactBookEntryCard.vue` | ~120 | 單筆學生卡片（姓名 / mood / 進度 badge / 點擊開 drawer） |
| `ContactBookEntryDrawer.vue` | ~250 | 編輯抽屜（8 欄位 + 照片區 + 草稿/發布動作） |
| `ContactBookBatchDialog.vue` | ~80 | 範本套用 dialog（既有約 24 行 template，加 logic 後） |
| `ContactBookPhotoGrid.vue` | ~70 | 照片 grid 顯示（套 LazyImage）+ 上傳/刪除 |

主檔 `PortalContactBookView.vue` 預估 ~280 行（純 orchestration + state hoisted）。

**樂觀更新 + 衝突局部 refetch**：

`fetchClassDay()` 在 8 處被呼叫（save / publish / batch / template / photo upload / photo delete / copy yesterday / 衝突），改為：

| 動作 | 既有：fetchClassDay() | 改後 |
|---|---|---|
| save / publish 成功 | 重撈整份 | 樂觀：本地 `items[i].entry = newEntry` |
| save 衝突 (409) | 重撈整份 | 局部：用 409 payload 的 `current_entry` 寫回該 student，提示用戶 |
| 上傳照片成功 | 重撈整份 | 樂觀：`items[i].entry.photos.push(newPhoto)` |
| 刪除照片成功 | 重撈整份 | 樂觀：`items[i].entry.photos = filter(id != deleted)` |
| 範本套用成功 | 重撈整份 | 重撈整份（範本影響範圍大，保留全撈） |
| 批次發布成功 | 重撈整份 | 重撈整份（保留全撈） |
| copy yesterday | 重撈整份 | 重撈整份（保留全撈） |
| 切換班級 / 日期 | 重撈整份 | 重撈整份（換 view 必須） |

預期 API round-trip 減少約 60%（單筆編輯從 2 次 fetch 降為 1 次寫入）。

**LazyImage 套照片 grid**：使用 Phase 1 移到 `src/components/common/LazyImage.vue` 的元件，照片格 `<img>` 改 `<LazyImage src=... />`。

**vitest 覆蓋**：

| 測試檔 | 重點 |
|---|---|
| `tests/unit/views/portal/contactBook/ContactBookFilterBar.test.js` | 班級切換 / 日期切換 emit 事件 |
| `tests/unit/views/portal/contactBook/ContactBookEntryCard.test.js` | 進度 badge / mood 顯示 / 點擊 emit |
| `tests/unit/views/portal/contactBook/ContactBookEntryDrawer.test.js` | 8 欄位綁定 / 草稿/發布 action / 樂觀更新事件 |
| `tests/unit/views/portal/contactBook/ContactBookBatchDialog.test.js` | 範本選擇 / 確認 emit |
| `tests/unit/views/portal/contactBook/ContactBookPhotoGrid.test.js` | LazyImage 渲染 / 上傳/刪除 emit |

預期新增 ~20-30 條 vitest。`PortalContactBookView` 主檔本身不深測（重點在子元件與後端 contract test）。

### YAGNI 砍掉（spec 原寫但不做）

- ❌ status code 409 → 412 變更（breaking change 不值得；payload 擴充已足）
- ❌ 虛擬列表（聯絡簿 UI 是 card grid 不是 table，30-50 student grid 沒實測卡頓再說）
- ❌ 412 衝突 schema 全面規範化（保留 409 + 新 payload 即可）

---

## Branch / PR 策略

| 階段 | Branch | Repo |
|---|---|---|
| 後端 | `feat/teacher-acd-v1-3-contact-book-be` from origin/main | ivy-backend |
| 前端 | `feat/teacher-acd-v1-3-contact-book` from `feat/teacher-acd-v1-2-home-dashboard` | ivy-frontend（共用 worktree） |

**Merge 順序**：phase 2 後端 merge → phase 2 前端 merge → phase 3 後端 → phase 3 前端 (rebase main)。每個 phase 嚴格序列。

---

## 驗收標準

### 後端

- [ ] `_load_photos` 不再在迴圈內呼叫；`/contact-book?classroom_id=...&log_date=...` 用 `selectinload` 或 dict batch
- [ ] 30 student query count test ≤ 6（baseline 約 35-40）
- [ ] 409 衝突 response 含 `current_entry` 與 `current_photos`
- [ ] pytest 既有全綠 + 新 ~5 條（query count + payload）

### 前端

- [ ] PortalContactBookView 主檔 < 320 行（目標 280）
- [ ] 5 個子元件全部建立、emit 事件清楚
- [ ] save / publish / 照片上下傳改為樂觀更新（不再 `fetchClassDay()` 整撈）
- [ ] 409 衝突走「用 payload 局部寫回」流程
- [ ] LazyImage 套用於照片 grid
- [ ] 既有 850 vitest 全綠 + 新 ~25 條
- [ ] dev mode 手動驗收（編輯一筆、上傳照片、衝突情境）

---

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| 樂觀更新 race（多次點 save 短時間內） | drawer save 期間 disable button；`isSaving` ref 鎖 |
| 衝突 payload 反序列化失敗 | 後端 schema 用既有 `_entry_to_dict` + `_load_photos` 一致格式；前端 mock test 衝突情境驗證 |
| 5 子元件拆解破壞既有 8 欄位資料流 | 每個子元件 unit test 必過；主檔保留原 state 結構，只是 props down + emit up |
| Phase 3 stack 在 Phase 2 上、main 漂移 | phase 2 merge 前不開 phase 3 PR；phase 2 merge 後 phase 3 rebase main |

---

## 預估工作量

- 後端：~3-4 小時（N+1 修補 + payload schema + pytest）
- 前端：~10-12 小時（5 子元件拆解 + 樂觀更新邏輯 + vitest 25 條）
- 總計：~1.5-2 天
