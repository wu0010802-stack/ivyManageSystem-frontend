// Ambient module declarations for third-party libraries that lack their own
// .d.ts or @types/* package. Populated in L3 (api) / L6 (components) as
// individual libraries surface unknown imports.
//
// Example (do not enable until needed):
//
//   declare module "@line/liff/foo-subpackage" {
//     export function someThing(): void;
//   }

// L7c: Vue Router RouteMeta augmentation — covers all meta fields used across
// admin / parent / public routers and App.vue guards.
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** Admin: route requires no authentication */
    noAuth?: boolean
    /** Admin: route belongs to portal section */
    portal?: boolean
    /** Portal: route requires authentication */
    requiresAuth?: boolean
    /** Shared: user must change password before proceeding */
    mustChangePassword?: boolean
    /** Admin: bare print/export route, no layout */
    bare?: boolean
    /** Parent: public route (no auth required) */
    public?: boolean
    /** Parent: active tab identifier */
    tab?: string
    /** Parent: show back button */
    showBack?: boolean
    /** Parent: hide bottom tab bar */
    hideTabBar?: boolean
  }
}

export {};
