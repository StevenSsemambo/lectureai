import React from "react";
import ReactDOM from "react-dom/client";
import SEMAIApp, { SUPABASE_URL, SUPABASE_ANON_KEY } from "./App.jsx";
import { ErrorBoundary, installErrorLogging, APP_VERSION } from "./errorLogging.jsx";
import { installTelemetry } from "./telemetry.js";

// Logging and telemetry are extras: if either fails to start, the app must still open.
try { installErrorLogging({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY }); } catch (e) { /* carry on */ }
try { installTelemetry({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY, version: APP_VERSION }); } catch (e) { /* carry on */ }

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SEMAIApp />
    </ErrorBoundary>
  </React.StrictMode>
);
