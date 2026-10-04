import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  Activity as ActivityIcon, ArrowDownRight, ArrowRight, CalendarDays, Check,
  ChevronRight, Clock3, FileClock, Flame, Gauge, Layers3,
  LayoutDashboard, ListFilter, Menu, Plus, Radio, RefreshCw, Search, Send,
  ShieldCheck, Sparkles, UserRound, UsersRound, Workflow as WorkflowIcon, X,
} from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetIntegrationStatusQueryKey, getGetLeadQueryKey, getHealthCheckQueryKey,
  getListAutomationLogsQueryKey, getListLeadsQueryKey, getListWorkflowsQueryKey,
  useCompleteAppointment, useCreateAppointment, useCreateLead, useGetDashboard, useHealthCheck,
  useGetIntegrationStatus, useGetLead, useListAutomationLogs, useListLeads,
  useListWorkflows, useReceiveAppointmentWebhook, useReceiveGhlWebhook,
  useReceiveLeadWebhook, useReceiveStatusWebhook, useRunCompleteDemo,
  useSimulateLead, useUpdateLeadStage,
} from '@workspace/api-client-react';
import type {
  Activity, AppointmentWebhookInput, AutomationLog, DemoRunResult, GhlWebhookInput,
  Lead, LeadInput, LeadStage, StatusWebhookInput, WebhookResult, Workflow,
} from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
const stages: LeadStage[] = ['Nuevo', 'Contactado', 'Calificado', 'Cita programada', 'Propuesta', 'Ganado', 'Perdido'];
const navItems = [
  { href: '/', label: 'Resumen', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: UsersRound },
  { href: '/pipeline', label: 'Pipeline', icon: Layers3 },
  { href: '/automatizaciones', label: 'Automatizaciones', icon: WorkflowIcon },
  { href: '/logs', label: 'Registro de actividad', icon: FileClock },
  { href: '/captura', label: 'Formulario público', icon: Radio },
];
const fullName = (lead: Pick<Lead, 'firstName' | 'lastName'>) => `${lead.firstName} ${lead.lastName}`.trim();
const initials = (lead: Pick<Lead, 'firstName' | 'lastName'>) => `${lead.firstName?.[0] ?? ''}${lead.lastName?.[0] ?? ''}`.toUpperCase();
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const friendlyError = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación. Inténtalo de nuevo.';

function App() {
  return <QueryClientProvider client={queryClient}><Router /></QueryClientProvider>;
}

