import { Bot, MessageSquareText, Settings, SlidersHorizontal, Stethoscope, History } from "lucide-react";
import { useEffect, useState } from "react";
import { ChatPage } from "./routes/ChatPage";
import { ModelsPage } from "./routes/ModelsPage";
import { RunsPage } from "./routes/RunsPage";
import { SettingsPage } from "./routes/SettingsPage";
import { SetupPage } from "./routes/SetupPage";
import { api } from "./lib/api";
import type { CrewForgeSettings } from "./lib/types";

type RouteId = "setup" | "models" | "chat" | "runs" | "settings";

const routes: Array<{ id: RouteId; label: string; icon: typeof Stethoscope }> = [
  { id: "setup", label: "Setup", icon: Stethoscope },
  { id: "models", label: "Models", icon: SlidersHorizontal },
  { id: "chat", label: "Chat", icon: MessageSquareText },
  { id: "runs", label: "Runs", icon: History },
  { id: "settings", label: "Settings", icon: Settings }
];

function currentRoute(): RouteId {
  const hash = window.location.hash.replace("#", "");
  return routes.some((route) => route.id === hash) ? (hash as RouteId) : "setup";
}

function applyTheme(theme: CrewForgeSettings["theme"]) {
  const root = document.documentElement;
  if (theme === "system") {
    root.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    return;
  }
  root.dataset.theme = theme;
}

export function App() {
  const [route, setRoute] = useState<RouteId>(currentRoute);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) window.location.hash = "setup";
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const loadTheme = () => {
      void api.settings().then((data) => applyTheme(data.settings.theme));
    };
    const onSystemTheme = () => loadTheme();
    const onSettingsUpdated = () => loadTheme();

    loadTheme();
    window.addEventListener("crewforge:settings-updated", onSettingsUpdated);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onSystemTheme);
    return () => {
      window.removeEventListener("crewforge:settings-updated", onSettingsUpdated);
      window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", onSystemTheme);
    };
  }, []);

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <a className="brand" href="#setup">
          <Bot size={22} />
          <span>CrewForge</span>
        </a>
        <div className="nav-links">
          {routes.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.id} href={`#${item.id}`} className={route === item.id ? "active" : ""}>
                <Icon size={16} />
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>

      {route === "setup" ? <SetupPage /> : null}
      {route === "models" ? <ModelsPage /> : null}
      {route === "chat" ? <ChatPage /> : null}
      {route === "runs" ? <RunsPage /> : null}
      {route === "settings" ? <SettingsPage /> : null}
    </div>
  );
}
