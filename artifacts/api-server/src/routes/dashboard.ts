import { desc } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  appointmentsTable,
  automationLogsTable,
  db,
  leadsTable,
} from "@workspace/db";
import {
  GetDashboardResponse,
  GetIntegrationStatusResponse,
  ListAutomationLogsResponse,
  ListWorkflowsResponse,
} from "@workspace/api-zod";
import { getRecentLogs } from "../services/automationService";
import { getGhlStatus } from "../services/ghlService";

const router: IRouter = Router();

function asActivity(log: typeof automationLogsTable.$inferSelect) {
  return {
    id: log.id,
    at: log.at.toISOString(),
    event: log.event,
    action: log.action,
    result: log.result,
    message: log.message,
  };
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [leads, appointments, recentLogs] = await Promise.all([
    db.select().from(leadsTable),
    db.select().from(appointmentsTable),
    getRecentLogs(10),
  ]);

  const pipeline: Record<string, number> = {
    Nuevo: 0,
    Contactado: 0,
    Calificado: 0,
    "Cita programada": 0,
    Propuesta: 0,
    Ganado: 0,
    Perdido: 0,
  };
  for (const lead of leads) {
    pipeline[lead.stage] = (pipeline[lead.stage] ?? 0) + 1;
  }

  const conversions = pipeline.Ganado ?? 0;
  const response = {
    totalLeads: leads.length,
    newLeads: pipeline.Nuevo ?? 0,
    qualifiedLeads: pipeline.Calificado ?? 0,
    appointments: appointments.length,
    conversions,
    conversionRate:
      leads.length === 0
        ? 0
        : Number(((conversions / leads.length) * 100).toFixed(1)),
    hotLeads: leads.filter((lead) => lead.priority === "HOT").length,
    pipeline,
    recentActivity: recentLogs.map(asActivity),
  };
  res.json(GetDashboardResponse.parse(response));
});

router.get("/automation-logs", async (_req, res): Promise<void> => {
  const logs = await db
    .select()
    .from(automationLogsTable)
    .orderBy(desc(automationLogsTable.at))
    .limit(120);
  res.json(
    ListAutomationLogsResponse.parse(
      logs.map((log) => ({
        id: log.id,
        at: log.at.toISOString(),
        event: log.event,
        action: log.action,
        result: log.result,
        leadId: log.leadId,
        leadName: log.leadName,
        message: log.message,
      })),
    ),
  );
});

router.get("/workflows", async (_req, res): Promise<void> => {
  const logs = await getRecentLogs(500);
  const workflows = [
    {
      id: "new-lead",
      name: "Nuevo Lead",
      trigger: "Formulario enviado",
      actions: [
        "Crear contacto",
        "Clasificar lead",
        "Agregar etiqueta",
        "Crear oportunidad",
        "Enviar bienvenida",
        "Programar seguimiento",
      ],
      runs: logs.filter((log) => log.action === "receiveLead").length,
      enabled: true,
    },
    {
      id: "unanswered-lead",
      name: "Lead sin respuesta",
      trigger: "Lead sin respuesta durante 24 horas",
      actions: [
        "Crear tarea de seguimiento",
        "Enviar recordatorio",
        "Actualizar actividad",
      ],
      runs: logs.filter((log) => log.event === "LeadUnanswered").length,
      enabled: true,
    },
    {
      id: "appointment-created",
      name: "Cita programada",
      trigger: "Cita creada",
      actions: [
        "Confirmar cita",
        "Crear recordatorio",
        "Actualizar etapa del pipeline",
      ],
      runs: logs.filter((log) => log.event === "AppointmentCreated").length,
      enabled: true,
    },
    {
      id: "after-appointment",
      name: "Después de la cita",
      trigger: "Cita completada",
      actions: [
        "Registrar actividad",
        "Cambiar etapa",
        "Programar seguimiento",
        "Solicitar reseña",
      ],
      runs: logs.filter((log) => log.event === "AppointmentCompleted").length,
      enabled: true,
    },
  ];
  res.json(ListWorkflowsResponse.parse(workflows));
});

router.get("/integrations/status", (_req, res): void => {
  res.json(GetIntegrationStatusResponse.parse(getGhlStatus()));
});

export default router;