function Router() {
  return <Switch>
    <Route path="/captura" component={CapturePage} />
    <Route path="/leads/:leadId">{params => <Shell><LeadProfile leadId={params.leadId} /></Shell>}</Route>
    <Route path="/leads"><Shell><LeadsPage /></Shell></Route>
    <Route path="/pipeline"><Shell><PipelinePage /></Shell></Route>
    <Route path="/automatizaciones"><Shell><AutomationsPage /></Shell></Route>
    <Route path="/logs"><Shell><LogsPage /></Shell></Route>
    <Route path="/"><Shell><DashboardPage /></Shell></Route>
    <Route><NotFound /></Route>
  </Switch>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const title = navItems.find(item => item.href === location)?.label ?? (location.startsWith('/leads/') ? 'Perfil del lead' : 'LeadFlow');
  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <Link href="/" className="brand"><span className="brand-mark"><ActivityIcon size={17} /></span><span>LeadFlow<small>AUTOMATION CONSOLE</small></span></Link>
      <div className="nav-label">Workspace</div>
      <nav className="nav-list" aria-label="Navegación principal">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href || (href === '/leads' && location.startsWith('/leads/')) ? 'active' : ''}`} onClick={() => setOpen(false)} data-testid={`link-nav-${href.replaceAll('/', '') || 'home'}`}><Icon className="nav-icon" />{label}</Link>)}
      </nav>
      <div className="side-bottom">
        <div className="side-status"><span className="status-dot" />GoHighLevel<br /><strong style={{ color: '#e8f0f5', marginLeft: 14 }}>Modo demo activo</strong></div>
        <div className="side-foot">LEADFLOW v1.0.0</div>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <button className="mobile-menu" aria-label="Abrir menú" onClick={() => setOpen(!open)} data-testid="button-mobile-menu">{open ? <X size={19} /> : <Menu size={19} />}</button>
        <div className="crumb"><span>LeadFlow</span><ChevronRight size={13} /><strong style={{ color: '#30425b' }}>{title}</strong></div>
        <div className="top-right"><span className="top-pill"><span className="status-dot" />DEMO MODE</span><span className="admin-label">Operaciones</span><span className="avatar">LF</span></div>
      </header>
      {children}
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>{children && <div className="actions">{children}</div>}</div>;
}
function Panel({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="panel"><div className="panel-head"><div><h2 className="panel-title">{title}</h2>{subtitle && <div className="panel-subtitle">{subtitle}</div>}</div>{action}</div><div className="panel-body">{children}</div></section>;
}
function LoadingPanel({ label = 'Cargando información…' }: { label?: string }) {
  return <div className="panel"><div className="panel-body" style={{ display: 'grid', gap: 15 }}><div className="skeleton" style={{ width: '42%' }} /><div className="skeleton" /><div className="skeleton" style={{ width: '76%' }} /><span className="form-note">{label}</span></div></div>;
}
function QueryState({ isLoading, isError, onRetry, children }: { isLoading: boolean; isError: boolean; onRetry: () => void; children: ReactNode }) {
  if (isLoading) return <LoadingPanel />;
  if (isError) return <div className="panel error-state"><strong>No pudimos cargar los datos</strong>Revisa la conexión e inténtalo de nuevo.<div style={{ marginTop: 13 }}><button onClick={onRetry} className="btn btn-small"><RefreshCw size={13} />Reintentar</button></div></div>;
  return <>{children}</>;
}
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><strong>{title}</strong>{text}</div>; }
function useRefreshAll() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    void qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    void qc.invalidateQueries({ queryKey: getListAutomationLogsQueryKey() });
    void qc.invalidateQueries({ queryKey: getListWorkflowsQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetIntegrationStatusQueryKey() });
  };
}
function MetricCard({ title, value, note, icon: Icon, trend }: { title: string; value: string | number; note: string; icon: typeof UsersRound; trend?: string }) {
  return <div className="panel metric"><div className="metric-top">{title}<span className="metric-icon"><Icon size={15} /></span></div><div className="metric-value">{value}</div><div className="metric-note">{trend && <span style={{ color: '#25846e', fontWeight: 700 }}>{trend} </span>}{note}</div></div>;
}
function StageBadge({ stage }: { stage: string }) { return <span className="stage-chip">{stage}</span>; }
function PriorityBadge({ priority }: { priority: string }) { return <span className={`priority priority-${priority}`}>{priority}</span>; }
function ActivityList({ items }: { items: Activity[] }) {
  if (!items.length) return <EmptyState title="Sin actividad reciente" text="Las próximas acciones automáticas aparecerán aquí." />;
  return <div className="activity-list">{items.slice(0, 6).map(item => <div className="activity-row" key={item.id} data-testid={`activity-item-${item.id}`}><span className="activity-marker"><Check size={12} /></span><div className="activity-copy"><strong>{item.event}</strong> · {item.action}<small>{item.message} · {formatDate(item.at)}</small></div></div>)}</div>;
}

function DashboardPage() {
  const query = useGetDashboard();
  const integration = useGetIntegrationStatus();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const run = useRunCompleteDemo();
  const refreshAll = useRefreshAll();
  const [demoResult, setDemoResult] = useState<DemoRunResult | null>(null);
  const [demoError, setDemoError] = useState('');
  const summary = query.data;
  const runDemo = () => { setDemoError(''); setDemoResult(null); run.mutate({ data: {} }, { onSuccess: result => { setDemoResult(result); refreshAll(); }, onError: error => setDemoError(friendlyError(error)) }); };
  return <main className="page">
    <PageHeading eyebrow="Vista general · Hoy" title="Resumen operativo" subtitle="Seguimiento en tiempo real del recorrido de cada lead.">
      <Link className="btn" href="/captura"><Plus size={14} />Nuevo lead</Link>
      <button className="btn btn-primary" onClick={runDemo} disabled={run.isPending} data-testid="button-run-demo"><Sparkles size={14} />{run.isPending ? 'Ejecutando…' : 'Ejecutar demo completa'}</button>
    </PageHeading>
    {integration.data && <div className="success-banner" style={{ display: 'flex', alignItems: 'center', gap: 9 }} data-testid="status-ghl-mode"><ShieldCheck size={16} />{integration.data.provider}: {integration.data.mode === 'demo' ? 'Demo Mode' : 'Conexión activa'} · {integration.data.message}<span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{health.data?.status === 'ok' ? 'API operativa' : health.isError ? 'API sin respuesta' : 'Comprobando API'}</span></div>}
    {demoError && <div className="error-banner">{demoError}</div>}
    <QueryState isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()}>
      {summary && <>
        <div className="metric-grid">
          <MetricCard title="Leads totales" value={summary.totalLeads} note="En el CRM" icon={UsersRound} trend={summary.newLeads ? `+${summary.newLeads}` : undefined} />
          <MetricCard title="Nuevos hoy" value={summary.newLeads} note="Pendientes de contacto" icon={ArrowDownRight} />
          <MetricCard title="Citas programadas" value={summary.appointments} note="En seguimiento" icon={CalendarDays} />
          <MetricCard title="Conversión" value={`${summary.conversionRate}%`} note={`${summary.conversions} leads ganados`} icon={Gauge} trend={summary.qualifiedLeads ? `${summary.qualifiedLeads} calificados` : undefined} />
        </div>
        <div className="dashboard-grid">
          <Panel title="Pipeline de ventas" subtitle="Distribución actual por etapa" action={<Link href="/pipeline" className="table-link">Ver pipeline <ArrowRight size={13} /></Link>}>
            {Object.keys(summary.pipeline).length ? <div className="bar-list">{Object.entries(summary.pipeline).map(([stage, count]) => {
              const max = Math.max(1, ...Object.values(summary.pipeline));
              return <div className="bar-row" key={stage}><span>{stage}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(2, (count / max) * 100)}%` }} /></div><span className="bar-number">{count}</span></div>;
            })}</div> : <EmptyState title="Pipeline vacío" text="Cuando lleguen leads, verás su avance por etapa." />}
            <div style={{ borderTop: '1px solid #edf0f3', marginTop: 20, paddingTop: 15, display: 'flex', justifyContent: 'space-between', color: '#758397', fontSize: 11 }}><span><Flame size={13} style={{ verticalAlign: 'middle', color: '#d46c46' }} /> Leads prioritarios</span><strong style={{ color: '#30425b' }}>{summary.hotLeads} HOT</strong></div>
          </Panel>
          <Panel title="Actividad reciente" subtitle="Últimas ejecuciones y eventos"><ActivityList items={summary.recentActivity} /></Panel>
        </div>
        {demoResult && <div className="panel" style={{ marginTop: 16 }}><div className="panel-head"><div><h2 className="panel-title">Recorrido de demo · {fullName(demoResult.lead)}</h2><div className="panel-subtitle">{demoResult.scenario}</div></div><Link href={`/leads/${demoResult.lead.id}`} className="table-link">Abrir ficha <ArrowRight size={13} /></Link></div><div className="panel-body"><DemoTimeline result={demoResult} /></div></div>}
      </>}
    </QueryState>
  </main>;
}

