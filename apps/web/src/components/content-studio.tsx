"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, Download, Facebook, FileText, Instagram, Linkedin, LoaderCircle, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { socialPlatforms, type ContentCapabilities, type ContentDraft, type ContentInput, type GenerationInput, type ProjectWorkspace, type SocialPlatform } from "@visibility/core";
import { api } from "@/lib/api";

const icons = { instagram: Instagram, linkedin: Linkedin, facebook: Facebook };
const limits = { instagram: 2200, linkedin: 3000, facebook: 50000 };
const blank = (kind: "social" | "blog"): ContentInput => ({ kind, platform: kind === "social" ? "instagram" : null, title: "", body: "", excerpt: "", imageUrl: "", keywords: "" });
const statusLabels = { draft: "Draft", publishing: "Publishing — check account", published: "Published", publish_unknown: "Check social account" };

export function ContentStudio({ workspace, kind, onChanged }: { workspace: ProjectWorkspace; kind: "social" | "blog"; onChanged: () => void }) {
  const [editor, setEditor] = useState<ContentInput>(() => blank(kind));
  const [saved, setSaved] = useState<ContentDraft | null>(null);
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<GenerationInput["tone"]>("professional");
  const [config, setConfig] = useState<ContentCapabilities | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [review, setReview] = useState(false);
  const [approved, setApproved] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const projectId = workspace.project.id;
  const base = `/projects/${projectId}/content`;
  const readOnly = saved !== null && saved.status !== "draft";
  const dirty = saved ? Object.keys(editor).some((key) => editor[key as keyof ContentInput] !== saved[key as keyof ContentInput]) : Boolean(editor.title || editor.body);
  const canPublish = saved?.status === "draft" && !dirty && editor.platform && config?.platforms[editor.platform].ready;
  const drafts = workspace.content.filter((item) => item.kind === kind && (filter === "all" || item.platform === filter));

  useEffect(() => {
    const controller = new AbortController();
    api<ContentCapabilities>(`${base}/config`, { signal: controller.signal }).then(setConfig).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [base]);
  useEffect(() => { if (review) dialog.current?.showModal(); }, [review]);

  function change<K extends keyof ContentInput>(key: K, value: ContentInput[K]) { setEditor((current) => ({ ...current, [key]: value })); setNotice(""); }
  function select(draft: ContentDraft | null) {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setSaved(draft); setEditor(draft ? { kind: draft.kind, platform: draft.platform, title: draft.title, body: draft.body, excerpt: draft.excerpt, keywords: draft.keywords, imageUrl: draft.imageUrl } : blank(kind));
    setError(""); setNotice(""); setTopic("");
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  }
  async function save() {
    await run(async () => {
      const draft = await api<ContentDraft>(saved ? `${base}/${saved.id}` : base, { method: saved ? "PUT" : "POST", body: JSON.stringify(editor) });
      setSaved(draft); setEditor({ ...editor, title: draft.title, body: draft.body, excerpt: draft.excerpt, keywords: draft.keywords, imageUrl: draft.imageUrl });
      setNotice("Draft saved."); onChanged();
    });
  }
  async function generate() {
    if (editor.body && !window.confirm("Replace the editor content with a generated draft?")) return;
    await run(async () => {
      const result = await api<ContentInput>(`${base}/generate`, { method: "POST", body: JSON.stringify({ kind, platform: editor.platform, topic, tone, keywords: editor.keywords }) });
      setEditor({ ...result, imageUrl: editor.imageUrl }); setNotice("Draft generated. Review and save your changes.");
    });
  }
  async function publish() {
    if (!saved || !approved) return;
    setReview(false);
    await run(async () => {
      try {
        const draft = await api<ContentDraft>(`${base}/${saved.id}/publish`, { method: "POST", body: JSON.stringify({ approved: true, updatedAt: saved.updatedAt }) });
        setSaved(draft); setNotice("Post published successfully.");
      } finally {
        onChanged();
        const fresh = await api<ProjectWorkspace>(`/projects/${projectId}`);
        const latest = fresh.content.find((item) => item.id === saved.id);
        if (latest) setSaved(latest);
      }
    });
  }
  function download() {
    const blob = new Blob([kind === "blog" ? `# ${editor.title}\n\n${editor.body}\n` : editor.body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${editor.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 80) || "draft"}.${kind === "blog" ? "md" : "txt"}`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="content-studio">
    <div className="studio-intro"><div><span className="eyebrow">CONTENT STUDIO</span><h2>{kind === "social" ? "Your next conversation starts here" : "Turn your expertise into useful articles"}</h2><p className="muted">{kind === "social" ? "Create, review and publish posts for Instagram, LinkedIn and Facebook." : "Generate and edit blog drafts using your business memory, then export as Markdown."}</p></div><button className="button secondary" onClick={() => select(null)} disabled={busy}><Plus size={16} /> New {kind === "social" ? "post" : "blog"}</button></div>
    {error && <div className="alert error" role="alert">{error}<button className="icon-button" aria-label="Dismiss content error" onClick={() => setError("")}><X size={16} /></button></div>}
    {notice && <div className="alert success" role="status"><Check size={16} />{notice}</div>}
    {kind === "social" && <div className="studio-platforms">{(Object.keys(socialPlatforms) as SocialPlatform[]).map((platform) => { const Icon = icons[platform]; return <button key={platform} className={`studio-platform ${editor.platform === platform ? "selected" : ""}`} aria-pressed={editor.platform === platform} onClick={() => change("platform", platform)} disabled={busy || readOnly}><Icon size={21} /><div><strong>{socialPlatforms[platform]}</strong><span>{config ? config.platforms[platform].label : "Checking connection…"}</span></div><span className={`pill ${config?.platforms[platform].ready ? "studio-connected" : ""}`}>{config?.platforms[platform].ready ? "Configured" : "Not connected"}</span></button>; })}</div>}
    <div className="studio-columns">
      <div>
        <section className="panel"><div className="panel-heading"><div><h2><Sparkles size={17} /> Start with an idea</h2><p>Generate a draft from your topic and saved business memory.</p></div></div><div className="form-body"><label>Topic or brief<textarea rows={3} value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={2000} placeholder={kind === "social" ? "What would you like to share with your audience?" : "What should this article explain or help readers do?"} disabled={busy || readOnly} /></label><div className="form-grid"><label>Tone<select value={tone} onChange={(event) => setTone(event.target.value as GenerationInput["tone"])} disabled={busy || readOnly}><option value="professional">Professional</option><option value="friendly">Friendly</option><option value="educational">Educational</option><option value="bold">Bold</option></select></label><label>Keywords<input value={editor.keywords} onChange={(event) => change("keywords", event.target.value)} maxLength={500} placeholder="e.g. analytics, small business" disabled={busy || readOnly} /></label></div><div className="studio-generate"><span className="muted">{config?.generation ? "Uses AI credits. Review all generated facts." : "AI generation needs an API key and model. You can write your draft below."}</span><button className="button primary" onClick={generate} disabled={busy || readOnly || !topic.trim() || !config?.generation}><Sparkles size={15} /> Generate draft</button></div></div></section>
        <form className="panel" onSubmit={(event) => { event.preventDefault(); void save(); }}><div className="panel-heading"><h2>{kind === "social" ? "Post editor" : "Blog editor"}</h2><span className="pill">{dirty ? "Unsaved changes" : saved ? statusLabels[saved.status] : "New draft"}</span></div><div className="form-body"><fieldset className="studio-fields" disabled={busy || readOnly}><label>{kind === "social" ? "Internal title" : "Article title"}<input required maxLength={200} value={editor.title} onChange={(event) => change("title", event.target.value)} placeholder={kind === "social" ? "A name to find this post later" : "Give your article a clear title"} /></label>{kind === "blog" && <label>Excerpt<textarea maxLength={500} rows={2} value={editor.excerpt} onChange={(event) => change("excerpt", event.target.value)} placeholder="A short summary of your article" /></label>}<label>{kind === "social" ? "Caption" : "Article body (Markdown)"}<textarea required rows={kind === "social" ? 8 : 16} maxLength={editor.platform ? limits[editor.platform] : 50000} value={editor.body} onChange={(event) => change("body", event.target.value)} placeholder={kind === "social" ? "Write your caption, including any hashtags…" : "Write your article here. Use ## for section headings…"} /></label><div className="studio-counter muted">{kind === "social" ? `${editor.body.length.toLocaleString()} / ${limits[editor.platform!].toLocaleString()} characters` : `${editor.body.trim() ? editor.body.trim().split(/\s+/).length : 0} words`}</div>{kind === "social" && editor.platform === "instagram" && <label>Image URL<input type="url" value={editor.imageUrl} onChange={(event) => change("imageUrl", event.target.value)} placeholder="https://example.com/photo.jpg" /><span className="muted">Instagram needs a publicly accessible HTTPS JPEG image.</span></label>}</fieldset><div className="form-actions"><button className="button secondary" type="button" disabled={busy || !editor.body} onClick={() => run(async () => { await navigator.clipboard.writeText(editor.body); setNotice("Content copied."); })}><Copy size={15} /> Copy</button><button className="button secondary" type="button" onClick={download} disabled={busy || !editor.body}><Download size={15} /> Export</button>{!readOnly && <button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Save draft</button>}</div></div></form>
      </div>
      <div><section className="panel"><div className="panel-heading"><h2>Preview</h2>{editor.platform && <span className="pill">{socialPlatforms[editor.platform]}</span>}</div><div className="studio-preview">{kind === "social" && <div className="studio-author"><span>{workspace.project.name.slice(0, 1).toUpperCase()}</span><div><strong>{workspace.project.name}</strong><small>{editor.platform === "instagram" ? "Image and caption post" : "Text post"}</small></div></div>}{kind === "blog" && <><h2>{editor.title || "Your article title"}</h2><p className="muted">{editor.excerpt}</p></>}<div className="studio-body">{editor.body || "Your draft preview will appear here."}</div>{kind === "social" && editor.platform === "instagram" && <div className="studio-image-note"><Instagram size={18} /><span>{editor.imageUrl ? "Image URL attached. Instagram will fetch it when you publish." : "Add an image URL to complete your Instagram post."}</span></div>}</div>{kind === "social" && <div className="studio-publish"><p className="muted">{readOnly ? `${statusLabels[saved!.status]}${saved?.externalId ? ` · Receipt: ${saved.externalId}` : ". Verify the account before posting again."}` : dirty || !saved ? "Save your draft before reviewing it for publication." : !canPublish ? "Connect this platform’s account to publish directly." : `Ready to publish to ${config?.platforms[editor.platform!].label}.`}</p><button className="button primary" onClick={() => { setApproved(false); setReview(true); }} disabled={busy || !canPublish}><Send size={15} /> Review & publish</button></div>}</section>
      <section className="panel"><div className="panel-heading"><div><h2>Saved {kind === "social" ? "posts" : "blogs"}</h2><p>{drafts.length} {drafts.length === 1 ? "item" : "items"}</p></div>{kind === "social" && <select aria-label="Filter saved posts by platform" className="studio-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All platforms</option>{Object.entries(socialPlatforms).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>}</div><div className="studio-library">{drafts.length ? drafts.map((draft) => <div className={`studio-draft ${saved?.id === draft.id ? "selected" : ""}`} key={draft.id}><button className="studio-draft-select" onClick={() => select(draft)} disabled={busy}><strong>{draft.title}</strong><span>{draft.platform ? socialPlatforms[draft.platform] : "Blog"} · {new Date(draft.updatedAt).toLocaleDateString()}</span><span className="pill">{statusLabels[draft.status]}</span></button>{draft.status === "draft" && <button className="icon-button" aria-label={`Delete draft: ${draft.title}`} disabled={busy} onClick={() => { if (!window.confirm(`Delete “${draft.title}”?`)) return; void run(async () => { await api(`${base}/${draft.id}`, { method: "DELETE" }); if (saved?.id === draft.id) { setSaved(null); setEditor(blank(kind)); } onChanged(); setNotice("Draft deleted."); }); }}><Trash2 size={15} /></button>}</div>) : <div className="studio-empty">{kind === "social" ? <FileText size={25} /> : <BookOpen size={25} />}<p>No saved {kind === "social" ? "posts" : "blogs"} yet.</p><span>Write or generate your first draft to get started.</span></div>}</div></section></div>
    </div>
    {review && <dialog ref={dialog} className="modal" aria-labelledby="publish-title" onCancel={() => setReview(false)}><div className="modal-header"><h2 id="publish-title">Publish to {editor.platform && socialPlatforms[editor.platform]}?</h2><button className="icon-button" aria-label="Close publication review" onClick={() => setReview(false)}><X size={19} /></button></div><p className="muted">Account: {editor.platform && config?.platforms[editor.platform].label}. This will publish the saved post immediately.</p><div className="studio-review-body">{editor.body}</div>{editor.platform === "instagram" && <p className="muted">Image: {editor.imageUrl}</p>}<label className="checkbox-label"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />I have reviewed this content and approve publishing it.</label><div className="form-actions"><button className="button secondary" onClick={() => setReview(false)}>Cancel</button><button className="button primary" disabled={!approved || busy} onClick={publish}><Send size={15} /> Publish now</button></div></dialog>}
  </div>;
}
