import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { createHostBridge } from "./bridge/host";
import { createMockBridge } from "./dev/mock";
import "./index.css";

const bridge = new URLSearchParams(window.location.search).has("mock") ? createMockBridge() : createHostBridge();
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App bridge={bridge} /></React.StrictMode>);
