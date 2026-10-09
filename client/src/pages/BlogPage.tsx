import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Calendar } from "lucide-react";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category: string | null;
  tags: string[] | null;
  image: string | null;
  readTime: number | null;
  publishedAt: string | null;
}

interface BlogPostFull extends BlogPost {
  content: string;
  author: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Single post view ────────────────────────────────────────────────────────

function PostView({ slug }: { slug: string }) {
  const [post, setPost] = useState<BlogPostFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/blog/${slug}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => { if (data) { setPost(data); setLoading(false); } })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-16 text-muted-foreground">Loading…</div>;
  if (notFound || !post) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <p className="text-muted-foreground mb-4">Post not found.</p>
      <Link href="/blog" className="text-primary underline underline-offset-4">← Back to blog</Link>
    </div>
  );

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> All posts
      </Link>

      {post.image && (
        <img src={post.image} alt={post.title} className="w-full rounded-xl mb-8 object-cover max-h-72" />
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {post.category && <Badge variant="secondary">{post.category}</Badge>}
        {(post.tags ?? []).map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
      </div>

      <h1 className="text-3xl font-bold mb-3 leading-tight">{post.title}</h1>

      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8">
        <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{formatDate(post.publishedAt)}</span>
        {post.readTime && <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{post.readTime} min read</span>}
        {post.author && <span>By {post.author}</span>}
      </div>

      <div
        className="prose prose-neutral max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
    </article>
  );
}

// ── Archive list ────────────────────────────────────────────────────────────

function ArchiveList() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/blog")
      .then((r) => r.json())
      .then((d) => { setPosts(d.posts ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-2">LERVIT Blog</h1>
      <p className="text-muted-foreground mb-10">Moving tips, Calgary guides, and company news.</p>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">No posts yet — check back soon.</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`}>
              <article className="group border rounded-xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
                {p.image && (
                  <img src={p.image} alt={p.title} className="w-full h-44 object-cover group-hover:opacity-90 transition-opacity" />
                )}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {p.category && <Badge variant="secondary" className="text-xs">{p.category}</Badge>}
                  </div>
                  <h2 className="font-semibold text-lg leading-snug mb-2 group-hover:text-primary transition-colors">{p.title}</h2>
                  {p.excerpt && <p className="text-sm text-muted-foreground line-clamp-3 flex-1">{p.excerpt}</p>}
                  <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
                    <span>{formatDate(p.publishedAt)}</span>
                    {p.readTime && <span>{p.readTime} min read</span>}
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Router ──────────────────────────────────────────────────────────────────

export default function BlogPage({ params }: { params?: { slug?: string } }) {
  return (
    <main className="min-h-screen bg-background pt-4 pb-20">
      {params?.slug ? <PostView slug={params.slug} /> : <ArchiveList />}
    </main>
  );
}
