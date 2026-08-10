# 家長端首頁重整與孤兒端點接線（2026-08-10）

## 背景

家長端已是打磨過 12 輪 spec 級改造的成熟產品（30 個 view、72 個元件、90 天 320 個 commit），
自動化 AI-slop 偵測掃 104 個 `.vue` 只回報 5 個 warning、0 個 error。因此本輪不是補基礎，
而是收斂兩件事：**首頁資訊優先序與產品定義相反**，以及**後端做完但前端沒接的能力**。

依據：workspace 根目錄 `PRODUCT.md` / `DESIGN.md`（家長端電子聯絡簿設計權威）。

## 問題

### P0-1 首頁優先序與 PRODUCT.md 相反

`PRODUCT.md` 定義家長「主要想知道孩子今天過得好嗎，次要才是繳費、請假」，成功標準是
「3 秒內看到孩子當日狀態」；`DESIGN.md` 把 `ContactBookDayCard` 定位為**首頁 hero**。

重整前 `TodayView.vue` 的實際順序是：

```
待簽橫幅 → 日期 → 姓名/出席 hero → 推播 CTA → 行政 Bento → 今日聯絡簿（第 6 個區塊）
```

手機首屏大機率被前五區塊佔滿，「孩子今天過得好嗎」被行政事項擠到捲軸下方。
這是 2026-06-24 Bento redesign 與後來確立的「聯絡簿主軸」DESIGN.md 之間沒有收斂。

### P0-2 事務頁是零資訊的目錄

`AdminListView.vue` 是 6 個純文字項目，沒有任何狀態徽章。家長不點進去就不知道
有幾筆待繳、假單過了沒、待簽幾份（Nielsen #6 recognition rather than recall 失分）。

矛盾點：這些數字 `GET /parent/home/summary` **早就全部回傳**，只是前端沒接。

## 決策

### 1. 今日卡三態合一，升為首頁 hero

聯絡簿不是每天都有（假日、請假、老師還沒填）。若「有 entry 才顯示卡、沒有就換另一個
hero」，首頁視覺會在不同日子之間跳動。因此改由 `variant` 驅動同一張卡的三個狀態：

| variant | 觸發 | 內容 |
|---|---|---|
| `full` | 上學日、老師已填 | 心情徽章 + 姓名 + 班級 + **出席狀態** + 4 個量化 chip + 老師留言 + 照片 + 可點進詳情 |
| `awaiting` | 上學日、尚無 entry | 同骨架，KawaiiStar motif 佔 MoodBadge 位置，「老師正在記錄今天的點滴」 |
| `offday` | 假日 / 請假 / 尚未到校 | 同骨架，「今天放假，好好休息」或請假專屬文案 |

`hero-motif` 固定 64×64 對齊 `MoodBadge` lg，三態 hero 高度不跳動。
`awaiting` / `offday` 的漸層收斂成近乎純 cream，讓「有聯絡簿的日子」在視覺上明顯更飽滿。

新的區塊順序：

```
待簽橫幅 → 日期 + 多寶切換 → 今日卡（hero）→ 推播 CTA → 行政 Bento
  → 今日動態 → 孩子總覽（多寶）→ 行事曆入口
```

- `DashboardHero` 在首頁退場；「尚未綁定子女」改走 `EmptyState`（語意本來就不是「今日卡」）。
- `ChildrenStrip` **保留但下移**。原方案要移除它（與 `ChildContextHeader` 切換職責重複），
  但它另外承載生日提示、在籍狀態與「進孩子檔案」入口，移掉會少功能。改為下移到今日動態
  之後，不與 hero 搶同一個視覺區。

### 2. 事務頁與 tab 徽章走既有 summary

新增 `useHomeSummary` composable，快取鍵刻意與 `TodayView` 相同
（`useCachedAsync` 對同 key 共用 cache 並 dedupe in-flight，首頁與事務頁同時掛載只有一次請求）。

| 事務頁項目 | 徽章來源 | 狀態 |
|---|---|---|
| 請假 | `recent_leave_reviews` | 後端既有 |
| 繳費 | `fees.outstanding_count` | 後端既有 |
| 用藥委託 | `active_medication_orders` | **本輪新增** |
| 課後才藝 | `pending_activity_promotions` | 後端既有 |
| 待簽紀錄 | `pending_event_acks` | 後端既有 |

徽章語意分色，避免「今天有藥要吃」被讀成「有事沒處理」：

- `action`（品牌綠）：需要家長處理或該知道結果
- `alert`（coral）：有逾期款項
- `info`（sky）：純資訊（今日用藥單）

數字為 0 不渲染徽章。每個徽章帶 `aria-label` 說明語意，不讓螢幕閱讀器只念到裸數字。

底部 tab 徽章：`事務` = 待繳 + 待簽 + 才藝候補 + 假單審核結果（**不含**用藥，否則紅點天天亮著
而失去意義）；`訊息` = 未讀公告 + 未讀訊息。

**順帶消除的冗餘**：`ParentLayout` 原本每次換頁都打 `announcements/unread-count` 與
`messages/unread-count` 兩支，但 summary 早就同時回傳這兩個數字。改走共用 composable 後
每次換頁少 2 個請求；節流由 `useCachedAsync` 的 60s TTL 負責，`utils/unreadThrottle`
因此成為孤兒並移除（連同其測試）。

