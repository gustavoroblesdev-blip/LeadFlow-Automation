import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const leadsTable = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  company: text("company"),
  service: text("service").notNull(),
  budget: text("budget").notNull(),
  preferredContactDate: date("preferred_contact_date", { mode: "string" }),
  message: text("message").notNull(),
  urgent: boolean("urgent").notNull().default(false),
  score: integer("score").notNull().default(0),
  priority: text("priority").notNull().default("COLD"),
  stage: text("stage").notNull().default("Nuevo"),
  ghlContactId: text("ghl_contact_id"),
  ghlOpportunityId: text("ghl_opportunity_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastActivity: timestamp("last_activity", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const automationLogsTable = pgTable("automation_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").references(() => leadsTable.id, {
    onDelete: "set null",
  }),
  leadName: text("lead_name"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  event: text("event").notNull(),
  action: text("action").notNull(),
  result: text("result").notNull(),
  message: text("message").notNull(),
});

export const appointmentsTable = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("confirmed"),
});

export type LeadRecord = typeof leadsTable.$inferSelect;
export type AutomationLogRecord = typeof automationLogsTable.$inferSelect;
export type AppointmentRecord = typeof appointmentsTable.$inferSelect;