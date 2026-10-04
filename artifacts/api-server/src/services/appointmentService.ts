import { eq } from "drizzle-orm";
import {
  appointmentsTable,
  db,
  leadsTable,
  type AppointmentRecord,
} from "@workspace/db";
import {
  createAppointment as createGhlAppointment,
  getGhlMode,
  sendMessage,
} from "./ghlService";
import {
  changeLeadStage,
  performAction,
  writeAutomationLog,
} from "./automationService";

export async function createAppointmentForLead(
  leadId: string,
  startsAt: Date,
  title: string,
): Promise<AppointmentRecord | undefined> {
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);
  if (!lead) return undefined;

  const [appointment] = await db
    .insert(appointmentsTable)
    .values({ leadId, startsAt, title, status: "confirmed" })
    .returning();
  const event = "AppointmentCreated";
  const contactId =
    lead.ghlContactId ??
    (getGhlMode() === "demo" ? `demo-contact-${lead.id}` : undefined);

  if (contactId && !lead.ghlContactId) {
    await db
      .update(leadsTable)
      .set({ ghlContactId: contactId })
      .where(eq(leadsTable.id, lead.id));
  }

  if (contactId) {
    await performAction(lead, event, "createAppointment", () =>
      createGhlAppointment(contactId, startsAt, title),
    );
    await performAction(lead, event, "confirmAppointment", () =>
      sendMessage(
        contactId,
        `Tu cita está confirmada para ${startsAt.toLocaleString("es-MX")}.`,
      ),
    );
  } else {
    await writeAutomationLog({
      leadId,
      leadName: `${lead.firstName} ${lead.lastName}`,
      event,
      action: "createAppointment",
      result: "FAILED",
      message: "Appointment could not sync because the lead has no contact ID.",
    });
  }

  const reminderResult = getGhlMode() === "demo" ? "SUCCESS" : "PENDING";
  await writeAutomationLog({
    leadId,
    leadName: `${lead.firstName} ${lead.lastName}`,
    event,
    action: "scheduleReminder",
    result: reminderResult,
    message:
      reminderResult === "SUCCESS"
        ? "Recordatorio demo programado para 24 horas antes de la cita."
        : "Recordatorio pendiente de conectar con un scheduler externo.",
  });
  await changeLeadStage(leadId, "Cita programada");
  return appointment;
}

export async function completeAppointmentById(
  appointmentId: string,
): Promise<AppointmentRecord | undefined> {
  const [existing] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, appointmentId))
    .limit(1);
  if (!existing) return undefined;

  const [appointment] = await db
    .update(appointmentsTable)
    .set({ status: "completed" })
    .where(eq(appointmentsTable.id, appointmentId))
    .returning();
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, existing.leadId))
    .limit(1);

  if (lead) {
    await performAction(lead, "AppointmentCompleted", "completeAppointment", async () => {
      return appointment;
    });
    await changeLeadStage(lead.id, "Propuesta");

    const followUpResult = getGhlMode() === "demo" ? "SUCCESS" : "PENDING";
    await writeAutomationLog({
      leadId: lead.id,
      leadName: `${lead.firstName} ${lead.lastName}`,
      event: "AppointmentCompleted",
      action: "scheduleFollowup",
      result: followUpResult,
      message:
        followUpResult === "SUCCESS"
          ? "Seguimiento posterior a la cita registrado."
          : "Seguimiento posterior pendiente de conectar con un scheduler externo.",
    });

    if (lead.ghlContactId) {
      await performAction(lead, "AppointmentCompleted", "requestReview", () =>
        sendMessage(
          lead.ghlContactId!,
          "Gracias por tu tiempo. ¿Podrías compartirnos una reseña de tu experiencia?",
        ),
      );
    } else {
      await writeAutomationLog({
        leadId: lead.id,
        leadName: `${lead.firstName} ${lead.lastName}`,
        event: "AppointmentCompleted",
        action: "requestReview",
        result: "FAILED",
        message: "Review request skipped because the lead has no contact ID.",
      });
    }
  }

  return appointment;
}

export async function getAppointmentById(appointmentId: string) {
  const [appointment] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, appointmentId))
    .limit(1);
  return appointment;
}