### 3. 後端：`active_medication_orders`

`StudentMedicationOrder` **沒有 status 欄位**，模型註解明訂「一張 order 僅限當日」，
因此「生效中」的唯一判準是 `order_date == today`。

刻意**不**改用 `StudentMedicationLog` 去算「還沒餵的時段數」：那是老師的待辦，家長看了
只會焦慮又無從行動，與 `PRODUCT.md` 的「安心」定位相反。

## 三處與原始評估不同的更正

### 更正 1：`family/timeline` 不是「家庭合併時間軸」，且不該接

`api/parent_portal/family.py` 的 `/timeline` 是**單一子女**的跨來源合併（`student_id` 必填），
不是跨子女合併。它是為一個不存在的「家校樞紐頁」設計的，而其功能已被兩處覆蓋：

- 首頁「今日動態」（`useTodayTimeline`）：今天的狀態與待辦，依早上/中午/下午/晚一些分桶
- 孩子檔案「成長時間軸」（`/parent/timeline`，9 種來源）：跨來源歷史，支援 since/until/types

接上去只會製造重複資訊。**改為**在首頁「今日動態」補一個「更多動態」出口直達孩子檔案
時間軸（原本要「事務 → 孩子檔案 → 往下滑」三層才找得到）。

### 更正 2：事務頁徽章幾乎不用動後端

`home/summary` 已回傳 6 類計數，前端只用了 2 類。原以為要「一次補齊五類」，
實際只需補用藥一項。

### 更正 3：里程碑首頁 inline 曝光延後

原方案要把含 👍🥰🎉 按讚的里程碑放上首頁動態。但首頁冷啟動已經要打 4 支 API
（summary / today-status / contact-book / bus），再加一支與「3 秒內看到當日狀態」的
目標衝突。要不傷效能得先讓 `home/summary` 帶最近一筆里程碑，屬後端範圍。

本輪先完成 acknowledge 入口與三態改善，曝光靠首頁「更多動態」出口達成。

## 實作範圍

**後端**（`feat/parent-medication-badge-count-2026-08-10`）

- `api/parent_portal/home.py`：`_count_active_medication_orders` + summary 欄位 + docstring 補齊
- `tests/test_parent_home_summary.py`：+3 個斷言、+1 個測試（跨子女彙總、非今日不計入）

**前端**（`feat/parent-home-revamp-2026-08-10`）

- `components/contact-book/ContactBookDayCard.vue`：三態改造（`entry` 轉可選 + 5 個新 prop）
- `views/TodayView.vue`：區塊重排、`DashboardHero` 退場、`EmptyState` 接手未綁定態、
  `ChildrenStrip` 下移、今日動態補「更多動態」出口
- `composables/useHomeSummary.ts`：新增（badges / adminTabBadge / messagesTabBadge）
- `views/AdminListView.vue`：六項徽章 + 分色 + aria-label
- `layouts/ParentLayout.vue`：tab 徽章改走 summary，移除兩支冗餘 unread 請求
- `utils/unreadThrottle.ts` + 其測試：移除（成為孤兒）
- `api/calendar.ts` + `views/CalendarView.vue`：整月視圖與範圍切換（aria-pressed）
- `router.ts`：`/calendar` 標題「本週行程」→「行事曆」
- `views/ChildMeasurementsView.vue`：歷次量測明細（含頭圍與視力，曲線畫不出的兩項）
- `components/MilestoneCard.vue`：「我看到了」acknowledge、已確認灰勾、日期中文化
- `components/MilestoneReactionBar.vue`：補 `type="button"`、中文 `aria-label`、`aria-pressed`
- `components/MilestoneCarousel.vue`：acknowledge 串接、loading/empty 改用 SkeletonBlock + EmptyState
- 兩處過時 TODO 註解更新（`childMilestones.ts` / `childMeasurements.ts`）

## 驗證

- 後端：`tests/test_parent_home_summary.py` 15 passed；家長端全測試 exit 0
- 前端：新增 5 個測試檔共 32 個測試；家長端 58 檔 396 passed
- `vue-tsc --noEmit` 乾淨
- **突變測試**：移除 `todayVariant` 的 offday 判斷後，正好 2 個 offday 測試轉紅、其餘 4 個維持綠，
  證明測試能抓到實作錯誤而非假綠

## 未做

- `family/timeline` 接線（見更正 1）
- 里程碑首頁 inline 曝光（見更正 3）
- 才藝單筆繳費明細、單日出席明細（本輪未勾選）
- P5 token 收斂：`globals.css` 仍寫著「M3 重寫進行中，等 P4 view 全部改完，P5 才在此清理」，
  三套 token（`design-tokens.css` / `--pt-*` 77 個 alias / `--m3-*`）並存。同一個「表面」
  在不同頁可能是 `#ffffff`、`#f7fbf3`、`#fffce8` 三種顏色，是 `PRODUCT.md` 列為 anti-reference
  的「M3 預設皮」滲進視覺層的來源。**建議獨立一輪處理**。
- `tab: 'me'` 的四個頁面（我的 / 隱私權利 / 通知偏好 / 加綁子女）底部 tab 不高亮，
  使用者失去定位（Nielsen #1）。底部 3 tab 與右上角 drawer 是兩套並行導航，
  需要一次導航結構決策，不宜夾在本輪。
