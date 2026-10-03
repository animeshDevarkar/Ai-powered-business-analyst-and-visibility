"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, ClipboardCheck, Globe, Layers3, LayoutDashboard, Link2, LoaderCircle, MessageSquare, Plus, Radio, ShieldCheck, Sparkles, Trash2, X, Activity as ActivityIcon } from "lucide-react";
import { engines, type MemoryInput, type Project, type ProjectWorkspace } from "@visibility/core";
import { api } from "@/lib/api";
import { ThemeToggle } from "./theme-toggle";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { AuthUser } from "@visibility/core";

const tabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "memory", label: "Business memory", icon: BookOpen },
  { id: "prompts", label: "Prompt portfolio", icon: MessageSquare },
  { id: "issues", label: "Site issues", icon: ClipboardCheck },
  { id: "observations", label: "AI observations", icon: Radio },
  { id: "review", label: "Review queue", icon: ShieldCheck },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "activity", label: "Activity & costs", icon: ActivityIcon },
] as const;
type Tab = typeof tabs[number]["id"];
const formatDate = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const lines = (value: FormDataEntryValue | null) => String(value ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong";

export function Workspace({ user }: { user: AuthUser }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState("");
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"project" | "prompt" | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const onExpired = () => router.replace("/login");
    window.addEventListener("analytiq-session-expired", onExpired);
    return () => window.removeEventListener("analytiq-session-expired", onExpired);
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    api<Project[]>("/projects", { signal: controller.signal }).then((data) => {
      setProjects(data);
      setSelected((current) => current || data[0]?.id || "");
      setError("");
    }).catch((err) => { if (!controller.signal.aborted) setError(message(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    api<ProjectWorkspace>(`/projects/${selected}`, { signal: controller.signal }).then((data) => {
      setWorkspace(data);
      setError("");
    }).catch((err) => { if (!controller.signal.aborted) setError(message(err)); });
    return () => controller.abort();
  }, [selected, reload]);

  const current = workspace?.project.id === selected ? workspace : null;

  async function signOut() {
    setBusy(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message ?? "Could not sign out");
      router.replace("/login"); router.refresh();
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }

  async function action(work: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); setNotice(success); setReload((value) => value + 1); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(async () => {
      const project = await api<Project>("/projects", { method: "POST", body: JSON.stringify({ name: form.get("name"), website: form.get("website"), description: form.get("description") }) });
      setProjects((previous) => [project, ...previous]); setSelected(project.id); setTab("overview"); setModal(null);
    }, "Project created. Add your business memory to get started.");
  }

  async function createPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(async () => {
      await api(`/projects/${selected}/prompts`, { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
      setModal(null);
    }, "Prompt saved to your portfolio.");
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="Analytiq home"><span className="brand-mark"><Layers3 size={23} /></span>Analytiq</Link>
      <div className="workspace-label">YOUR WORKSPACE <span>LOCAL</span></div>
      <div className="project-picker"><Globe size={18} /><select aria-label="Select project" value={selected} onChange={(event) => { setSelected(event.target.value); setNotice(""); }} disabled={!projects.length || busy}>
        {!projects.length && <option value="">No projects yet</option>}
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select></div>
      <button className="new-project" onClick={() => setModal("project")} disabled={busy}><Plus size={15} /> Create project</button>
      <div className="nav-label">PROJECT</div>
      <nav aria-label="Project navigation">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${tab === id ? "active" : ""}`} onClick={() => { setTab(id); setNotice(""); }} aria-current={tab === id ? "page" : undefined}>
        <Icon size={18} /><span>{label}</span>{id === "issues" && current && <span className="nav-count">{current.issues.length}</span>}
      </button>)}</nav>
      <div className="sidebar-footer"><div className="local-dot" /><div><strong>Local development</strong><span>Your data stays in this workspace</span></div><CircleHelp size={17} aria-hidden="true" /></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14} /><span>{current?.project.name ?? "Getting started"}</span></div><div className="topbar-actions"><ThemeToggle /><div className="account-menu"><span title={user.email}>{user.name}</span><button type="button" className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut} disabled={busy}><LogOut size={17} /></button></div><span className="version-tag">FOUNDATION · v0.1</span></div></header>
      <main>
        {error && <div className="alert error" role="alert"><span>{error}</span><button onClick={() => setReload((value) => value + 1)}>Retry</button><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
        {notice && <div className="alert success" role="status"><Check size={17} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={16} /></button></div>}
        {loading ? <div className="loading"><LoaderCircle className="spin" size={24} /> Loading your workspace</div> : !selected ? <Welcome onCreate={() => setModal("project")} /> : !current ? <div className="loading"><LoaderCircle className="spin" size={24} /> Loading project</div> : <>
          <div className="page-heading"><div><div className="eyebrow">AI SEARCH VISIBILITY</div><h1>{tabs.find((item) => item.id === tab)?.label}</h1><p>{tab === "overview" ? "Understand where you stand. Build on what you can prove." : current.project.website}</p></div><a className="button secondary" href={`/api/projects/${selected}/export`} download><ArrowDownToLine size={16} /> Export project</a></div>
          {tab === "overview" && <Overview workspace={current} onTab={setTab} />}
          {tab === "memory" && <Memory key={`${selected}:${current.memory?.version ?? 0}`} workspace={current} busy={busy} onSave={(input) => action(async () => { await api(`/projects/${selected}/memory`, { method: "PUT", body: JSON.stringify(input) }); }, "Business memory saved as a new version.")} />}
          {tab === "prompts" && <section className="panel"><div className="panel-heading"><div><h2>Your customer questions</h2><p>Define what to observe, across engines and locales.</p></div><button className="button primary" onClick={() => setModal("prompt")}><Plus size={16} /> Add prompt</button></div>
            {current.prompts.length ? <div className="table-wrap"><table><thead><tr><th>Question</th><th>Engine / locale</th><th>Intent</th><th>Priority</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{current.prompts.map((prompt) => <tr key={prompt.id}><td className="question-cell">{prompt.question}</td><td>{engines[prompt.engine]}<small>{prompt.locale}</small></td><td><span className="pill">{prompt.intent}</span></td><td><span className={`priority ${prompt.priority}`}>{prompt.priority}</span></td><td><button className="icon-button" aria-label={`Remove prompt: ${prompt.question}`} disabled={busy} onClick={() => action(async () => { await api(`/projects/${selected}/prompts/${prompt.id}`, { method: "DELETE" }); }, "Prompt removed.")}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div> : <Empty icon={<MessageSquare size={27} />} title="Start with a real customer question" description="Save discovery, comparison, or buying questions. Answer collection will be connected in the next phase." />}
            <div className="panel-note"><Radio size={15} /> Prompt collection is planned. Saving a prompt does not run a provider or incur a cost.</div>
          </section>}
          {tab === "issues" && <section className="panel"><Empty icon={<ClipboardCheck size={28} />} title="Evidence comes before recommendations" description="The crawler will attach affected URLs, evidence, severity, confidence, and validation steps to each issue. No crawl has run for this project." /><div className="panel-note">Next milestone: crawl access, titles, descriptions, and canonical checks.</div></section>}
          {tab === "observations" && <section className="panel"><Empty icon={<Radio size={28} />} title="No answers collected yet" description="Each observation will preserve the raw answer, citations, provider, collection method, locale, timestamp, and available model metadata." /><div className="panel-note">API answers and consumer interface samples will remain distinguishable. Missing metadata stays unknown.</div></section>}
          {tab === "review" && <section className="panel"><Empty icon={<ShieldCheck size={28} />} title="Every published change needs your approval" description="Proposals will arrive here with evidence, a diff or draft, validation results, a preview, and a rollback plan. Publishing integrations are planned." /><div className="panel-note">The foundation does not create pull requests, merge code, or publish content.</div></section>}
          {tab === "integrations" && <Integrations />}
          {tab === "activity" && <><div className="stats-grid two"><Stat label="Provider spend" value="$0.00" detail="No paid jobs have run" icon={<ActivityIcon size={18} />} /><Stat label="Job receipts" value="0" detail="Metering adapter planned" icon={<BookOpen size={18} />} /></div><section className="panel"><div className="panel-heading"><div><h2>Project activity</h2><p>A record of changes made in this workspace.</p></div></div><div className="activity-list">{current.activity.map((item) => <div className="activity-row" key={item.id}><span className="activity-dot" /><div><strong>{item.action}</strong><span>{formatDate(item.createdAt)}</span></div><span className="pill">Local user</span></div>)}</div></section></>}
        </>}
      </main>
      <footer className="main-footer"><span>Evidence → proposal → approval → measurement</span><span>Built for an open, inspectable workflow.</span></footer>
    </div>

    {modal && <Modal title={modal === "project" ? "Create a project" : "Add a prompt"} onClose={() => { if (!busy) setModal(null); }}>
      <form onSubmit={modal === "project" ? createProject : createPrompt}>
        {modal === "project" ? <><p className="form-intro">Give your business a home for its memory, evidence, and AI search observations.</p><label>Business name<input name="name" required maxLength={100} placeholder="e.g. Acme Studio" autoFocus /></label><label>Website<input name="website" type="url" required placeholder="https://example.com" /></label><label>Description <span className="optional">optional</span><textarea name="description" maxLength={1000} placeholder="What does your business do?" rows={3} /></label></> : <><label>Customer question<textarea name="question" required maxLength={1000} rows={3} placeholder="Which tools help a small business monitor its AI search visibility?" autoFocus /></label><div className="form-grid"><label>Target engine<select name="engine">{Object.entries(engines).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Locale<input name="locale" required defaultValue="en-US" pattern="[a-z]{2,3}-[A-Z]{2}" title="Use a locale such as en-US" /></label><label>Intent<select name="intent"><option value="discovery">Discovery</option><option value="comparison">Comparison</option><option value="purchase">Purchase</option><option value="support">Support</option></select></label><label>Priority<select name="priority" defaultValue="medium"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label></div></>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{modal === "project" ? "Create project" : "Save prompt"}</button></div>
      </form>
    </Modal>}
  </div>;
}

function Welcome({ onCreate }: { onCreate: () => void }) {
  return <div className="welcome"><div className="welcome-badge"><Sparkles size={15} /> YOUR AI VISIBILITY WORKSPACE</div><h1>Be part of<br />the answer.</h1><p>Understand how AI search sees your business.<br />Turn evidence into changes you can review and measure.</p><button className="button primary large" onClick={onCreate}>Create your first project <ArrowRight size={18} /></button><div className="welcome-caption">Start with your website. No API keys needed.</div>
    <div className="welcome-cards"><div><span className="step-number">01</span><BookOpen size={23} /><h3>Ground the work</h3><p>Save approved business information and the sources behind your claims.</p></div><div><span className="step-number">02</span><Radio size={23} /><h3>Collect evidence</h3><p>Build a prompt portfolio for the questions your customers ask.</p></div><div><span className="step-number">03</span><ShieldCheck size={23} /><h3>Review every change</h3><p>Prepare for an audit and approval workflow with inspectable results.</p></div></div><div className="foundation-note"><span className="local-dot" /> Foundation release · Project setup, memory, prompts, and exports are ready.</div></div>;
}

function Stat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <div className="stat"><div className="stat-label">{label}{icon}</div><strong>{value}</strong><span>{detail}</span></div>;
}

function Overview({ workspace: w, onTab }: { workspace: ProjectWorkspace; onTab: (tab: Tab) => void }) {
  const steps = [{ label: "Add business memory", detail: "Define your audience, positioning, and approved claims.", done: !!w.memory, tab: "memory" as Tab }, { label: "Build a prompt portfolio", detail: "Save the customer questions you want to monitor.", done: w.prompts.length > 0, tab: "prompts" as Tab }, { label: "Connect your evidence sources", detail: "Search Console and answer collection are coming next.", done: false, tab: "integrations" as Tab }];
  return <><div className="stats-grid"><Stat label="Tracked prompts" value={String(w.prompts.length)} detail="Questions in your portfolio" icon={<MessageSquare size={18} />} /><Stat label="AI observations" value={String(w.observations.length)} detail="No collection runs yet" icon={<Radio size={18} />} /><Stat label="Open site issues" value={String(w.issues.length)} detail="Site audit not yet available" icon={<ClipboardCheck size={18} />} /><Stat label="Approved claims" value={String(w.memory?.claims.length ?? 0)} detail={w.memory ? `Memory version ${w.memory.version}` : "Add your business memory"} icon={<ShieldCheck size={18} />} /></div>
    <div className="overview-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">GETTING STARTED</span><h2>A strong foundation for better answers</h2><p>{steps.filter((step) => step.done).length} of 3 setup steps complete</p></div><span className="completion">{Math.round(steps.filter((step) => step.done).length / 3 * 100)}%</span></div><div className="progress-track"><div style={{ width: `${steps.filter((step) => step.done).length / 3 * 100}%` }} /></div><div className="setup-list">{steps.map((step, index) => <button key={step.label} onClick={() => onTab(step.tab)} className="setup-step"><span className={`step-circle ${step.done ? "done" : ""}`}>{step.done ? <Check size={16} /> : index + 1}</span><div><strong>{step.label}</strong><span>{step.detail}</span></div><ChevronRight size={17} /></button>)}</div></section>
      <section className="insight-panel"><span className="insight-icon"><Sparkles size={24} /></span><div className="eyebrow">THE ANALYTIQ APPROACH</div><h2>A score is only<br />the beginning.</h2><p>Every recommendation should connect to a source, a reviewable change, and a way to measure what happened next.</p><div className="insight-tags"><span>Evidence attached</span><span>Human approval</span><span>Exportable data</span></div></section></div>
    <section className="panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>The latest changes to your project.</p></div><button className="text-button" onClick={() => onTab("activity")}>View all <ArrowRight size={15} /></button></div><div className="activity-list">{w.activity.slice(0, 4).map((item) => <div className="activity-row" key={item.id}><span className="activity-dot" /><div><strong>{item.action}</strong><span>{formatDate(item.createdAt)}</span></div></div>)}</div></section>
  </>;
}

function Memory({ workspace, busy, onSave }: { workspace: ProjectWorkspace; busy: boolean; onSave: (input: MemoryInput) => Promise<void> }) {
  const memory = workspace.memory;
  const [claims, setClaims] = useState<MemoryInput["claims"]>(memory?.claims ?? []);
  const [claimError, setClaimError] = useState("");
  const claimRef = useRef<HTMLFieldSetElement>(null);

  function addClaim() {
    const fields = claimRef.current;
    if (!fields) return;
    const statement = fields.querySelector<HTMLInputElement>("[name=statement]")!;
    const source = fields.querySelector<HTMLInputElement>("[name=sourceUrl]")!;
    const owner = fields.querySelector<HTMLInputElement>("[name=owner]")!;
    const approved = fields.querySelector<HTMLInputElement>("[name=approved]")!;
    if (!statement.value.trim() || !source.value.trim() || !owner.value.trim() || !approved.checked) { setClaimError("Add a claim, source URL, owner, and confirm your approval."); return; }
    try { if (!["https:", "http:"].includes(new URL(source.value).protocol)) throw new Error(); } catch { setClaimError("Use an HTTP or HTTPS source URL."); return; }
    setClaims((previous) => [...previous, { statement: statement.value.trim(), sourceUrl: source.value.trim(), owner: owner.value.trim(), approvedAt: new Date().toISOString() }]);
    statement.value = ""; source.value = ""; owner.value = ""; approved.checked = false; setClaimError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = claimRef.current;
    if (fields && Array.from(fields.querySelectorAll<HTMLInputElement>("input:not([type=checkbox])")).some((input) => input.value.trim())) {
      setClaimError("Add the pending claim before saving, or clear its fields."); return;
    }
    const form = new FormData(event.currentTarget);
    await onSave({ positioning: String(form.get("positioning") ?? ""), audience: String(form.get("audience") ?? ""), products: lines(form.get("products")), competitors: lines(form.get("competitors")), disallowedClaims: lines(form.get("disallowedClaims")), claims });
  }

  return <><form className="panel memory-form" onSubmit={submit}><div className="panel-heading"><div><h2>What your business stands for</h2><p>Each save creates an immutable version. Claims need a source and your approval.</p></div><span className="pill">{memory ? `Version ${memory.version}` : "Not saved"}</span></div><div className="form-body"><div className="form-grid"><label>Positioning<textarea name="positioning" rows={4} maxLength={3000} defaultValue={memory?.positioning} placeholder="What do you do, and what makes it different?" /></label><label>Audience<textarea name="audience" rows={4} maxLength={3000} defaultValue={memory?.audience} placeholder="Who do you help? What are their needs?" /></label><label>Products & services <span className="optional">one per line</span><textarea name="products" rows={3} defaultValue={memory?.products.join("\n")} /></label><label>Competitors <span className="optional">one per line</span><textarea name="competitors" rows={3} defaultValue={memory?.competitors.join("\n")} /></label></div><label>Disallowed claims <span className="optional">one per line</span><textarea name="disallowedClaims" rows={2} defaultValue={memory?.disallowedClaims.join("\n")} placeholder="Claims that drafts must never make" /></label>
      <div className="section-divider" /><h3>Approved claims</h3><p className="muted">Store facts you can support, with an owner and source.</p>
      {claims.map((claim, index) => <div className="claim-row" key={`${claim.statement}:${index}`}><ShieldCheck size={19} /><div><strong>{claim.statement}</strong><a href={claim.sourceUrl} target="_blank" rel="noreferrer">{claim.sourceUrl}</a><small>Approved by {claim.owner} · {formatDate(claim.approvedAt)}</small></div><button type="button" className="icon-button" aria-label={`Remove claim ${index + 1}`} onClick={() => setClaims((previous) => previous.filter((_, i) => i !== index))}><Trash2 size={16} /></button></div>)}
      <fieldset ref={claimRef} className="claim-fields"><legend>Add a sourced claim</legend><label>Claim<input name="statement" maxLength={1000} placeholder="A fact about your business" /></label><div className="form-grid"><label>Source URL<input name="sourceUrl" type="url" placeholder="https://example.com/about" /></label><label>Approving owner<input name="owner" maxLength={100} placeholder="Your name" /></label></div><label className="checkbox-label"><input name="approved" type="checkbox" /> I reviewed the source and approve this claim.</label>{claimError && <p className="form-error" role="alert">{claimError}</p>}<button type="button" className="button secondary" onClick={addClaim} disabled={claims.length >= 100}><Plus size={15} /> Add claim</button></fieldset>
      <div className="form-actions"><span className="muted">{claims.length} approved {claims.length === 1 ? "claim" : "claims"}</span><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Save memory version</button></div></div></form>
      {workspace.memoryVersions.length > 0 && <section className="panel history"><div className="panel-heading"><h2>Version history</h2></div>{workspace.memoryVersions.map((version) => <details key={version.id}><summary>Version {version.version}<span>{formatDate(version.createdAt)}</span></summary><pre>{JSON.stringify(version, null, 2)}</pre></details>)}</section>}
    </>;
}

function Integrations() {
  const items = [{ name: "Google Search Console", mark: "G", detail: "Verified sites, page and query trends, and sitemap evidence.", category: "Search performance" }, { name: "Google Analytics 4", mark: "A", detail: "Landing pages, acquisition, engagement, and key events.", category: "Business outcomes" }, { name: "Answer collector", mark: "✳", detail: "Sampled AI answers with raw responses and citation evidence.", category: "AI search" }, { name: "GitHub", mark: "GH", detail: "Focused pull requests, checks, and approved code changes.", category: "Change workflow" }, { name: "CMS publishing", mark: "C", detail: "Evidence-backed drafts for WordPress and Webflow.", category: "Content workflow" }, { name: "Remote MCP", mark: "M", detail: "Project-scoped agent access through the same core operations.", category: "Agent access" }];
  return <><div className="info-banner"><Link2 size={19} /><p>Connectors are planned. No external accounts are connected and no provider credentials are stored.</p></div><div className="integration-grid">{items.map((item) => <section className="panel integration" key={item.name}><div className="integration-top"><span className="integration-mark">{item.mark}</span><span className="pill">Planned</span></div><span className="eyebrow">{item.category}</span><h2>{item.name}</h2><p>{item.detail}</p></section>)}</div></>;
}

function Empty({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h2>{title}</h2><p>{description}</p></div>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); onClose(); }}><div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