function DemoTimeline({ result }: { result: DemoRunResult }) {
  return <div className="demo-timeline">{result.steps.map(step => <div className="demo-step" key={step.id}><span className="timeline-dot">{step.result === 'SUCCESS' ? <Check size={12} /> : <Clock3 size={12} />}</span><div className="timeline-content"><strong>{step.label}</strong>{step.event} · {step.action}<small>{formatDate(step.at)} · {step.result}</small></div></div>)}</div>;
}

function LeadsPage() {
  const query = useListLeads();
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('Todas');
  const filtered = useMemo(() => (query.data ?? []).filter(lead => {
    const term = search.toLowerCase();
    const match = !term || [fullName(lead), lead.email, lead.phone, lead.company ?? '', lead.service].some(value => value.toLowerCase().includes(term));
    return match && (priority === 'Todas' || lead.priority === priority);
  }), [query.data, search, priority]);
  return <main className="page">
    <PageHeading eyebrow="CRM · Contactos" title="Leads" subtitle="Busca, prioriza y abre el contexto completo de cada oportunidad."><Link className="btn btn-primary" href="/captura"><Plus size={14} />Capturar lead</Link></PageHeading>
    <div className="panel"><div className="table-tools"><div className="search-wrap"><Search size={15} /><input className="field-control" aria-label="Buscar leads" placeholder="Buscar por nombre, empresa o email…" value={search} onChange={event => setSearch(event.target.value)} data-testid="input-search-leads" /></div><select className="field-control filter-select" value={priority} onChange={event => setPriority(event.target.value)} aria-label="Filtrar por prioridad" data-testid="select-lead-priority"><option>Todas</option><option>HOT</option><option>WARM</option><option>COLD</option></select></div>
      <QueryState isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()}>
        {filtered.length ? <div className="table-wrap"><table><thead><tr><th>Lead</th><th>Prioridad</th><th>Servicio</th><th>Etapa</th><th>Puntuación</th><th>Última actividad</th><th /></tr></thead><tbody>{filtered.map(lead => <tr key={lead.id} data-testid={`row-lead-${lead.id}`}><td><div className="lead-name">{fullName(lead)}</div><div className="lead-email">{lead.email} · {lead.company || 'Sin empresa'}</div></td><td><PriorityBadge priority={lead.priority} /></td><td>{lead.service}</td><td><StageBadge stage={lead.stage} /></td><td><strong>{lead.score}</strong><span style={{ color: '#8b97a6' }}> / 100</span></td><td>{formatDate(lead.lastActivity)}</td><td><Link className="table-link" href={`/leads/${lead.id}`}>Abrir <ArrowRight size={12} /></Link></td></tr>)}</tbody></table></div> : <EmptyState title={search || priority !== 'Todas' ? 'No hay resultados' : 'Aún no hay leads'} text={search || priority !== 'Todas' ? 'Prueba con otros términos o cambia el filtro.' : 'Captura un lead para iniciar el flujo de automatización.'} />}
      </QueryState>
    </div>
  </main>;
}

