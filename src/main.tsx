import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./App.css";
import "./styles/index.css";
import { ThemeProvider } from "@/theme/ThemeContext";
import { AppBusProvider } from "@/context/AppBus";
// QA registry is now handled internally

// QA registry is now initialized automatically in qa.ts

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <HashRouter>
      <AppBusProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AppBusProvider>
    </HashRouter>
  </React.StrictMode>
);
