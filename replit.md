# LeadFlow Automation

Demo de CRM para capturar, clasificar y dar seguimiento a prospectos mediante workflows, con una capa de integración preparada para GoHighLevel.

## Run & Operate

- Preview workflows: **API Server** y **LeadFlow Automation**.
- `pnpm run typecheck` — verifica librerías compartidas, servidor API y frontend.
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks y validadores después de editar OpenAPI.
- `pnpm --filter @workspace/db run push` — actualiza el esquema PostgreSQL de desarrollo.
- Variables del servidor: `DATABASE_URL`; opcionales `GHL_API_KEY`, `GHL_LOCATION_ID`, IDs de pipeline/calendario y `WEBHOOK_SECRET`.

## Stack

- pnpm workspaces, Node.js, TypeScript
- Frontend: React, Vite, Tailwind CSS, TanStack Query, Wouter
- API: Express 5
- Contrato: OpenAPI 3.1, Orval y Zod
- Datos: PostgreSQL, Drizzle ORM

## Where things live

- `artifacts/leadflow-automation` — interfaz CRM y formulario de captación.
- `artifacts/api-server` — REST API, webhooks y servicios de automatización.
- `lib/api-spec/openapi.yaml` — fuente de verdad para rutas, cuerpos y respuestas.
- `lib/db/src/schema` — esquema de PostgreSQL.
- `README.md` — flujos, endpoints, payloads y guía de demostración.

## Architecture decisions

- El backend valida entrada y salida con esquemas generados desde OpenAPI; los clientes usan hooks generados para mantener el contrato alineado.
- Las acciones externas pasan por `ghlService`; sin ambas credenciales de GHL se simulan y la interfaz anuncia Demo Mode.
- Las acciones del workflow se registran en `automation_logs`, que sirve como historial de lead, activity feed y automation logs.
- Los seguimientos que requieren un scheduler externo se marcan como pendientes en Live Mode; no se reportan como enviados.

## Product

- Formulario público, dashboard, CRM, pipeline de siete etapas, detalle de lead, workflows, webhook tester y automation logs.
- Scoring de leads, citas y simulación completa del flujo posterior a la cita.

## User preferences

- La demo debe ser funcional, profesional y fácil de explicar en una entrevista técnica.
- No inventar ni exponer credenciales; los datos simulados deben permitir probar el flujo completo.

## Gotchas

- Mantener `/api` como prefijo de servidor y regenerar el cliente después de cada cambio OpenAPI.
- No registrar valores de autorización, cuerpos con datos sensibles ni secretos.
- El CRM no tiene autenticación; sólo usar datos ficticios mientras no se añada control de acceso.
- Variables de GoHighLevel sólo están disponibles en el servidor. Las citas y etapas live requieren IDs de recursos de la subcuenta.