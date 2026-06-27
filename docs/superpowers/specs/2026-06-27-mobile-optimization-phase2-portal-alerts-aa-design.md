# 手機端優化 Phase 2 — Portal 接送提醒鏈可靠性（T1）+ WCAG AA 顏色（T6）

- **日期**：2026-06-27
- **狀態**：設計待審
- **總綱**：`2026-06-26-mobile-optimization-roadmap.md`（破口修復軌；本檔為 Phase 2）
- **前置**：Phase 1（共用基建）已併入 FE main（merge 69549aa6）。
- **互補軌**：RWD 斷點管線軌（已落地 P0）。

---

## 1. 目標與範圍

兩個合併在本 Phase 的主題：

- **T1（安全關鍵）**：教師 Portal 放學接送即時提醒在 iPhone/LINE WebView 上三條鏈（beep / 震動 / 推播）幾乎全失效，老師會漏接門口等候的孩子。本 Phase 以**純前端 in-app 可靠性**修復，並把 WS/beep **提升到 Portal 殼層全局**，讓老師多工（點名→聯絡簿→放學）切頁時仍收得到提醒。
- **T6（無障礙）**：狀態徽章與主 CTA/文字色大面積未過 WCAG AA（1.9–3.1:1），跨家長/Portal/Admin 三端。以 token/全域覆寫收斂。

**非目標（明確排除）**：
- 不動後端、不做 LINE 推播 / Web Push / Service Worker push（user 裁：純前端）。
- 不重設計按鈕系統、不合併 `.pt-card` 重複定義（T7 → Phase 4）。
- 不碰 dark-mode `*-darker` 覆寫（平行工作的軸；本 Phase 只處理 light-mode 對比）。
- `--text-tertiary` 當正文的 sprawl（~10 view）只做高流量處，其餘記 follow-up。

---

## 2. T1 設計：接送提醒鏈可靠性 + 全局 WS

### 2.1 架構：新 composable `usePortalDismissalAlerts`（module-singleton）

現況：`PortalDismissalCallsView.vue` 自己持有 WS + beep + Notification + 生命週期，離頁即拆（`onUnmounted` close WS/audioCtx）。

改為：抽出 **module-singleton composable** `src/composables/usePortalDismissalAlerts.ts`：
- **module-level 共享狀態**（單一 WS，避免 layout 與 page 各建一條）：`activeCalls`、`sortedCalls`、`connectionState`/`wsConnected`/`wsReconnectCount`/`wsExhausted`、`muted`（localStorage `SOUND_PREF_KEY`，保留既有靜音偏好）、`audioUnlocked`、`pendingCount`（= `activeCalls.length`）。
- `initPortalDismissalAlerts()`：**只在 `PortalLayout` 殼層呼叫一次**——建立 WS、掛 document 一次性手勢解鎖、掛 `visibilitychange`、polling fallback。ref-count / init-once 守衛避免重複初始化。
- `usePortalDismissalAlerts()`：回傳共享 refs + `fetchCalls()` + `toggleMute()` + `unlockAudio()`，供 layout（徽章/連線狀態/解鎖提示）與 page（清單）消費。
- `teardownPortalDismissalAlerts()`：在 `PortalLayout` unmount 時釋放（登出/離開 Portal）。

`PortalDismissalCallsView.vue` 改為純消費者：渲染 `sortedCalls`、連線狀態指示、靜音鈕；不再自建 WS/beep。既有 aria-live `liveAnnounce`、排序、ack 操作保留。

### 2.2 AudioContext 手勢解鎖（修 P1：beep 在 iOS 多半永遠不響）
- 現況：`audioCtx` 在 `playBeep()` 內 lazy `new`（PortalDismissalCallsView.vue:66-71），首個 caller 是 WS callback（非手勢）→ iOS/LINE WebView 拒絕播放。
- 改：`initPortalDismissalAlerts` 掛一次性 document `pointerdown`（`{ once: true, capture: true }`）→ `new AudioContext()` + 播一個 0 音量 oscillator 解鎖 + `ctx.resume()`，成功設 `audioUnlocked=true`、移除 listener。`resume()` 的 promise `.catch()` 起來。
- 既有「測試聲音」鈕保留（也走 `unlockAudio()` + 播放，本身是手勢）。
- 解鎖前（`audioUnlocked=false`）在接送頁/殼層顯示常駐輕提示「點一下畫面以啟用接送提醒音」。

### 2.3 visibilitychange 背景補拓（修 P1：iOS 背景凍結 setTimeout）
- 掛 `document.visibilitychange`：`visibilityState === 'visible'` 時 → (a) 立即 `fetchCalls()` 補抓背景期間更新；(b) 若 `ws` 非 `OPEN` 或距上次收訊逾 liveness 門檻 → close + 重連（重設退避）。比照 `usePortalClassHub`/`PortalLayout` 既有 visibility 慣例（若有）。

### 2.4 誠實降級（修 P1/P2：vibrate iOS no-op、Notification 不達）
- `navigator.vibrate`：保留給 Android，加註解標明 iOS 為 no-op、不可當可靠手段。
- `Notification`：`new Notification(...)` 包 try/catch；`initPortalDismissalAlerts` 偵測 `('Notification' in window)` 與 standalone；不支援/未授權時，在接送頁顯示常駐提示「此裝置無法背景推播，請保持 App 開啟並開啟聲音」。
- 主提醒手段在 iOS = **beep（已解鎖）+ 前景視覺（aria-live + 列表高亮）**。

