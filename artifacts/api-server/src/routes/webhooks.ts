import { randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { appointmentsTable, db, leadsTable } from "@workspace/db";
import {
  ReceiveAppointmentWebhookBody,
  ReceiveAppointmentWebhookResponse,
  ReceiveGhlWebhookBody,
  ReceiveGhlWebhookResponse,
  ReceiveLeadWebhookBody,
  ReceiveLeadWebhookResponse,
  ReceiveStatusWebhookBody,
  ReceiveStatusWebhookResponse,
} from "@workspace/api-zod";
import {
  changeLeadStage,
  createLeadWithWorkflow,
  writeAutomationLog,
} from "../services/automationService";
import { completeAppointmentById } from "../services/appointmentService";

const router: IRouter = Router();

function secretIsValid(req: Request, res: Response): boolean {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return true;

  const provided = req.header("x-webhook-secret") ?? "";
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  const valid =
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
  if (!valid) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return false;
  }
  return true;
}

router.post("/webhooks/lead", async (req, res): Promise<void> => {
  if (!secretIsValid(req, res)) return;
  const parsed = ReceiveLeadWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const lead = await createLeadWithWorkflow(parsed.data);
  res.status(202).json(
    ReceiveLeadWebhookResponse.parse({
      accepted: true,
      eventId: randomUUID(),
      message: "Lead webhook accepted and processed.",
      leadId: lead.id,
    }),
  );
});

router.post("/webhooks/appointment", async (req, res): Promise<void> => {
  if (!secretIsValid(req, res)) return;
  const parsed = ReceiveAppointmentWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, parsed.data.leadId))
    .limit(1);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const isCompleted = parsed.data.status === "completed";
  const [appointment] = await db
    .insert(appointmentsTable)
    .values({
      leadId: lead.id,
      title: "Cita recibida desde GoHighLevel",
      startsAt: new Date(parsed.data.startsAt),
      status: isCompleted ? "completed" : "confirmed",
    })
    .returning();
  await writeAutomationLog({
    leadId: lead.id,
    leadName: `${lead.firstName} ${lead.lastName}`,
    event: "AppointmentCreated",
    action: "receiveAppointmentWebhook",
    result: "SUCCESS",
    message: `Evento de cita ${parsed.data.status} recibido desde un webhook.`,
  });

  if (isCompleted) {
    await completeAppointmentById(appointment.id);
  } else {
    await changeLeadStage(lead.id, "Cita programada");
  }

  res.status(202).json(
    ReceiveAppointmentWebhookResponse.parse({
      accepted: true,
      eventId: randomUUID(),
      message: "Appointment webhook accepted.",
      leadId: lead.id,
    }),
  );
});

router.post("/webhooks/status", async (req, res): Promise<void> => {
  if (!secretIsValid(req, res)) return;
  const parsed = ReceiveStatusWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const lead = await changeLeadStage(parsed.data.leadId, parsed.data.stage);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  await writeAutomationLog({
    leadId: lead.id,
    leadName: `${lead.firstName} ${lead.lastName}`,
    event: "WebhookReceived",
    action: "receiveStatusWebhook",
    result: "SUCCESS",
    message: `Etapa ${parsed.data.stage} recibida desde un webhook.`,
  });
  res.status(202).json(
    ReceiveStatusWebhookResponse.parse({
      accepted: true,
      eventId: randomUUID(),
      message: "Status webhook accepted.",
      leadId: lead.id,
    }),
  );
});

router.post("/webhooks/ghl", async (req, res): Promise<void> => {
  if (!secretIsValid(req, res)) return;
  const parsed = ReceiveGhlWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const possibleLeadId = parsed.data.data.leadId;
  const leadId =
    typeof possibleLeadId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      possibleLeadId,
    )
      ? possibleLeadId
      : null;
  const [lead] = leadId
    ? await db
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.id, leadId))
        .limit(1)
    : [];

  await writeAutomationLog({
    leadId: lead?.id ?? null,
    leadName: lead ? `${lead.firstName} ${lead.lastName}` : null,
    event: parsed.data.type,
    action: "receiveGhlWebhook",
    result: "SUCCESS",
    message: `Evento externo ${parsed.data.type} recibido.`,
  });

  res.status(202).json(
    ReceiveGhlWebhookResponse.parse({
      accepted: true,
      eventId: randomUUID(),
      message: "GoHighLevel webhook accepted.",
      leadId: lead?.id ?? null,
    }),
  );
});

export default router;