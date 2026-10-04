import { eq } from "drizzle-orm";
import { automationLogsTable, db, leadsTable } from "@workspace/db";
import {
  changeLeadStage,
  createLeadWithWorkflow,
  writeAutomationLog,
} from "./automationService";
import { createAppointmentForLead, completeAppointmentById } from "./appointmentService";
import type { ScorableLead } from "./leadScoring";

export const sampleLead: ScorableLead & {
  preferredContactDate?: string | null;
} = {
  firstName: "Daniela",
  lastName: "Santos",
  email: "daniela.santos@example.com",
  phone: "+52 55 1234 5678",
  company: "Norte Studio",
  service: "Automatización de procesos",
  budget: "$10,000+",
  preferredContactDate: null,
  message:
    "Buscamos automatizar la captación y el seguimiento de prospectos para nuestro equipo comercial.",
  urgent: true,
};

export interface DemoStepRecord {
  id: string;
  label: string;
  event: string;
  action: string;
  result: "SUCCESS" | "PENDING" | "FAILED";
  at: string;
}

function stepLabel(action: string): string {
  const labels: Record<string, string> = {
    receiveLead: "Lead recibido",
    createContact: "Contacto creado",
    classifyLead: "Lead clasificado automáticamente",
    addTag: "Etiqueta nuevo-lead agregada",
    createOpportunity: "Oportunidad creada",
    sendWelcomeMessage: "Mensaje de bienvenida enviado",
    scheduleFollowup: "Seguimiento programado",
    updateStage: "Etapa del pipeline actualizada",
    createAppointment: "Cita simulada",
    confirmAppointment: "Cita confirmada",
    completeAppointment: "Cita completada",
    requestReview: "Seguimiento posterior registrado",
  };
  return labels[action] ?? action;
}

async function logsForLead(leadId: string) {
  const logs = await db
    .select()
    .from(automationLogsTable)
    .where(eq(automationLogsTable.leadId, leadId));
  return logs.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function toSteps(
  logs: Awaited<ReturnType<typeof logsForLead>>,
): DemoStepRecord[] {
  return logs.map((log) => ({
    id: log.id,
    label: stepLabel(log.action),
    event: log.event,
    action: log.action,
    result: log.result as DemoStepRecord["result"],
    at: log.at.toISOString(),
  }));
}

export async function simulateNewLead(input?: ScorableLead & {
  preferredContactDate?: string | Date | null;
}) {
  const lead = await createLeadWithWorkflow(input ?? sampleLead);
  const logs = await logsForLead(lead.id);
  return {
    lead,
    steps: toSteps(logs),
    scenario: "new-lead",
  };
}

export async function runCompleteDemo(input?: ScorableLead & {
  preferredContactDate?: string | Date | null;
}) {
  const lead = await createLeadWithWorkflow(input ?? sampleLead);
  await changeLeadStage(lead.id, "Calificado");

  const [persistedLead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, lead.id))
    .limit(1);
  await writeAutomationLog({
    leadId: lead.id,
    leadName: `${lead.firstName} ${lead.lastName}`,
    event: "LeadQualified",
    action: "scheduleFollowup",
    result: "SUCCESS",
    message: "Seguimiento posterior a la calificación programado.",
  });

  const appointment = await createAppointmentForLead(
    lead.id,
    new Date(Date.now() + 24 * 60 * 60 * 1000),
    "Llamada de descubrimiento",
  );
  if (appointment) {
    await completeAppointmentById(appointment.id);
  }

  const allSteps = toSteps(await logsForLead(lead.id));
  const requiredActions = [
    "receiveLead",
    "createContact",
    "classifyLead",
    "createOpportunity",
    "updateStage",
    "scheduleFollowup",
    "createAppointment",
    "confirmAppointment",
    "completeAppointment",
    "requestReview",
  ];
  const steps: DemoStepRecord[] = [];
  for (const action of requiredActions) {
    const candidate = allSteps.find(
      (step) =>
        step.action === action &&
        (action !== "updateStage" || step.event === "LeadQualified") &&
        (action !== "scheduleFollowup" || step.event === "LeadCreated"),
    );
    if (candidate) steps.push(candidate);
  }

  const [finalLead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, lead.id))
    .limit(1);

  return {
    lead: finalLead ?? persistedLead,
    steps,
    scenario: "complete-lead-to-post-appointment",
  };
}