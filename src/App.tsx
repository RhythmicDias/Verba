import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Popup from "./components/Popup";
import Settings from "./components/Settings";

function App() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(getCurrentWindow().label);
  }, []);

  if (label === "popup") {
    return <Popup />;
  }

  if (label === "main") {
    return <Settings />;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
      <div className="animate-pulse">Loading app layout...</div>
    </div>
  );
}

export default App;
