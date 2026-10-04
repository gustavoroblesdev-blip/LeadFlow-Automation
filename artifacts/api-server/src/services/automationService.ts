import { desc, eq } from "drizzle-orm";
import {
  automationLogsTable,
  db,
  leadsTable,
  type LeadRecord,
} from "@workspace/db";
import {
  addTag,
  createContact,
  createOpportunity,
  getGhlMode,
  getGhlStageId,
  updateOpportunity,
  sendMessage,
} from "./ghlService";
import { scoreLead, type ScorableLead } from "./leadScoring";

export type LogResult = "SUCCESS" | "PENDING" | "FAILED";

export async function writeAutomationLog(input: {
  leadId?: string | null;
  leadName?: string | null;
  event: string;
  action: string;
  result: LogResult;
  message: string;
}): Promise<void> {
  await db.insert(automationLogsTable).values({
    leadId: input.leadId ?? null,
    leadName: input.leadName ?? null,
    event: input.event,
    action: input.action,
    result: input.result,
    message: input.message,
  });

  if (input.leadId) {
    await db
      .update(leadsTable)
      .set({ lastActivity: new Date() })
      .where(eq(leadsTable.id, input.leadId));
  }
}

export async function performAction<T>(
  lead: LeadRecord,
  event: string,
  action: string,
  work: () => Promise<T>,
): Promise<{ result: LogResult; value?: T }> {
  let result: LogResult = "SUCCESS";
  let message = `${action} completed successfully.`;
  let value: T | undefined;

  try {
    value = await work();
  } catch (error) {
    result = "FAILED";
    message =
      error instanceof Error
        ? error.message
        : "The automation action could not be completed.";
  }

  await writeAutomationLog({
    leadId: lead.id,
    leadName: `${lead.firstName} ${lead.lastName}`,
    event,
    action,
    result,
    message,
  });
  return { result, value };
}

function asScorableLead(lead: LeadRecord): ScorableLead {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    service: lead.service,
    budget: lead.budget,
    message: lead.message,
    urgent: lead.urgent,
  };
}

export async function createLeadWithWorkflow(
  input: ScorableLead & {
    preferredContactDate?: string | Date | null;
  },
): Promise<LeadRecord> {
  const classification = scoreLead(input);
  const preferredContactDate =
    input.preferredContactDate instanceof Date
      ? input.preferredContactDate.toISOString().slice(0, 10)
      : input.preferredContactDate ?? null;
  const [lead] = await db
    .insert(leadsTable)
    .values({
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      company: input.company?.trim() || null,
      service: input.service.trim(),
      budget: input.budget.trim(),
      preferredContactDate,
      message: input.message.trim(),
      urgent: input.urgent ?? false,
      score: classification.score,
      priority: classification.priority,
      stage: "Nuevo",
    })
    .returning();

  const name = `${lead.firstName} ${lead.lastName}`;
  const event = "LeadCreated";

  await writeAutomationLog({
    leadId: lead.id,
    leadName: name,
    event,
    action: "receiveLead",
    result: "SUCCESS",
    message: "Lead recibido desde el formulario.",
  });

  const contactResult = await performAction(lead, event, "createContact", () =>
    createContact(lead),
  );
  const contactId =
    contactResult.result === "SUCCESS" ? contactResult.value : undefined;

  await performAction(lead, "LeadQualified", "classifyLead", async () => {
    await db
      .update(leadsTable)
      .set({
        score: classification.score,
        priority: classification.priority,
      })
      .where(eq(leadsTable.id, lead.id));
    return classification;
  });

  if (contactId) {
    await performAction(lead, event, "addTag", () =>
      addTag(contactId, "nuevo-lead"),
    );
  } else {
    await writeAutomationLog({
      leadId: lead.id,
      leadName: name,
      event,
      action: "addTag",
      result: "FAILED",
      message: "Tag skipped because contact creation failed.",
    });
  }

  if (contactId) {
    const opportunityResult = await performAction(
      lead,
      event,
      "createOpportunity",
      () => createOpportunity(contactId, lead),
    );
    if (opportunityResult.value) {
      await db
        .update(leadsTable)
        .set({ ghlContactId: contactId, ghlOpportunityId: opportunityResult.value })
        .where(eq(leadsTable.id, lead.id));
    } else {
      await db
        .update(leadsTable)
        .set({ ghlContactId: contactId })
        .where(eq(leadsTable.id, lead.id));
    }

    await performAction(lead, event, "sendWelcomeMessage", () =>
      sendMessage(
        contactId,
        `Hola ${lead.firstName}, recibimos tu solicitud sobre ${lead.service}. Nuestro equipo se pondrá en contacto contigo.`,
      ),
    );
  } else {
    await writeAutomationLog({
      leadId: lead.id,
      leadName: name,
      event,
      action: "createOpportunity",
      result: "FAILED",
      message: "Opportunity skipped because contact creation failed.",
    });
    await writeAutomationLog({
      leadId: lead.id,
      leadName: name,
      event,
      action: "sendWelcomeMessage",
      result: "FAILED",
      message: "Welcome message skipped because contact creation failed.",
    });
  }

  const followUpResult: LogResult = getGhlMode() === "demo" ? "SUCCESS" : "PENDING";
  await writeAutomationLog({
    leadId: lead.id,
    leadName: name,
    event,
    action: "scheduleFollowup",
    result: followUpResult,
    message:
      followUpResult === "SUCCESS"
        ? "Seguimiento demo programado para el siguiente día hábil."
        : "Seguimiento registrado; conecta un scheduler de tareas para automatizar su ejecución.",
  });

  const [updated] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, lead.id))
    .limit(1);
  return updated;
}

export async function changeLeadStage(
  leadId: string,
  stage: string,
): Promise<LeadRecord | undefined> {
  const [lead] = await db
    .update(leadsTable)
    .set({ stage })
    .where(eq(leadsTable.id, leadId))
    .returning();
  if (!lead) return undefined;

  await writeAutomationLog({
    leadId,
    leadName: `${lead.firstName} ${lead.lastName}`,
    event: stage === "Calificado" ? "LeadQualified" : "LeadStageChanged",
    action: "updateStage",
    result: "SUCCESS",
    message: `Etapa actualizada a ${stage}.`,
  });
  if (lead.ghlOpportunityId && getGhlMode() === "live") {
    const pipelineStageId = getGhlStageId(stage);
    if (!pipelineStageId) {
      await writeAutomationLog({
        leadId,
        leadName: `${lead.firstName} ${lead.lastName}`,
        event: stage === "Calificado" ? "LeadQualified" : "LeadStageChanged",
        action: "updateOpportunity",
        result: "PENDING",
        message: `Configura el ID de etapa de GoHighLevel para sincronizar "${stage}".`,
      });
    } else {
      await performAction(lead, "LeadStageChanged", "updateOpportunity", () =>
        updateOpportunity(lead.ghlOpportunityId!, pipelineStageId),
      );
    }
  }
  const [updated] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);
  return updated;
}

export async function getLeadLogs(leadId: string) {
  return db
    .select()
    .from(automationLogsTable)
    .where(eq(automationLogsTable.leadId, leadId))
    .orderBy(desc(automationLogsTable.at));
}

export async function getRecentLogs(limit = 60) {
  return db
    .select()
    .from(automationLogsTable)
    .orderBy(desc(automationLogsTable.at))
    .limit(limit);
}