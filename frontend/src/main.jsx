import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/manrope";

import App from "./App.jsx";
import DesktopTitleBar from "./components/DesktopTitleBar.jsx";
import { isDesktopRuntime } from "./services/runtime.js";
import "./styles.css";

if (isDesktopRuntime()) {
  document.documentElement.classList.add("desktop-runtime");
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <DesktopTitleBar />
    <div className="app-viewport">
      <App />
    </div>
  </StrictMode>,
);

