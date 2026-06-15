// frontend/src/modules/ai-analyst/AiAnalystPage.tsx
import { useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PreviewBanner } from "@/components/modules/PreviewBanner";
import { Card } from "@/components/ui/Card";
import { AiIcon } from "@/components/ui/icons";
import { ask, type Answer } from "./client";
import { SUGGESTED } from "./fixtures";

interface Turn { role: "user" | "assistant"; text: string; sample?: boolean; }

export function AiAnalystPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(prompt: string) {
    if (!prompt.trim() || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: prompt }]);
    setBusy(true);
    const ans: Answer = await ask(prompt);
    setTurns((t) => [...t, { role: "assistant", text: ans.text, sample: ans.sample }]);
    setBusy(false);
  }

  return (
    <AppLayout title="AI Analyst / Copiloto" crumb="Ciudadanía">
      <PreviewBanner note="Respuestas de muestra · Conecta Claude API para análisis en vivo." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Copiloto" className="lg:col-span-2">
          <div className="flex h-[420px] flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto">
              {turns.length === 0 && (
                <div className="grid h-full place-items-center text-center text-sm text-ink-faint">
                  <div><AiIcon width={28} height={28} className="mx-auto mb-2 text-accent" />Pregúntale al copiloto sobre tus datos.</div>
                </div>
              )}
              {turns.map((t, i) => (
                <div key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${t.role === "user" ? "ml-auto bg-accent/15 text-ink" : "bg-bg-sunken text-ink-muted"}`}>
                  {t.text}
                  {t.sample && <span className="ml-2 pill border-state-warning/30 bg-state-warning/10 text-state-warning">muestra</span>}
                </div>
              ))}
              {busy && <div className="text-sm text-ink-faint">Pensando…</div>}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribe una pregunta…" className="flex-1 rounded-lg border border-line bg-bg-sunken px-3 py-2 text-sm text-ink placeholder:text-ink-faint" />
              <button type="submit" disabled={busy} className="pill border-accent/30 bg-accent/10 text-accent disabled:opacity-40">Enviar</button>
            </form>
          </div>
        </Card>

        <Card title="Preguntas sugeridas">
          <div className="space-y-2">
            {SUGGESTED.map((q) => (
              <button key={q} onClick={() => send(q)} className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-left text-sm text-ink-muted hover:text-ink">
                {q}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
