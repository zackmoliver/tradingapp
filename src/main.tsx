import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom"; // Import HashRouter
import App from "./App";
import "./App.css";

// This finds the div with id="root" and mounts the App to it
const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <HashRouter> {/* Wrap App with HashRouter */}
      <App />
    </HashRouter>
  </React.StrictMode>
);