function PipelinePage() {
  const query = useListLeads();
  const stageUpdate = useUpdateLeadStage();
  const refreshAll = useRefreshAll();
  const [error, setError] = useState('');
  const leads = query.data ?? [];
  const moveLead = (lead: Lead, stage: LeadStage) => {
    setError('');
    stageUpdate.mutate({ leadId: lead.id, data: { stage } }, {
      onSuccess: () => { refreshAll(); void queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(lead.id) }); },
      onError: err => setError(friendlyError(err)),
    });
  };
  return <main className="page"><PageHeading eyebrow="Ventas · Etapas" title="Pipeline" subtitle="Mueve oportunidades y mantén visible el siguiente paso." /><div style={{ marginBottom: 13, color: '#8491a2', fontSize: 11 }}><ListFilter size={13} style={{ verticalAlign: 'middle' }} /> Vista kanban · {leads.length} leads</div>{error && <div className="error-banner">{error}</div>}
    <QueryState isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()}>{leads.length ? <div className="pipeline">{stages.map(stage => {
      const items = leads.filter(lead => lead.stage === stage);
      return <section className="pipeline-col" key={stage}><div className="pipeline-col-head"><span>{stage}</span><span className="count">{items.length}</span></div>{items.map(lead => <div className="pipeline-card" key={lead.id} data-testid={`pipeline-card-${lead.id}`}><Link href={`/leads/${lead.id}`} className="pc-name">{fullName(lead)}</Link><div className="pc-meta">{lead.company || lead.service} · {lead.score} pts</div><div className="pc-foot"><PriorityBadge priority={lead.priority} /><select className="select-compact" aria-label={`Cambiar etapa de ${fullName(lead)}`} value={lead.stage} disabled={stageUpdate.isPending} onChange={event => moveLead(lead, event.target.value as LeadStage)} data-testid={`select-stage-${lead.id}`}>{stages.map(item => <option key={item} value={item}>{item}</option>)}</select></div></div>)}</section>;
    })}</div> : <div className="panel"><EmptyState title="El pipeline está vacío" text="Los leads capturados aparecerán aquí para avanzar por cada etapa." /></div>}</QueryState>
  </main>;
}

