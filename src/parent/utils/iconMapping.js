/**
 * ParentIcon name → Material Symbols Rounded name mapping.
 *
 * P4.1: ParentIcon refactor 為 M3Icon wrapper 時用。
 * 未對應的 name 會原樣傳給 M3Icon。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §7.1
 */
const ICON_MAP = {
  home: 'home',
  attendance: 'fact_check',
  messages: 'chat_bubble',
  chat: 'chat_bubble',
  announcements: 'campaign',
  megaphone: 'campaign',
  more: 'more_horiz',
  calendar: 'calendar_month',
  clipboard: 'assignment',
  notebook: 'menu_book',
  pill: 'medication',
  medication: 'medication',
  money: 'payments',
  fees: 'payments',
  bell: 'notifications',
  notification: 'notifications',
  envelope: 'mail',
  document: 'description',
  attachment: 'attach_file',
  paperclip: 'attach_file',
  camera: 'photo_camera',
  location: 'location_on',
  pin: 'location_on',
  signature: 'draw',
  art: 'palette',
  palette: 'palette',
  pickup: 'child_care',
  children: 'child_care',
  check: 'check',
  'check-circle': 'check_circle',
  close: 'close',
  x: 'close',
  plus: 'add',
  minus: 'remove',
  back: 'arrow_back',
  'arrow-left': 'arrow_back',
  'arrow-right': 'chevron_right',
  'chevron-right': 'chevron_right',
  warn: 'warning',
  warning: 'warning',
  alert: 'warning',
  info: 'info',
  refresh: 'refresh',
  logout: 'logout',
  family: 'school',
  me: 'person',
  profile: 'person',
  person: 'person',
  contact: 'contacts',
  leave: 'event_busy',
}

const SIZE_MAP = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
}

export function mapIconName(name) {
  return ICON_MAP[name] ?? name
}

export function mapIconSize(size) {
  return SIZE_MAP[size] ?? 22
}
