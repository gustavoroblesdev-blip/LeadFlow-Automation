# LeadFlow Automation

LeadFlow Automation es una demo funcional de captación, calificación y seguimiento de prospectos. Está pensada para mostrar cómo un formulario puede crear un contacto, calcular su prioridad, abrir una oportunidad en un pipeline y activar automatizaciones que después pueden conectarse a GoHighLevel, Make o n8n.

## Qué resuelve

El proyecto reúne en un mismo flujo:

- Captura de prospectos con validación y almacenamiento en PostgreSQL.
- Scoring automático y asignación HOT, WARM o COLD.
- Seguimiento del lead en un pipeline de siete etapas.
- Registro de actividades y resultados de automatización.
- Simulación de citas, confirmaciones y seguimiento posterior.
- Una capa de servicio GoHighLevel que opera en modo demo hasta configurar credenciales.

## Arquitectura

```text
React + TypeScript + Vite
        │ hooks generados desde OpenAPI
        ▼
Express REST API (/api)
  ├─ servicios de leads y scoring
  ├─ orquestación de automatizaciones y eventos
  ├─ capa GoHighLevel (demo/live)
  └─ rutas de webhooks
        │ Drizzle ORM
        ▼
PostgreSQL
  ├─ leads
  ├─ automation_logs
  └─ appointments
```

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, TanStack Query y Wouter.
- **Backend:** Node.js, TypeScript y Express 5.
- **Contrato:** OpenAPI 3.1 en `lib/api-spec/openapi.yaml`; Orval genera hooks React Query y validadores Zod.
- **Datos:** PostgreSQL con Drizzle ORM. La base de datos del proyecto se administra desde Replit.
- **Servicios principales:** `leadScoring.ts`, `automationService.ts`, `appointmentService.ts`, `demoService.ts` y `ghlService.ts`.

## Flujo de automatización

1. El formulario o un webhook recibe el prospecto.
2. La API valida los campos y guarda el lead.
3. El scoring calcula una puntuación entre 0 y 100.
4. El workflow de nuevo lead crea/simula el contacto, agrega una etiqueta, crea/simula una oportunidad, envía/simula bienvenida y registra un seguimiento.
5. Los cambios de etapa escriben eventos y actualizan el pipeline.
6. La cita activa confirmación y recordatorio.
7. Al completar la cita, se registra la actividad, se mueve el lead a Propuesta y se programa/simula un seguimiento posterior y una solicitud de reseña.

Cada acción se registra con evento, acción, resultado, fecha y lead relacionado. En modo demo la simulación ocurre en el servidor y los datos permanecen en PostgreSQL.

## Clasificación de leads

| Criterio | Puntos |
| --- | ---: |
| Presupuesto de $10,000 o más | +30 |
| Servicio prioritario (CRM, automatización, integración, captación o pipeline) | +20 |
| Empresa indicada | +20 |
| Información principal completa | +10 |
| Solicitud urgente | +20 |

- **80–100:** HOT
- **50–79:** WARM
- **0–49:** COLD

## GoHighLevel

El servicio `ghlService.ts` mantiene las operaciones `createContact`, `updateContact`, `addTag`, `createOpportunity`, `updateOpportunity`, `createAppointment` y `sendMessage`.

- Sin `GHL_API_KEY` y `GHL_LOCATION_ID`, la integración muestra **GoHighLevel: Demo Mode** y utiliza respuestas simuladas.
- Las credenciales, cuando se agreguen, se leen exclusivamente del entorno del servidor. No se exponen al navegador ni a las respuestas de la API.
- Las llamadas live usan la API REST de HighLevel. Los fallos de acciones externas quedan registrados sin guardar ni imprimir la clave.
- Las acciones de oportunidad requieren los IDs de pipeline y etapa. Las citas live requieren `GHL_CALENDAR_ID`.
- En modo live, el seguimiento que aún no tiene un scheduler externo queda marcado como pendiente; no se presenta como un mensaje o tarea realmente enviada.

Variables disponibles en `.env.example`:

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión a PostgreSQL. Replit la proporciona al servicio. |
| `GHL_API_KEY` | Token privado de GoHighLevel, sólo en el servidor. |
| `GHL_LOCATION_ID` | Subcuenta de GoHighLevel destino. |
| `GHL_PIPELINE_ID` | Pipeline para crear oportunidades live. |
| `GHL_PIPELINE_STAGE_ID` | Etapa inicial para una oportunidad nueva. |
| `GHL_CONTACTED_STAGE_ID`, `GHL_QUALIFIED_STAGE_ID`, `GHL_APPOINTMENT_STAGE_ID`, `GHL_PROPOSAL_STAGE_ID`, `GHL_WON_STAGE_ID`, `GHL_LOST_STAGE_ID` | Etapas opcionales para sincronizar cambios de pipeline. |
| `GHL_CALENDAR_ID` | Calendario para crear citas live. |
| `WEBHOOK_SECRET` | Secreto compartido opcional para validar webhooks entrantes mediante `x-webhook-secret`. |

