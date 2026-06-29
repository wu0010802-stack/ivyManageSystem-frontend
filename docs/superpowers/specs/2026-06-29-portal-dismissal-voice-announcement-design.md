# Portal 接送通知語音播報設計

**日期**：2026-06-29
**範圍**：前端單檔為主（`ivy-frontend/src/composables/usePortalDismissalAlerts.ts`）+ 測試 + 一處 view 整合
**目標**：教師 Portal 收到新接送通知時，除既有 beep 外，**語音唸出**「班級 + 學生名 + time to go home」。

---

## 背景

接送通知的即時提醒鏈集中在教師 Portal 端的 module-singleton composable
`usePortalDismissalAlerts.ts`：WebSocket 收到 `dismissal_call_created` 事件時觸發
`notifyBrowser()` + `playBeep()`（880Hz sine，0.4s）+ `triggerHaptic()` + 更新 `liveAnnounce`
（aria-live 螢幕報讀文字）。音效僅存在於 Portal 端；管理端 `DismissalQueueView.vue` 無音效。

可用資料欄位（`DismissalCallView`）：`student_name?`、`classroom_name?`（皆中文，可能缺）。
無英文名／暱稱欄位。

## 需求（已與業主確認）

1. **播報內容**：班級 + 名 + 英文片語，例「小班 王小明 time to go home」。
2. **與 beep 關係**：先 beep 再唸；beep 仍是不支援語音時的保底地板。
3. **開關**：共用現有靜音鍵 `muted`（靜音 = beep 與語音皆關），不新增獨立開關。

## 關鍵限制（誠實揭露）

Portal 大量運行於 iOS / LINE in-app WebView。Web Speech API（`speechSynthesis`）相容性：

- **桌機 / Android Chrome**：可用，中英文語音皆有。
- **iOS Safari**：可用，但與 AudioContext 同樣需在**首次使用者手勢內解鎖**，否則永不發聲。
- **iOS LINE in-app WebView**：`speechSynthesis` 常**完全不支援或靜默失效**，無法繞過。

→ 因此語音為 best-effort 加值；**beep 用既有 AudioContext（相容性最佳）當保底地板**。
語音失效時老師仍聽得到 beep、看得到畫面提醒。此即「先 beep 再唸」選擇的理由。

---

## 設計

### 1. 新增 `speakAnnouncement(call: DismissalCall)`（module-scoped）

- **Feature-detect**：`typeof window === 'undefined' || !('speechSynthesis' in window)` → 直接 return（無聲降級，beep 已先響）。
- **尊重靜音**：`if (muted.value) return`（與 `playBeep` 同一把鎖）。
- **拆兩段 utterance 排隊唸**（混語單句發音不正確，故分段）：
  - 第一段 `SpeechSynthesisUtterance`，`lang = 'zh-TW'`，文字 = `[classroom_name, student_name].filter(Boolean).join(' ')`
    - 班級缺 → 只唸名字；名字也缺 → 退化為「學生」（與 `liveAnnounce` 既有 fallback 一致）。
  - 第二段 `SpeechSynthesisUtterance`，`lang = 'en-US'`，文字 = `'time to go home'`。
  - 兩段皆 `window.speechSynthesis.speak(u)`，瀏覽器原生佇列依序播放。
- **多筆並發**：多個 `dismissal_call_created` 連續進來時，各自 enqueue，由瀏覽器佇列逐一唸完（不額外 `cancel()`，避免打斷正在唸的名字）。

### 2. 接入提醒鏈

`handleWsEvent` 的 `dismissal_call_created` 分支維持 `notifyBrowser` / `playBeep` / `triggerHaptic` /
`liveAnnounce` 不動，於 `playBeep()` 後排入語音：

- 為落實「先 beep 再唸」，語音以 `setTimeout(() => speakAnnouncement(payload), 350)` 啟動，
  讓 0.4s 的 beep 明確先行（不依賴 TTS 引擎啟動延遲的運氣）。
- `setTimeout` 在 iOS 背景會凍結——但背景情境由 `notifyBrowser` 推播負責，前景才需語音，可接受。

### 3. iOS 解鎖（搭便車現有手勢）

既有 `unlockAudio()` 在首次 `pointerdown`（once + capture）解鎖 AudioContext。
新增 `unlockSpeech()` 並在同一手勢處呼叫：在手勢內 `speak()` 一個 0 音量（`volume = 0`）的空白 utterance，
順帶解鎖 iOS 的 speechSynthesis。包 try/catch；不支援即 no-op。

### 4. 「測試聲音」按鈕加值

`PortalDismissalCallsView.vue` 的 `testSound()` 目前為 `unlockAudio() + playBeep() + triggerHaptic()`。
追加 `unlockSpeech()` 與一句範例語音（如班級「小班」、名「測試」→「小班 測試 time to go home」），
讓老師按一下即可當場確認自身裝置是否支援語音。

匯出：`usePortalDismissalAlerts()` return 增加 `speakAnnouncement`、`unlockSpeech`，供 view 使用與測試。

### 5. 測試（TDD，補於 `usePortalDismissalAlerts.spec.ts`）

mock `window.speechSynthesis`（含 `speak` spy）與 `window.SpeechSynthesisUtterance`：

- 收到 `dismissal_call_created` → 經 350ms（用 fake timers 推進）後 `speak` 被呼叫兩次，
  第一次文字含 `classroom_name + student_name`、`lang='zh-TW'`，第二次文字 `'time to go home'`、`lang='en-US'`。
- `muted` 為真 → `speak` 不被呼叫。
- 班級缺 → 第一段只含名字；名字也缺 → 「學生」。
- `window.speechSynthesis` 不存在 → `speakAnnouncement` 安全 no-op，且 `playBeep` 不受影響。

## 不做（YAGNI）

- 不新增獨立語音開關（共用 `muted`）。
- 不改後端、不加英文名欄位（用中文名唸）。
- 不動管理端 `DismissalQueueView`（本無音效）。
- 不加語速 / 音量 / 語言設定 UI。
- 不加重複播報 / 升級提醒（urgency 既有視覺已涵蓋）。

## 風險與緩解

| 風險 | 緩解 |
|------|------|
| iOS LINE WebView 不支援 TTS | beep 保底地板（既有 AudioContext）；feature-detect no-op |
| iOS 未解鎖致語音靜默 | 搭既有首次手勢解鎖 + 測試聲音按鈕當場驗證 |
| 中文名混英文片語發音怪 | 拆 zh-TW / en-US 兩段 utterance |
| 多筆並發語音塞車 | 依賴瀏覽器原生佇列逐一唸；不額外打斷 |