function LeadProfile({ leadId }: { leadId: string }) {
  const query = useGetLead(leadId, { query: { enabled: !!leadId, queryKey: getGetLeadQueryKey(leadId) } });
  const stageMutation = useUpdateLeadStage();
  const createAppointment = useCreateAppointment();
  const completeAppointment = useCompleteAppointment();
  const [appointment, setAppointment] = useState<{ id: string; status: string } | null>(null);
  const [appointmentAt, setAppointmentAt] = useState('');
  const [appointmentTitle, setAppointmentTitle] = useState('Consulta inicial');
  const [error, setError] = useState('');
  const refreshAll = useRefreshAll();
  const lead = query.data;
  const updateStage = (stage: LeadStage) => {
    if (!lead) return;
    stageMutation.mutate({ leadId, data: { stage } }, { onSuccess: () => { refreshAll(); void queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(leadId) }); }, onError: err => setError(friendlyError(err)) });
  };
  const submitAppointment = (event: FormEvent) => {
    event.preventDefault();
    if (!appointmentAt || !lead) return;
    createAppointment.mutate({ leadId, data: { title: appointmentTitle, startsAt: new Date(appointmentAt).toISOString() } }, { onSuccess: result => { setAppointment({ id: result.id, status: result.status }); setError(''); refreshAll(); void queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(leadId) }); }, onError: err => setError(friendlyError(err)) });
  };
  return <main className="page"><PageHeading eyebrow="CRM · Perfil" title={lead ? fullName(lead) : 'Perfil del lead'} subtitle="Información, estado de calificación y trazabilidad del flujo."><Link href="/leads" className="btn">Volver a leads</Link></PageHeading>
    <QueryState isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()}>{lead && <>
      {error && <div className="error-banner">{error}</div>}
      <div className="profile-grid"><div className="profile-main">
        <Panel title="Información de contacto" subtitle={`Capturado ${formatDate(lead.createdAt)}`}>
          <div className="profile-name-row" style={{ marginBottom: 20 }}><span className="profile-avatar">{initials(lead)}</span><div><div style={{ font: '700 16px Manrope', color: '#263951' }}>{fullName(lead)}</div><div style={{ color: '#8290a0', fontSize: 11 }}>{lead.company || 'Particular'} · {lead.service}</div></div><PriorityBadge priority={lead.priority} /></div>
          <div className="details-grid"><Detail label="Email" value={lead.email} /><Detail label="Teléfono" value={lead.phone} /><Detail label="Presupuesto" value={lead.budget} /><Detail label="Contacto preferido" value={lead.preferredContactDate ? formatDate(lead.preferredContactDate) : 'Sin preferencia'} /><Detail label="Puntuación" value={`${lead.score} / 100`} /><Detail label="Urgente" value={lead.urgent ? 'Sí' : 'No'} /><Detail label="Última actividad" value={formatDate(lead.lastActivity)} /><Detail label="ID lead" value={lead.id} /></div>
          {lead.message && <div style={{ marginTop: 18, borderTop: '1px solid #edf0f3', paddingTop: 14 }}><div className="eyebrow">Mensaje inicial</div><div style={{ color: '#4d5e72', fontSize: 12, lineHeight: 1.6 }}>{lead.message}</div></div>}
        </Panel>
        <Panel title="Actividad y automatización" subtitle="Historial de eventos de este lead">
          {lead.activities.length ? <div className="timeline">{lead.activities.map(item => <div className="timeline-item" key={item.id}><span className="timeline-dot">{item.result === 'SUCCESS' ? <Check size={12} /> : <Clock3 size={12} />}</span><div className="timeline-content"><strong>{item.event} · {item.action}</strong>{item.message}<small>{formatDate(item.at)} · {item.result}</small></div></div>)}</div> : <EmptyState title="Sin actividad registrada" text="El historial se completará cuando se ejecuten acciones." />}
        </Panel>
      </div><div style={{ display: 'grid', alignContent: 'start', gap: 16 }}>
        <Panel title="Etapa del pipeline" subtitle="Cambios sincronizados con el CRM"><div className="form-field"><label htmlFor="lead-stage">Etapa actual</label><select id="lead-stage" value={lead.stage} disabled={stageMutation.isPending} onChange={event => updateStage(event.target.value as LeadStage)} data-testid="select-profile-stage">{stages.map(stage => <option key={stage}>{stage}</option>)}</select></div><div style={{ marginTop: 13 }}><PriorityBadge priority={lead.priority} /> <span style={{ marginLeft: 8, fontSize: 11, color: '#758397' }}>Score {lead.score}/100</span></div></Panel>
        <Panel title="Checks de automatización" subtitle="Estado de las reglas para este lead">{lead.automations.length ? <div className="check-list">{lead.automations.map(check => <div className="check-row" key={check.name}><span>{check.name}<div className="form-note">{check.detail}</div></span><span className={`check-state check-${check.status}`}>{check.status}</span></div>)}</div> : <EmptyState title="Sin verificaciones" text="Las comprobaciones aparecerán al procesarse el lead." />}</Panel>
        <Panel title="Agendar cita" subtitle="Crear y completar eventos de calendario">
          {appointment && <div className="success-banner">Cita {appointment.status}. Ref. {appointment.id}{appointment.status !== 'completed' && <button className="btn btn-small" style={{ marginLeft: 8 }} onClick={() => completeAppointment.mutate({ appointmentId: appointment.id }, { onSuccess: result => { setAppointment({ id: result.id, status: result.status }); refreshAll(); void queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(leadId) }); }, onError: err => setError(friendlyError(err)) })} disabled={completeAppointment.isPending} data-testid="button-complete-appointment">{completeAppointment.isPending ? 'Actualizando…' : 'Marcar completada'}</button>}</div>}
          <form className="form-grid" onSubmit={submitAppointment}><div className="form-field span-two"><label htmlFor="appointment-title">Título</label><input id="appointment-title" value={appointmentTitle} onChange={event => setAppointmentTitle(event.target.value)} required maxLength={160} /></div><div className="form-field span-two"><label htmlFor="appointment-time">Fecha y hora</label><input id="appointment-time" type="datetime-local" value={appointmentAt} onChange={event => setAppointmentAt(event.target.value)} required /></div><button className="btn btn-primary span-two" disabled={createAppointment.isPending} data-testid="button-create-appointment"><CalendarDays size={13} />{createAppointment.isPending ? 'Agendando…' : 'Crear cita'}</button></form>
        </Panel>
      </div></div>
    </>}</QueryState>
  </main>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-item"><label>{label}</label><div>{value}</div></div>; }

