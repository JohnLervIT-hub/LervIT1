import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Calendar, Mail } from "lucide-react";

interface NewsletterSummary {
  id: string;
  subject: string;
  preheader: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface NewsletterFull extends NewsletterSummary {
  html: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Single issue view ───────────────────────────────────────────────────────

function IssueView({ id }: { id: string }) {
  const [issue, setIssue] = useState<NewsletterFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/newsletters/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => { if (data) { setIssue(data); setLoading(false); } })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-16 text-muted-foreground">Loading…</div>;
  if (notFound || !issue) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <p className="text-muted-foreground mb-4">Issue not found.</p>
      <Link href="/newsletters" className="text-primary underline underline-offset-4">← Back to newsletters</Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link href="/newsletters" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> All issues
      </Link>

      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
        <Calendar className="w-4 h-4" />
        <span>{formatDate(issue.sentAt)}</span>
      </div>

      <h1 className="text-2xl font-bold mb-2">{issue.subject}</h1>
      {issue.preheader && <p className="text-muted-foreground mb-8">{issue.preheader}</p>}

      {/* Render the newsletter HTML in an isolated container */}
      <div
        className="border rounded-xl overflow-hidden"
        dangerouslySetInnerHTML={{ __html: issue.html }}
      />
    </div>
  );
}

// ── Archive list ────────────────────────────────────────────────────────────

function ArchiveList() {
  const [issues, setIssues] = useState<NewsletterSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/newsletters")
      .then((r) => r.json())
      .then((d) => { setIssues(d.newsletters ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-16 text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-2">
        <Mail className="w-7 h-7 text-primary" />
        <h1 className="text-4xl font-bold">Newsletter Archive</h1>
      </div>
      <p className="text-muted-foreground mb-10">Past issues of the LERVIT monthly moving digest.</p>

      {issues.length === 0 ? (
        <p className="text-muted-foreground">No past issues yet — subscribe to get the first one.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {issues.map((n) => (
            <Link key={n.id} href={`/newsletters/${n.id}`}>
              <article className="group border rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatDate(n.sentAt)}</span>
                </div>
                <h2 className="font-semibold text-base group-hover:text-primary transition-colors">{n.subject}</h2>
                {n.preheader && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.preheader}</p>}
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Router ──────────────────────────────────────────────────────────────────

export default function NewsletterArchivePage({ params }: { params?: { id?: string } }) {
  return (
    <main className="min-h-screen bg-background pt-4 pb-20">
      {params?.id ? <IssueView id={params.id} /> : <ArchiveList />}
    </main>
  );
}
