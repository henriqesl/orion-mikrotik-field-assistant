import { getCurrentWindow } from "@tauri-apps/api/window";

import orionMark from "../assets/orion-mark.svg";
import { isDesktopRuntime } from "../services/runtime.js";

function WindowIcon({ children }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      {children}
    </svg>
  );
}

export default function DesktopTitleBar() {
  if (!isDesktopRuntime()) return null;

  const appWindow = getCurrentWindow();

  return (
    <header className="desktop-titlebar" data-tauri-drag-region>
      <div className="desktop-titlebar__brand" data-tauri-drag-region>
        <img alt="" aria-hidden="true" src={orionMark} />
        <span data-tauri-drag-region>ORION Field</span>
      </div>

      <div className="desktop-titlebar__controls">
        <button aria-label="Minimizar" onClick={() => appWindow.minimize()} type="button">
          <WindowIcon><path d="M3 8.5h10" /></WindowIcon>
        </button>
        <button aria-label="Maximizar ou restaurar" onClick={() => appWindow.toggleMaximize()} type="button">
          <WindowIcon><rect height="9" rx="1" width="9" x="3.5" y="3.5" /></WindowIcon>
        </button>
        <button
          aria-label="Fechar"
          className="desktop-titlebar__close"
          onClick={() => appWindow.close()}
          type="button"
        >
          <WindowIcon><path d="m4 4 8 8m0-8-8 8" /></WindowIcon>
        </button>
      </div>
    </header>
  );
}
