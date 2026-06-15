// frontend/src/modules/ai-analyst/client.ts
import { CANNED } from "./fixtures";

export interface Answer { text: string; sample: boolean; }

/**
 * Preview implementation: returns canned answers. To go live, replace the body
 * with: const { data } = await apiClient.post("/ai/ask", { prompt }); return
 * { text: data.answer, sample: false };
 */
export async function ask(prompt: string): Promise<Answer> {
  const match = CANNED.find((c) => c.q === prompt);
  const text = match?.a ??
    "Respuesta de muestra: conecta un proveedor de modelo (Claude API) para análisis en vivo sobre tus datos reales.";
  return new Promise((resolve) => setTimeout(() => resolve({ text, sample: true }), 350));
}
