const DESKTOP_API_BASE = "http://127.0.0.1:8765";

export function isDesktopRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export function apiUrl(path) {
  return `${isDesktopRuntime() ? DESKTOP_API_BASE : ""}${path}`;
}
