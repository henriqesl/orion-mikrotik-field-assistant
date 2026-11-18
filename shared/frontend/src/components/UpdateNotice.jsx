import { useEffect, useState } from "react";

import { isDesktopRuntime } from "../services/runtime.js";

function UpdateNotice() {
  const [update, setUpdate] = useState(null);
  const [state, setState] = useState("idle");
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!isDesktopRuntime()) return undefined;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const availableUpdate = await check({ timeout: 8_000 });
        if (!cancelled && availableUpdate) setUpdate(availableUpdate);
      } catch {
        // A atualização não deve interromper o trabalho de campo.
      }
    }, 2_500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  async function installUpdate() {
    if (!update || state === "installing") return;
    setState("installing");

    let downloaded = 0;
    let total = null;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? null;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setProgress(total ? Math.min(100, Math.round((downloaded / total) * 100)) : null);
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setState("error");
    }
  }

  if (!update) return null;

  return (
    <aside className="update-notice" role="status">
      <div>
        <strong>ORION Field {update.version} disponível</strong>
        <span>A atualização oficial foi encontrada e será validada antes da instalação.</span>
      </div>
      <button className="secondary-button" disabled={state === "installing"} onClick={installUpdate} type="button">
        {state === "installing"
          ? progress === null ? "Baixando…" : `Baixando ${progress}%`
          : state === "error" ? "Tentar novamente" : "Atualizar agora"}
      </button>
    </aside>
  );
}

export default UpdateNotice;