const defaultLead: LeadInput = { firstName: '', lastName: '', email: '', phone: '', company: '', service: '', budget: '', preferredContactDate: '', message: '', urgent: false };
function CapturePage() {
  const [form, setForm] = useState<LeadInput>(defaultLead);
  const [successLead, setSuccessLead] = useState<Lead | null>(null);
  const [error, setError] = useState('');
  const mutation = useCreateLead();
  const refreshAll = useRefreshAll();
  const set = (key: keyof LeadInput, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError(''); setSuccessLead(null);
    mutation.mutate({ data: { ...form, company: form.company || null, preferredContactDate: form.preferredContactDate || null } }, { onSuccess: lead => { setSuccessLead(lead); setForm(defaultLead); refreshAll(); }, onError: err => setError(friendlyError(err)) });
  };
  return <div className="capture-wrap"><Link href="/" className="capture-brand"><span className="brand-mark"><ActivityIcon size={17} /></span>LeadFlow Automation</Link><div className="capture-hero"><div className="eyebrow" style={{ color: '#a6c7c9' }}>CONTACTO · CAPTURA</div><h1>Hablemos de tu próximo proyecto.</h1><p>Cuéntanos qué necesitas. Nuestro equipo revisará tu solicitud y se pondrá en contacto contigo.</p></div>
    <div className="panel capture-panel">
      {successLead && <div className="success-banner" data-testid="status-capture-success"><strong>¡Gracias! Hemos recibido tu solicitud.</strong><br />Tu lead ya está registrado y el flujo de calificación se ha iniciado. Referencia: {successLead.id}</div>}
      {error && <div className="error-banner">{error}</div>}
      <form className="form-grid" onSubmit={submit}>
        <div className="form-field"><label htmlFor="capture-first">Nombre *</label><input id="capture-first" required maxLength={100} value={form.firstName} onChange={e => set('firstName', e.target.value)} data-testid="input-first-name" /></div>
        <div className="form-field"><label htmlFor="capture-last">Apellidos *</label><input id="capture-last" required maxLength={100} value={form.lastName} onChange={e => set('lastName', e.target.value)} data-testid="input-last-name" /></div>
        <div className="form-field"><label htmlFor="capture-email">Email</label><input id="capture-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} data-testid="input-capture-email" /></div>
        <div className="form-field"><label htmlFor="capture-phone">Teléfono *</label><input id="capture-phone" type="tel" required minLength={5} maxLength={40} value={form.phone} onChange={e => set('phone', e.target.value)} data-testid="input-capture-phone" /></div>
        <div className="form-field"><label htmlFor="capture-company">Empresa</label><input id="capture-company" maxLength={160} value={form.company ?? ''} onChange={e => set('company', e.target.value)} /></div>
        <div className="form-field"><label htmlFor="capture-service">Servicio de interés *</label><select id="capture-service" required value={form.service} onChange={e => set('service', e.target.value)}><option value="">Seleccionar servicio</option><option>Automatización CRM</option><option>Generación de leads</option><option>Integración GoHighLevel</option><option>Consultoría</option><option>Otro</option></select></div>
        <div className="form-field"><label htmlFor="capture-budget">Presupuesto *</label><select id="capture-budget" required value={form.budget} onChange={e => set('budget', e.target.value)}><option value="">Seleccionar rango</option><option>Menos de 1.000 €</option><option>1.000 € – 5.000 €</option><option>5.000 € – 15.000 €</option><option>Más de 15.000 €</option><option>Por definir</option></select></div>
        <div className="form-field"><label htmlFor="capture-date">Fecha preferida de contacto</label><input id="capture-date" type="date" value={form.preferredContactDate ?? ''} onChange={e => set('preferredContactDate', e.target.value)} /></div>
        <div className="form-field span-two"><label htmlFor="capture-message">Cuéntanos más</label><textarea id="capture-message" maxLength={2000} value={form.message} onChange={e => set('message', e.target.value)} placeholder="¿Qué objetivo quieres conseguir?" /></div>
        <label className="span-two" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#56667b' }}><input type="checkbox" checked={form.urgent} onChange={e => set('urgent', e.target.checked)} /> Mi solicitud es urgente</label>
        <div className="span-two" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><span className="form-note">Los campos marcados con * son obligatorios. Tus datos se utilizarán únicamente para responder a tu solicitud.</span><button className="btn btn-primary" type="submit" disabled={mutation.isPending} data-testid="button-submit-capture"><Send size={14} />{mutation.isPending ? 'Enviando…' : 'Enviar solicitud'}</button></div>
      </form>
    </div><div className="form-note" style={{ textAlign: 'center', marginTop: 15 }}>LeadFlow Automation · Captura segura de oportunidades</div>
  </div>;
}