### 2.5 全局 WS（修 P2：離頁拆 WS）
- WS 生命週期改綁 `PortalLayout`（殼層在則 WS 在），不再綁單一 page。`PortalLayout` 的接送徽章 `dismissalPendingCount` 改讀 composable 的 live `pendingCount`（取代 onMounted 抓一次的 `fetchDismissalPendingCount`）。
- 切到其他 Portal 頁 → WS 仍存活、beep 仍響、徽章即時更新。

### 2.6 T1 測試
- `usePortalDismissalAlerts` 單元測試（mock WebSocket / AudioContext / document events）：
  - 手勢解鎖：模擬 document pointerdown → `audioUnlocked=true` + AudioContext 建立。
  - `dismissal_call_created` 事件 → activeCalls 更新 + （未靜音且已解鎖時）呼叫 beep。
  - visibilitychange→visible → 觸發 fetchCalls + 必要時重連。
  - init-once：重複呼叫 `initPortalDismissalAlerts` 只建一條 WS。
- `PortalDismissalCallsView` 既有測試（若有）回歸綠；`PortalLayout` 徽章接 composable 後行為測試。

---

## 3. T6 設計：WCAG AA 顏色（跨三端）

> 達標 token 值（已存在 `src/assets/design-tokens.css`）：`--color-success-darker:#15803d`、`--color-warning-darker:#b45309`、`--color-danger-darker:#b91c1c`、`--color-info-darker:#1d4ed8`；`--m3-primary:#006d3d`（m3-tokens.css）。

| # | 改動 | 檔案（已核實當前 main） | 嚴重度 |
|---|---|---|---|
| B1 ⭐ | **全域 el-tag light-effect AA 覆寫**：`.el-tag--warning/.el-tag--success/.el-tag--danger/.el-tag--info`（預設 light effect）文字色改 `*-darker` token | `src/assets/main.css`（目前無此覆寫）| P1 |
| B2 | parent `.pt-action-btn` 背景 `var(--brand-primary,#0d9053)` → `var(--m3-primary,#006d3d)` | `src/parent/styles/patterns.css:6,18`（hover 也對齊）| P1 |
| B3 | parent `--pt-warning-text`/`--pt-warning-text-mid` `#c99500` → `#8a5d00` | `src/parent/styles/globals.css:112-113` | P1 |
| B4 | admin AuditLog `.diff-before #c0392b`/`.diff-after #27ae60` → `--color-danger-darker`/`--color-success-darker` | `src/views/AuditLogView.vue:679-685` | P2 |
| B5 | parent 連結色 `.att-link` 等 → `--pt-info-text` + `text-decoration:underline` | `LeaveAttachments.vue`/`LeaveListCard.vue`/`RegistrationStatusList.vue` | P2 |
| B6 | 底部導覽對比：parent bottom-tab 未選中色 + active indicator pill（ParentLayout/M3NavigationBar）、portal bottom-tab 未選中 `#94a3b8`→`#64748b` | `PortalLayout.vue:826-838`、`ParentLayout.vue`、`M3NavigationBar.vue` | P2 |
| B7 | portal `--text-tertiary` 當正文 → `--pt-text-muted`（**僅高流量 view**：Announcement/Incident/Assessment，其餘記 follow-up）| 多 portal view | P2/P3 |

- **el-tag 覆寫不可破壞 `effect="dark"` 徽章**（dark effect 已是白字飽和底，AA 達標）——覆寫只針對 light effect 預設文字色。OvertimeView:392 已是 dark 的不受影響。
- 每組配 regression guard 測試（守 token/規則存在、值正確）。

---

## 4. 兩軌 / 平行 session 協調

- 本 Phase 觸及 `PortalLayout.vue`（T1 init composable + 徽章）、`main.css`（B1）、`design-tokens` 消費、parent styles（B2/B3/B5/B6）——這些是多 session 熱點。**隔離 worktree 實作**，最後對 live main `git merge` 讀當前 tip、衝突即停手解。
- `usePortalDismissalAlerts.ts` 為新檔（無衝突）。
- 不碰 RWD 斷點 token / dark-mode `*-darker`（不同軸）。

## 5. 測試策略
- `npm run typecheck` + 全量 `npm run test`（含家長三測試樹 `src/parent`/`tests/unit/parent`/`tests/parent`）+ `npm run build` 全綠。
- composable 單元測試（mock WS/AudioContext/visibilitychange）。
- T6 guard 測試（token 值 + main.css el-tag 覆寫存在）。
- 建議（非阻塞）：DevTools iPhone 模擬手動驗 beep 解鎖 + 切頁仍收提醒 + 徽章對比。

## 6. 交付定義（DoD）
- T1：composable 落地、PortalLayout init 一次、page 改消費者、beep 手勢解鎖 + visibilitychange + 降級提示、全局 WS 跨頁存活；單元測試綠。
- T6：B1–B7 落地、guard 測試綠、`effect="dark"` 不受影響。
- 全量 typecheck/test/build 綠（含家長三樹）。
- 隔離 worktree 實作；commit 分開、Conventional Commits、繁中、`Co-Authored-By` trailer；併 live main（未 push，依慣例由 user 決定 push 時機）。
