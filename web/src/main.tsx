import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { createHostBridge } from "./bridge/host";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App bridge={createHostBridge()} /></React.StrictMode>);
