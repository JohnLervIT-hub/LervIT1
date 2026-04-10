import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { Capacitor } from "@capacitor/core";

if (typeof window !== 'undefined') {
  (window as any).React = React;
  (window as any).ReactDOM = ReactDOM;
}

async function setupNative() {
  if (!Capacitor.isNativePlatform()) return;

  const { SplashScreen } = await import("@capacitor/splash-screen");
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  const { App: CapApp } = await import("@capacitor/app");
  const { Keyboard } = await import("@capacitor/keyboard");

  await StatusBar.setOverlaysWebView({ overlay: true });
  await StatusBar.setStyle({ style: Style.Dark });
  await StatusBar.setBackgroundColor({ color: "transparent" });

  Keyboard.addListener("keyboardWillShow", () => {
    document.body.classList.add("keyboard-open");
  });
  Keyboard.addListener("keyboardWillHide", () => {
    document.body.classList.remove("keyboard-open");
  });

  CapApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      CapApp.exitApp();
    }
  });

  await SplashScreen.hide({ fadeOutDuration: 300 });
}

function renderApp() {
  const root = document.getElementById("root");
  if (root) {
    ReactDOM.createRoot(root).render(<App />);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    renderApp();
    await setupNative();
  });
} else {
  renderApp();
  setupNative();
}