const webhookPayloads = {
  lead: { firstName: 'Alex', lastName: 'Rivera', email: 'alex.rivera@ejemplo.com', phone: '+34 600 123 456', company: 'Estudio Norte', service: 'Automatización CRM', budget: '1.000 € – 5.000 €', preferredContactDate: null, message: 'Queremos automatizar la calificación de leads.', urgent: false },
  appointment: { leadId: '', startsAt: new Date(Date.now() + 86400000).toISOString(), status: 'created' },
  status: { leadId: '', stage: 'Contactado' },
  ghl: { type: 'ContactCreate', id: 'contact_demo_001', data: { firstName: 'Alex', lastName: 'Rivera', source: 'LeadFlow demo' } },
};
type HookType = 'lead' | 'appointment' | 'status' | 'ghl';
function AutomationsPage() {
  const workflows = useListWorkflows();
  const leadsQuery = useListLeads();
  const leadWebhook = useReceiveLeadWebhook();
  const appointmentWebhook = useReceiveAppointmentWebhook();
  const statusWebhook = useReceiveStatusWebhook();
  const ghlWebhook = useReceiveGhlWebhook();
  const simulate = useSimulateLead();
  const runComplete = useRunCompleteDemo();
  const [hookType, setHookType] = useState<HookType>('lead');
  const [payload, setPayload] = useState(JSON.stringify(webhookPayloads.lead, null, 2));
  const [webhookResult, setWebhookResult] = useState<WebhookResult | null>(null);
  const [demoResult, setDemoResult] = useState<DemoRunResult | null>(null);
  const [error, setError] = useState('');
  const refreshAll = useRefreshAll();
  const isPending = leadWebhook.isPending || appointmentWebhook.isPending || statusWebhook.isPending || ghlWebhook.isPending;
  const setType = (type: HookType) => {
    setHookType(type);
    const base: Record<string, unknown> = { ...webhookPayloads[type] };
    if ((type === 'appointment' || type === 'status') && leadsQuery.data?.[0]) base.leadId = leadsQuery.data[0].id;
    setPayload(JSON.stringify(base, null, 2)); setWebhookResult(null); setError('');
  };
  const sendWebhook = () => {
    setError(''); setWebhookResult(null);
    try {
      const data = JSON.parse(payload) as Record<string, unknown>;
      const handlers = {
        lead: () => leadWebhook.mutate({ data: data as unknown as LeadInput }, { onSuccess: res => { setWebhookResult(res); refreshAll(); }, onError: err => setError(friendlyError(err)) }),
        appointment: () => appointmentWebhook.mutate({ data: data as unknown as AppointmentWebhookInput }, { onSuccess: res => { setWebhookResult(res); refreshAll(); }, onError: err => setError(friendlyError(err)) }),
        status: () => statusWebhook.mutate({ data: data as unknown as StatusWebhookInput }, { onSuccess: res => { setWebhookResult(res); refreshAll(); }, onError: err => setError(friendlyError(err)) }),
        ghl: () => ghlWebhook.mutate({ data: data as unknown as GhlWebhookInput }, { onSuccess: res => { setWebhookResult(res); refreshAll(); }, onError: err => setError(friendlyError(err)) }),
      };
      handlers[hookType]();
    } catch { setError('El payload no es JSON válido. Revisa la estructura antes de enviarlo.'); }
  };
  const runDemo = (complete: boolean) => {
    setError(''); setDemoResult(null);
    const mutation = complete ? runComplete : simulate;
    mutation.mutate({ data: {} }, { onSuccess: result => { setDemoResult(result); refreshAll(); }, onError: err => setError(friendlyError(err)) });
  };
  return <main className="page"><PageHeading eyebrow="Sistema · Flujos" title="Automatizaciones" subtitle="Cada entrada activa reglas medibles, con resultados trazables y pruebas reproducibles."><button className="btn btn-primary" onClick={() => runDemo(true)} disabled={runComplete.isPending} data-testid="button-run-complete-workflow"><Sparkles size={14} />{runComplete.isPending ? 'Ejecutando…' : 'Probar recorrido completo'}</button></PageHeading>
    {error && <div className="error-banner">{error}</div>}
    <QueryState isLoading={workflows.isLoading} isError={workflows.isError} onRetry={() => void workflows.refetch()}>
      <WorkflowList workflows={workflows.data ?? []} />
    </QueryState>
    {demoResult && <div className="panel" style={{ marginTop: 16 }}><div className="panel-head"><div><h2 className="panel-title">Ejecución recibida · {fullName(demoResult.lead)}</h2><div className="panel-subtitle">{demoResult.scenario}</div></div><Link href={`/leads/${demoResult.lead.id}`} className="table-link">Ver lead <ArrowRight size={13} /></Link></div><div className="panel-body"><DemoTimeline result={demoResult} /></div></div>}
    <div className="webhook-layout">
      <Panel title="Probar webhook" subtitle="Envía un payload al endpoint real de integración">
        <div className="webhook-form"><div className="form-field"><label htmlFor="webhook-type">Evento de entrada</label><select id="webhook-type" value={hookType} onChange={event => setType(event.target.value as HookType)} data-testid="select-webhook-type"><option value="lead">Lead entrante</option><option value="appointment">Cita</option><option value="status">Cambio de etapa</option><option value="ghl">Webhook GoHighLevel</option></select></div><div className="form-field"><label htmlFor="webhook-json">Payload JSON</label><textarea id="webhook-json" className="codebox" value={payload} onChange={event => setPayload(event.target.value)} spellCheck={false} data-testid="input-webhook-payload" /></div><button className="btn btn-primary" onClick={sendWebhook} disabled={isPending} data-testid="button-send-webhook"><Send size={13} />{isPending ? 'Enviando al webhook…' : 'Enviar payload de prueba'}</button>
          {webhookResult && <div className={webhookResult.accepted ? 'success-banner' : 'error-banner'} data-testid="status-webhook-result"><strong>{webhookResult.accepted ? 'Evento aceptado' : 'Evento rechazado'}</strong><br />{webhookResult.message} · Ref. {webhookResult.eventId}</div>}
        </div>
      </Panel>
      <Panel title="Contrato de entrada" subtitle="La prueba utiliza el contrato OpenAPI del servidor">
        <div className="codebox">{`POST ${hookType === 'lead' ? '/api/webhooks/lead' : hookType === 'appointment' ? '/api/webhooks/appointment' : hookType === 'status' ? '/api/webhooks/status' : '/api/webhooks/ghl'}\nContent-Type: application/json\n\n${payload}`}</div>
        <div style={{ marginTop: 14 }} className="form-note">Los webhooks activan lógica de servidor; los resultados confirmados se reflejan en leads, actividad y logs.</div>
      </Panel>
    </div>
    <Panel title="Simulación de una entrada" subtitle="Crea un lead de muestra desde el endpoint de demo y ejecuta la automatización inicial" action={<button className="btn btn-small btn-accent" onClick={() => runDemo(false)} disabled={simulate.isPending} data-testid="button-simulate-lead">{simulate.isPending ? 'Procesando…' : 'Simular nuevo lead'}</button>}><div className="form-note">La respuesta del servidor devuelve el lead creado y cada paso realizado por el workflow. No se utiliza información local ficticia en el resultado.</div></Panel>
  </main>;
}
function WorkflowList({ workflows }: { workflows: Workflow[] }) {
  if (!workflows.length) return <div className="panel"><EmptyState title="No hay workflows disponibles" text="La lista se mostrará cuando el servicio de automatización esté listo." /></div>;
  return <div className="workflow-grid">{workflows.map(workflow => <WorkflowCard key={workflow.id} workflow={workflow} />)}</div>;
}
function WorkflowCard({ workflow }: { workflow: Workflow }) {
  return <article className="panel workflow-card" data-testid={`workflow-card-${workflow.id}`}><div className="workflow-top"><div><h3>{workflow.name}</h3><div className="workflow-trigger">Al activarse: {workflow.trigger}</div></div><span className="toggle-label"><span className="status-dot" style={{ background: workflow.enabled ? '#39b992' : '#9aa6b3' }} />{workflow.enabled ? 'Activo' : 'Pausado'}</span></div><div className="flow-actions">{workflow.actions.map((action, index) => <div className="flow-action" key={`${workflow.id}-${index}`}><span className="flow-index">{String(index + 1).padStart(2, '0')}</span>{action}</div>)}</div><div className="flow-foot"><span>WORKFLOW {workflow.id}</span><span>{workflow.runs.toLocaleString('es-ES')} ejecuciones</span></div></article>;
}

