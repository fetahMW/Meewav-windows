import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installHostBridge } from './host-bridge';

const detachBridge = installHostBridge();
if (import.meta.hot) import.meta.hot.dispose(detachBridge);

createRoot(document.getElementById("root")!).render(<App />);
