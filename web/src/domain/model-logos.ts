const logoBase = "https://cavoti.com/model-logos";

const familyTones: Record<string, string> = {
  GPT: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Claude: "border-amber-200 bg-amber-50 text-amber-800",
  Seedance: "border-cyan-200 bg-cyan-50 text-cyan-800",
  Kimi: "border-sky-200 bg-sky-50 text-sky-800",
  MiniMax: "border-rose-200 bg-rose-50 text-rose-800",
  GLM: "border-blue-200 bg-blue-50 text-blue-800",
  Gemini: "border-indigo-200 bg-indigo-50 text-indigo-800",
  Qwen: "border-violet-200 bg-violet-50 text-violet-800",
  DeepSeek: "border-slate-200 bg-slate-50 text-slate-800",
  Grok: "border-neutral-300 bg-neutral-100 text-neutral-900",
  Mimo: "border-rose-200 bg-rose-50 text-rose-800",
};

const familyColors: Record<string, string> = {
  GPT: "#2f6b3f",
  Claude: "#956412",
  Seedance: "#1596a8",
  Kimi: "#2f79b7",
  MiniMax: "#c43f68",
  GLM: "#3859ff",
  Gemini: "#596fcf",
  Qwen: "#7654aa",
  DeepSeek: "#536b7f",
  Grok: "#171717",
  Mimo: "#c05b76",
};

const modelColors = [
  "#8f4a22",
  "#2f6b3f",
  "#956412",
  "#7b628e",
  "#536b7f",
  "#1596a8",
  "#3859ff",
  "#c43f68",
  "#7654aa",
  "#536b3f",
];

export function modelLogoUrl(model: string, platform: string): string | null {
  const value = `${platform} ${model}`.toLowerCase();
  if (value.includes("seedance")) return `${logoBase}/seedance.png`;
  if (value.includes("mimo")) return `${logoBase}/xiaomi-mimo.svg`;
  if (value.includes("codex")) return `${logoBase}/codex.png`;
  if (value.includes("minimax")) return "https://cdn.simpleicons.org/minimax";
  if (value.includes("kimi") || value.includes("moonshot"))
    return "https://cdn.simpleicons.org/kimi";
  if (value.includes("qwen")) return "https://cdn.simpleicons.org/qwen";
  if (value.includes("deepseek")) return "https://cdn.simpleicons.org/deepseek";
  if (value.includes("grok") || value.includes("xai"))
    return "https://cdn.simpleicons.org/x";
  if (value.includes("glm") || value.includes("chatglm"))
    return "/model-logos/glm.svg";
  if (model.toLowerCase().includes("claude"))
    return "/model-logos/anthropic.svg";
  if (model.toLowerCase().startsWith("gpt")) return "/model-logos/openai.svg";
  return null;
}

export function platformLabel(platform: string): string {
  const value = platform.toLowerCase();
  if (value === "openai") return "GPT";
  if (value === "anthropic") return "Claude";
  if (value === "zhipu") return "GLM";
  return platform || "Model";
}

export function modelBrand(model: string, platform: string): string {
  return modelFamily(model, platform);
}

export function modelFamily(model: string, platform: string): string {
  const value = model.toLowerCase();
  if (value.includes("seedance") || value.includes("doubao")) return "Seedance";
  if (value.includes("kimi") || value.includes("moonshot")) return "Kimi";
  if (value.includes("minimax")) return "MiniMax";
  if (value.startsWith("gpt") || value.includes("codex")) return "GPT";
  if (value.includes("claude")) return "Claude";
  if (value.includes("glm")) return "GLM";
  if (value.includes("gemini")) return "Gemini";
  if (value.includes("qwen")) return "Qwen";
  if (value.includes("deepseek")) return "DeepSeek";
  if (value.includes("grok") || value.includes("xai")) return "Grok";
  if (value.includes("mimo")) return "Mimo";
  return platformLabel(platform);
}

export function modelFamilyTone(family: string): string {
  return familyTones[family] ?? "border-(--line) bg-(--canvas) text-(--ink)";
}

export function modelFamilyColor(family: string): string {
  return familyColors[family] ?? "#8f4a22";
}

export function modelColor(model: string): string {
  let hash = 0;
  for (const character of model)
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return modelColors[Math.abs(hash) % modelColors.length];
}

export function groupTone(groupId: number): string {
  const tones = [
    "border-emerald-200 bg-emerald-50 text-emerald-800",
    "border-cyan-200 bg-cyan-50 text-cyan-800",
    "border-amber-200 bg-amber-50 text-amber-800",
    "border-violet-200 bg-violet-50 text-violet-800",
  ];
  return tones[Math.abs(groupId) % tones.length];
}

export function multiplierTone(value: number | null | undefined): string {
  if (typeof value !== "number") return "text-(--ink-muted)";
  if (value < 1) return "text-(--good)";
  if (value === 1) return "text-(--ink)";
  if (value <= 1.5) return "text-(--warning)";
  return "text-(--bad)";
}