function LogsPage() {
  const query = useListAutomationLogs();
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('Todos');
  const rows = useMemo(() => (query.data ?? []).filter(row => {
    const term = search.toLowerCase();
    const matches = !term || [row.event, row.action, row.message, row.leadName ?? '', row.leadId ?? ''].some(value => value.toLowerCase().includes(term));
    return matches && (resultFilter === 'Todos' || row.result === resultFilter);
  }), [query.data, search, resultFilter]);
  return <main className="page"><PageHeading eyebrow="Observabilidad · Ejecuciones" title="Registro de actividad" subtitle="Audita cada trigger, acción y respuesta de las automatizaciones."><button className="btn" onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-refresh-logs"><RefreshCw size={13} />{query.isFetching ? 'Actualizando…' : 'Actualizar'}</button></PageHeading>
    <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}><MetricCard title="Ejecuciones" value={query.data?.length ?? '—'} note="Eventos recientes" icon={ActivityIcon} /><MetricCard title="Correctas" value={query.data?.filter(log => log.result === 'SUCCESS').length ?? '—'} note="Acciones procesadas" icon={Check} /><MetricCard title="Pendientes / error" value={query.data?.filter(log => log.result !== 'SUCCESS').length ?? '—'} note="Requieren seguimiento" icon={Clock3} /></div>
    <div className="panel"><div className="table-tools"><div className="search-wrap"><Search size={15} /><input className="field-control" placeholder="Buscar evento, acción o lead…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar registros" data-testid="input-search-logs" /></div><select className="field-control filter-select" value={resultFilter} onChange={e => setResultFilter(e.target.value)} aria-label="Filtrar resultado" data-testid="select-log-result"><option>Todos</option><option value="SUCCESS">Correctas</option><option value="PENDING">Pendientes</option><option value="FAILED">Fallidas</option></select></div>
      <QueryState isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()}>{rows.length ? <div className="table-wrap"><table><thead><tr><th>Hora</th><th>Evento</th><th>Acción ejecutada</th><th>Lead</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>{rows.map(log => <LogRow key={log.id} log={log} />)}</tbody></table></div> : <EmptyState title={query.data?.length ? 'Sin coincidencias' : 'Sin ejecuciones registradas'} text={query.data?.length ? 'Ajusta la búsqueda o el filtro para ver más resultados.' : 'Los eventos de workflow aparecerán a medida que se procesen leads.'} />}</QueryState>
    </div>
  </main>;
}
function LogRow({ log }: { log: AutomationLog }) {
  return <tr data-testid={`row-log-${log.id}`}><td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.at)}</td><td><strong>{log.event}</strong></td><td>{log.action}</td><td>{log.leadId ? <Link className="table-link" href={`/leads/${log.leadId}`}>{log.leadName || log.leadId}</Link> : 'Sistema'}</td><td><span className={`result-chip result-${log.result}`}>{log.result}</span></td><td style={{ maxWidth: 280 }}>{log.message}</td></tr>;
}

export default App;