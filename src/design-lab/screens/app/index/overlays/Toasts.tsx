/**
 * «Индекс» · toasts. The app's own ToastProvider keeps rendering them (same queue, timing, undo
 * actions, aria-live); this only restyles its markup through the data-ui hooks, scoped to the Index
 * screen so the real app never sees it: black plate with the dock's hairline + float shadow, a 6px
 * grey pixel, Golos, the action as underlined text with the ↳ hook (lime underline on hover).
 * Sits bottom-left of the content column, above the dock line, clear of the pomodoro card.
 */
const HOOK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3.5 1.5V9.5H12' stroke='black' stroke-width='1.1'/%3E%3Cpath d='M9.2 6.7L12 9.5L9.2 12.3' stroke='black' stroke-width='1.1'/%3E%3C/svg%3E\")";

const S = 'html[data-screen^="app/index"]';

const css = `
${S} [data-ui="toasts"] {
  left: 244px !important; right: auto !important; bottom: 96px !important; transform: none !important;
  width: auto !important; max-width: 400px !important; padding: 0 !important; gap: 8px !important;
  font-family: "Golos Text", system-ui, sans-serif;
}
${S} [data-ui="toast"] {
  border: 0 !important; border-radius: 0 !important; background: #000 !important; color: #fff;
  box-shadow: inset 0 0 0 1px #262626, 0 5px 5px rgba(0,0,0,.05), 0 20px 10px rgba(0,0,0,.04), 0 46px 14px rgba(0,0,0,.03), 0 82px 16px rgba(0,0,0,.01), 0 24px 48px -12px rgba(0,0,0,.8) !important;
  padding: 14px 18px 14px 16px !important; gap: 14px !important; justify-content: flex-start !important; min-height: 52px;
}
${S} [data-ui="toast"]::before { content: ""; flex: none; width: 6px; height: 6px; background: #7F7F7F; }
${S} [data-ui="toast-text"] {
  flex: 1 1 auto; min-width: 0; font-size: 14px !important; line-height: 1.35 !important; letter-spacing: -0.035em; color: #fff;
}
${S} [data-ui="toast-action"] {
  display: inline-flex !important; align-items: center; gap: 6px !important; height: auto !important; padding: 0 0 0 6px !important;
  border-radius: 0 !important; background: transparent !important; color: #fff !important;
  font-size: 14px !important; font-weight: 500 !important; letter-spacing: -0.02em;
  text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; text-decoration-color: rgba(255,255,255,.35);
  transition: text-decoration-color .2s cubic-bezier(0,0,.2,1);
}
${S} [data-ui="toast-action"]::before {
  content: ""; width: 14px; height: 14px; flex: none; background: currentColor;
  -webkit-mask: ${HOOK} center / 14px no-repeat; mask: ${HOOK} center / 14px no-repeat;
}
${S} [data-ui="toast-action"]:hover { text-decoration-color: #ADFB0C !important; background: transparent !important; }
${S} [data-ui="toast-action"]:focus-visible { outline: 1px solid #ADFB0C; outline-offset: 4px; box-shadow: none !important; }
`;

export function ToastStyle() {
  return <style data-ix="toasts">{css}</style>;
}
