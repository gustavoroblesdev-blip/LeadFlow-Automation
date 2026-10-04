import {
  appointmentsTable,
  automationLogsTable,
  db,
  leadsTable,
} from "@workspace/db";
import { scoreLead } from "./leadScoring";

const seedLeads = [
  {
    firstName: "Mariana",
    lastName: "Vega",
    email: "mariana.vega@example.com",
    phone: "+52 55 5550 1240",
    company: null,
    service: "Consultoría de CRM",
    budget: "$1,000–$3,000",
    preferredContactDate: null,
    message: "Quiero organizar mejor las consultas que llegan por la web.",
    urgent: false,
    stage: "Nuevo",
  },
  {
    firstName: "Diego",
    lastName: "Ramírez",
    email: "diego.ramirez@example.com",
    phone: "+52 55 5550 3491",
    company: "Norte Studio",
    service: "Automatización de procesos",
    budget: "$10,000+",
    preferredContactDate: null,
    message: "Necesitamos conectar captación, seguimiento y citas en un solo flujo.",
    urgent: true,
    stage: "Calificado",
  },
  {
    firstName: "Sofía",
    lastName: "Castillo",
    email: "sofia.castillo@example.com",
    phone: "+52 55 5550 6220",
    company: "Lumen Partners",
    service: "Implementación de GoHighLevel",
    budget: "$5,000–$10,000",
    preferredContactDate: null,
    message: "Buscamos consolidar nuestro pipeline comercial y medir conversiones.",
    urgent: false,
    stage: "Ganado",
  },
] as const;

export async function ensureDemoSeedData(): Promise<void> {
  const [existing] = await db.select({ id: leadsTable.id }).from(leadsTable).limit(1);
  if (existing) return;

  const now = Date.now();
  const insertedLeads = [];
  for (const [index, seed] of seedLeads.entries()) {
    const classification = scoreLead(seed);
    const [lead] = await db
      .insert(leadsTable)
      .values({
        ...seed,
        score: classification.score,
        priority: classification.priority,
        createdAt: new Date(now - (index + 1) * 60 * 60 * 1000),
        lastActivity: new Date(now - index * 30 * 60 * 1000),
      })
      .returning();
    insertedLeads.push(lead);
  }

  const qualifiedLead = insertedLeads.find((lead) => lead.stage === "Calificado");
  const [wonLead] = insertedLeads.slice(-1);
  if (qualifiedLead) {
    await db.insert(appointmentsTable).values({
      leadId: qualifiedLead.id,
      title: "Llamada de descubrimiento",
      startsAt: new Date(now + 2 * 60 * 60 * 1000),
      status: "confirmed",
    });
  }

  const rows = insertedLeads.flatMap((lead, index) => {
    const leadName = `${lead.firstName} ${lead.lastName}`;
    const base = [
      {
        leadId: lead.id,
        leadName,
        event: "LeadCreated",
        action: "receiveLead",
        result: "SUCCESS",
        message: "Lead recibido desde el formulario de demostración.",
        at: new Date(now - (index + 1) * 60 * 60 * 1000),
      },
      {
        leadId: lead.id,
        leadName,
        event: "LeadQualified",
        action: "classifyLead",
        result: "SUCCESS",
        message: `Scoring automático: ${lead.score}/100 (${lead.priority}).`,
        at: new Date(now - (index + 1) * 60 * 60 * 1000 + 1000),
      },
    ];
    if (lead.id === qualifiedLead?.id) {
      base.push({
        leadId: lead.id,
        leadName,
        event: "AppointmentCreated",
        action: "confirmAppointment",
        result: "SUCCESS",
        message: "Cita de demostración confirmada.",
        at: new Date(now - 20 * 60 * 1000),
      });
    }
    if (lead.id === wonLead?.id) {
      base.push({
        leadId: lead.id,
        leadName,
        event: "LeadStageChanged",
        action: "updateStage",
        result: "SUCCESS",
        message: "Oportunidad de demostración marcada como ganada.",
        at: new Date(now - 10 * 60 * 1000),
      });
    }
    return base;
  });

  if (rows.length) {
    await db.insert(automationLogsTable).values(rows);
  }

}