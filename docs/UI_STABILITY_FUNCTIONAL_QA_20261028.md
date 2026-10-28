# RealTalent CRM — UI Stability & Functional QA, 2026-10-28

Base: release/rc1-h1-persistence-safety (the Vercel production-linked code). Changes are isolated in fix/ui-stability-functional-qa-20261028.

## Implemented
- Modal/drawer focus and Escape ownership use one shared stack; portal layer ordering is consistent below native selection menus and toasts.
- Mobile Settings stays available in More even with all other secondary areas hidden. Escape closes More.
- Ctrl/Cmd+K and Ctrl/Cmd+J do not interfere with open overlays.
- Task board supports native HTML5 dragging to another status through existing permission and persistence service. Keyboard status selector retained.
- Final scoped CSS improves mobile clipping, overlay geometry, focus states and small form/control fonts.
- Vitest overlay-manager regression tests and npm run qa:ui-stability (static contracts).

## Outstanding browser acceptance — NOT claimed complete
Run npm ci, npm run typecheck, npm test, npm run build, npm run qa:ui-stability. In an authenticated disposable workspace, test all 17 routes at 1440x900, 1280x720, 768x1024, 390x844, and 320x640 in Firefox and Chromium, light/dark. Record screenshots, console errors, failed requests and visible clipping; test 200% zoom. Exercise nested modal -> drawer -> Escape (one close only), focus trap, mobile Settings-only More menu, and Ctrl+K/J overlays. Test task drag/drop and keyboard state changes, refresh persistence, read-only permissions. Test create/edit/delete/reload for Contacts, Pipeline, Tasks, Proposals; WhatsApp media, groups, QR/cloud, duplicate events; Garimpo strict location and cancellation. No database migrations or production changes within this PR.