Nunca guardes valores reales en el repositorio. `.env` está ignorado por Git; configura variables sensibles desde el flujo de Secrets de Replit.

## API REST

Los endpoints usan el prefijo `/api`.

| Método | Endpoint | Propósito |
| --- | --- | --- |
| GET | `/api/healthz` | Estado del servicio |
| GET | `/api/dashboard` | Métricas, etapas y actividad reciente |
| GET, POST | `/api/leads` | Listar leads o recibir un lead nuevo |
| GET | `/api/leads/:leadId` | Detalle, actividad y automatizaciones |
| PATCH | `/api/leads/:leadId/stage` | Cambiar etapa del pipeline |
| GET | `/api/workflows` | Definiciones y ejecuciones de workflows |
| GET | `/api/automation-logs` | Historial de automatizaciones |
| GET | `/api/integrations/status` | Estado Demo/Live de GoHighLevel |
| POST | `/api/demo/simulate-lead` | Crear un lead y ejecutar workflow inicial |
| POST | `/api/demo/run-complete` | Ejecutar el escenario completo de 10 pasos |
| POST | `/api/leads/:leadId/appointments` | Programar y confirmar una cita |
| POST | `/api/appointments/:appointmentId/complete` | Completar cita y activar seguimiento posterior |
| POST | `/api/webhooks/lead` | Recibir un lead externo |
| POST | `/api/webhooks/appointment` | Recibir un evento de cita |
| POST | `/api/webhooks/status` | Recibir un cambio de etapa |
| POST | `/api/webhooks/ghl` | Recibir un evento genérico de GoHighLevel |

### Ejemplos de webhooks

```json
{
  "firstName": "Laura",
  "lastName": "Gómez",
  "email": "laura@example.com",
  "phone": "+52 55 0000 0000",
  "company": "Ejemplo S.A.",
  "service": "Automatización de procesos",
  "budget": "$10,000+",
  "message": "Quiero automatizar el seguimiento de prospectos.",
  "urgent": true
}
```

```json
{
  "leadId": "UUID-del-lead",
  "stage": "Calificado"
}
```

Los endpoints de webhook validan su cuerpo. Si `WEBHOOK_SECRET` está configurado, también requieren el encabezado `x-webhook-secret`. En la demo sin secreto, los webhooks aceptan solicitudes para facilitar la prueba; no uses datos personales reales ni expongas el panel CRM como un sistema de producción sin añadir autenticación y limitar el acceso.

## Demo Mode

La aplicación funciona sin credenciales de GoHighLevel. El dashboard indica el modo activo y las respuestas simuladas quedan en el registro de actividad. El botón **Ejecutar demo completa** ejecuta y devuelve una timeline con estos pasos:

1. Recibir lead
2. Crear contacto
3. Calificar lead
4. Crear oportunidad
5. Moverlo a Calificado
6. Programar seguimiento
7. Simular cita
8. Confirmar cita
9. Completar cita
10. Registrar seguimiento posterior

La simulación crea un lead nuevo y no sobrescribe los datos de ejemplo existentes.

## Workflows de demostración

1. **Nuevo Lead:** formulario enviado → contacto → clasificación → etiqueta → oportunidad → bienvenida → seguimiento.
2. **Lead sin respuesta:** trigger configurable por horas → tarea → recordatorio → actividad.
3. **Cita programada:** cita creada → confirmación → recordatorio → etapa.
4. **Después de la cita:** cita completada → actividad → etapa → seguimiento → reseña.

Los flujos que dependen de un scheduler externo se simulan en Demo Mode y quedan explícitamente pendientes en Live Mode hasta conectar dicho scheduler.

## Technical Highlights

- REST APIs con contrato OpenAPI y generación de tipos.
- Webhooks validados para lead, cita, etapa y eventos de GoHighLevel.
- Pipeline CRM editable desde la interfaz.
- Arquitectura de automatización basada en eventos y acciones registradas.
- Scoring determinista HOT/WARM/COLD.
- Workflows y timeline de ejecución.
- Capa de integración GoHighLevel desacoplada y Demo Mode por defecto.
- Variables sensibles sólo en el entorno del servidor.
- PostgreSQL, Drizzle ORM, React y TypeScript.

## Alcance de seguridad de la demo

La interfaz administrativa y la API CRM no incluyen autenticación. Está preparada para demostraciones con datos ficticios, no para almacenar datos reales ni para publicarse como CRM de producción. Antes de usarla con clientes, añade autenticación, autorización por rol, controles de acceso, límites de solicitudes y una política de retención de datos.
