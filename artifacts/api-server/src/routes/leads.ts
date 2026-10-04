import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  automationLogsTable,
  db,
  leadsTable,
} from "@workspace/db";
import {
  CreateLeadBody,
  CreateLeadResponse,
  GetLeadParams,
  GetLeadResponse,
  ListLeadsResponse,
  UpdateLeadStageBody,
  UpdateLeadStageParams,
  UpdateLeadStageResponse,
} from "@workspace/api-zod";
import {
  changeLeadStage,
  createLeadWithWorkflow,
  getLeadLogs,
} from "../services/automationService";

const router: IRouter = Router();

function asLeadResponse(lead: typeof leadsTable.$inferSelect) {
  return {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    service: lead.service,
    budget: lead.budget,
    preferredContactDate: lead.preferredContactDate,
    message: lead.message,
    urgent: lead.urgent,
    score: lead.score,
    priority: lead.priority,
    stage: lead.stage,
    createdAt: lead.createdAt.toISOString(),
    lastActivity: lead.lastActivity.toISOString(),
  };
}

router.get("/leads", async (_req, res): Promise<void> => {
  const leads = await db
    .select()
    .from(leadsTable)
    .orderBy(desc(leadsTable.createdAt));
  res.json(ListLeadsResponse.parse(leads.map(asLeadResponse)));
});

router.post("/leads", async (req, res): Promise<void> => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const lead = await createLeadWithWorkflow(parsed.data);
  res
    .status(201)
    .json(CreateLeadResponse.parse(asLeadResponse(lead)));
});

router.get("/leads/:leadId", async (req, res): Promise<void> => {
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.leadId))
    .limit(1);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [logs, allLogs] = await Promise.all([
    getLeadLogs(lead.id),
    db
      .select()
      .from(automationLogsTable)
      .where(eq(automationLogsTable.leadId, lead.id)),
  ]);
  const completed = new Set(
    allLogs
      .filter((log) => log.result === "SUCCESS")
      .map((log) => log.action),
  );
  const pending = new Set(
    allLogs
      .filter((log) => log.result === "PENDING")
      .map((log) => log.action),
  );
  const automationNames = [
    ["Lead recibido", "receiveLead"],
    ["Lead clasificado", "classifyLead"],
    ["Mensaje de bienvenida", "sendWelcomeMessage"],
    ["Seguimiento programado", "scheduleFollowup"],
    ["Cita confirmada", "confirmAppointment"],
    ["Seguimiento posterior", "requestReview"],
  ];
  const detail = {
    ...asLeadResponse(lead),
    activities: logs.map((log) => ({
      id: log.id,
      at: log.at.toISOString(),
      event: log.event,
      action: log.action,
      result: log.result,
      message: log.message,
    })),
    automations: automationNames.map(([name, action]) => ({
      name,
      status: completed.has(action)
        ? "complete"
        : pending.has(action)
          ? "pending"
          : "pending",
      detail: completed.has(action)
        ? "Ejecutada correctamente."
        : pending.has(action)
          ? "Pendiente de configurar una integración externa."
          : "Aún no ejecutada.",
    })),
  };
  res.json(GetLeadResponse.parse(detail));
});

router.patch("/leads/:leadId/stage", async (req, res): Promise<void> => {
  const params = UpdateLeadStageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateLeadStageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const lead = await changeLeadStage(params.data.leadId, body.data.stage);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  res.json(UpdateLeadStageResponse.parse(asLeadResponse(lead)));
});

export default router;