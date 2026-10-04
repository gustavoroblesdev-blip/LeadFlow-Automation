import type { LeadRecord } from "@workspace/db";

const GHL_API_BASE_URL =
  process.env.GHL_API_BASE_URL ?? "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export type GhlMode = "demo" | "live";

export interface GhlStatus {
  provider: string;
  mode: GhlMode;
  configured: boolean;
  message: string;
}

function credentialsConfigured(): boolean {
  return Boolean(process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID);
}

export function getGhlMode(): GhlMode {
  return credentialsConfigured() ? "live" : "demo";
}

export function getGhlStatus(): GhlStatus {
  const configured = credentialsConfigured();
  return {
    provider: "GoHighLevel",
    mode: configured ? "live" : "demo",
    configured,
    message: configured
      ? "Credenciales detectadas; las acciones usan la subcuenta configurada."
      : "Las acciones se simulan hasta configurar GHL_API_KEY y GHL_LOCATION_ID.",
  };
}

export function getGhlStageId(stage: string): string | undefined {
  const stageIds: Record<string, string | undefined> = {
    Nuevo: process.env.GHL_PIPELINE_STAGE_ID,
    Contactado: process.env.GHL_CONTACTED_STAGE_ID,
    Calificado: process.env.GHL_QUALIFIED_STAGE_ID,
    "Cita programada": process.env.GHL_APPOINTMENT_STAGE_ID,
    Propuesta: process.env.GHL_PROPOSAL_STAGE_ID,
    Ganado: process.env.GHL_WON_STAGE_ID,
    Perdido: process.env.GHL_LOST_STAGE_ID,
  };
  return stageIds[stage];
}

async function ghlRequest(
  path: string,
  method: "POST" | "PUT",
  body: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) {
    throw new Error("GoHighLevel credentials are not configured.");
  }

  const response = await fetch(new URL(path, GHL_API_BASE_URL), {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Version: GHL_API_VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`GoHighLevel returned HTTP ${response.status}.`);
  }

  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("GoHighLevel returned an unreadable response.");
  }
}

function responseId(data: unknown, nestedKey?: string): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  if (nestedKey) {
    const nested = record[nestedKey];
    if (typeof nested === "object" && nested !== null) {
      const nestedId = (nested as Record<string, unknown>).id;
      if (typeof nestedId === "string") return nestedId;
    }
  }
  return undefined;
}

export async function createContact(lead: LeadRecord): Promise<string> {
  if (!credentialsConfigured()) return `demo-contact-${lead.id}`;

  const response = await ghlRequest("/contacts/", "POST", {
    firstName: lead.firstName,
    lastName: lead.lastName,
    name: `${lead.firstName} ${lead.lastName}`,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.company ?? undefined,
    locationId: process.env.GHL_LOCATION_ID,
    tags: ["nuevo-lead"],
  });
  const id = responseId(response, "contact");
  if (!id) throw new Error("GoHighLevel did not return a contact ID.");
  return id;
}

export async function updateContact(
  contactId: string,
  lead: LeadRecord,
): Promise<void> {
  if (!credentialsConfigured() || contactId.startsWith("demo-contact-")) return;

  await ghlRequest(`/contacts/${encodeURIComponent(contactId)}`, "PUT", {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.company ?? undefined,
    locationId: process.env.GHL_LOCATION_ID,
  });
}

export async function addTag(
  contactId: string,
  tag: string,
): Promise<void> {
  if (!credentialsConfigured() || contactId.startsWith("demo-contact-")) return;

  await ghlRequest(
    `/contacts/${encodeURIComponent(contactId)}/tags`,
    "POST",
    { tags: [tag] },
  );
}

export async function createOpportunity(
  contactId: string,
  lead: LeadRecord,
): Promise<string> {
  if (!credentialsConfigured()) return `demo-opportunity-${lead.id}`;

  const pipelineId = process.env.GHL_PIPELINE_ID;
  const pipelineStageId = process.env.GHL_PIPELINE_STAGE_ID;
  if (!pipelineId || !pipelineStageId) {
    throw new Error(
      "Set GHL_PIPELINE_ID and GHL_PIPELINE_STAGE_ID before enabling live opportunities.",
    );
  }

  const response = await ghlRequest("/opportunities/", "POST", {
    locationId: process.env.GHL_LOCATION_ID,
    contactId,
    pipelineId,
    pipelineStageId,
    name: `${lead.firstName} ${lead.lastName} — ${lead.service}`,
    status: "open",
  });
  const id = responseId(response, "opportunity");
  if (!id) throw new Error("GoHighLevel did not return an opportunity ID.");
  return id;
}

export async function updateOpportunity(
  opportunityId: string,
  pipelineStageId: string,
): Promise<void> {
  if (!credentialsConfigured() || opportunityId.startsWith("demo-opportunity-"))
    return;

  await ghlRequest(`/opportunities/${encodeURIComponent(opportunityId)}`, "PUT", {
    pipelineStageId,
    locationId: process.env.GHL_LOCATION_ID,
  });
}

export async function createAppointment(
  contactId: string,
  startsAt: Date,
  title: string,
): Promise<string> {
  if (!credentialsConfigured()) {
    return `demo-appointment-${startsAt.getTime()}`;
  }

  const calendarId = process.env.GHL_CALENDAR_ID;
  if (!calendarId) {
    throw new Error(
      "Set GHL_CALENDAR_ID before enabling live appointment creation.",
    );
  }

  const endAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  const response = await ghlRequest("/calendars/events/appointments", "POST", {
    calendarId,
    locationId: process.env.GHL_LOCATION_ID,
    contactId,
    startTime: startsAt.toISOString(),
    endTime: endAt.toISOString(),
    title,
    appointmentStatus: "confirmed",
    toNotify: false,
  });
  const id = responseId(response, "appointment");
  if (!id) throw new Error("GoHighLevel did not return an appointment ID.");
  return id;
}

export async function sendMessage(
  contactId: string,
  message: string,
): Promise<void> {
  if (!credentialsConfigured() || contactId.startsWith("demo-contact-")) return;

  await ghlRequest("/conversations/messages/outbound", "POST", {
    type: "SMS",
    contactId,
    message,
  });
}