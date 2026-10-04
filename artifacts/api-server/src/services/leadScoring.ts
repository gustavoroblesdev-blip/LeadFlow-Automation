export type LeadPriority = "HOT" | "WARM" | "COLD";

export interface ScorableLead {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string | null;
  service: string;
  budget: string;
  message: string;
  urgent?: boolean;
}

function isHighBudget(value: string): boolean {
  const normalized = value.toLowerCase().replaceAll(",", "").replaceAll(".", "");
  const numberMatch = normalized.match(/\d+/);
  const number = numberMatch ? Number(numberMatch[0]) : 0;
  const mentionsThousands =
    normalized.includes("k") ||
    normalized.includes("mil") ||
    normalized.includes("000");

  return (
    normalized.includes("alto") ||
    normalized.includes("high") ||
    normalized.includes("premium") ||
    number >= 10000 ||
    (number >= 10 && mentionsThousands)
  );
}

function isPriorityService(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    "automat",
    "crm",
    "captación",
    "captacion",
    "integration",
    "integración",
    "integracion",
    "funnel",
    "pipeline",
  ].some((keyword) => normalized.includes(keyword));
}

export function scoreLead(input: ScorableLead): {
  score: number;
  priority: LeadPriority;
} {
  let score = 0;

  if (isHighBudget(input.budget)) score += 30;
  if (isPriorityService(input.service)) score += 20;
  if (input.company?.trim()) score += 20;

  const complete =
    input.firstName.trim() &&
    input.lastName.trim() &&
    input.email.trim() &&
    input.phone.trim() &&
    input.service.trim() &&
    input.budget.trim() &&
    input.message.trim();
  if (complete) score += 10;

  if (input.urgent) score += 20;

  const priority: LeadPriority =
    score >= 80 ? "HOT" : score >= 50 ? "WARM" : "COLD";

  return { score: Math.min(score, 100), priority };
}