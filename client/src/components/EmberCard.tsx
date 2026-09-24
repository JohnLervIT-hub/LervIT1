import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  FileText,
  CheckCircle2,
  FilePen,
  MapPin,
  Facebook,
  Instagram,
  Music2,
  Linkedin,
  Eye,
  Film,
  Video,
  Megaphone,
  Send,
} from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";

interface EmberStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  gmbPostsTotal: number;
  socialDraftsByPlatform: {
    facebook: number;
    instagram: number;
    tiktok: number;
    linkedin: number;
  };
  recentEvents: Array<{
    id: string;
    eventType: string;
    entityId: string | null;
    payload: Record<string, any> | null;
    createdAt: string;
  }>;
  // Phase 2 — campaigns + video generation
  activeCampaigns: number;
  videosGenerating: number;
  videosReady: number;
}

interface SocialPost {
  id: string;
  platform: string;
  content: string;
  hashtags: string[] | null;
  status: string | null;
  platformPostId: string | null;
  failureReason: string | null;
  postedAt: string | null;
  createdAt: string;
}

// social_posts holds copy only. Instagram needs an image or video container
// and TikTok has no publisher, so only these two can actually ship from here.
const PUBLISHABLE_PLATFORMS = new Set(["facebook", "linkedin"]);
const PUBLISHABLE_STATUSES = new Set(["draft", "approved", "failed"]);

type EmberAction =
  | "generate_blog_post"
  | "generate_gmb_post"
  | "generate_social_content"
  | "generate_newsletter"
  | "create_campaign"
  | "generate_heygen_video"
  | "generate_higgsfield_video"
  | "publish_to_social";

export function EmberCard() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<EmberStats>({
    queryKey: ["/api/admin/agent/ember/stats"],
  });

  const { data: socialData } = useQuery<{ posts: SocialPost[] }>({
    queryKey: ["/api/admin/ember/social-posts"],
  });

  const publishSocial = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(
        "PATCH",
        `/api/admin/ember/social-posts/${id}`,
        { action: "publish" },
      );
      return res.json();
    },
    onSuccess: (row: SocialPost) => {
      toast({
        title: `Published to ${row.platform}`,
        description: row.platformPostId
          ? `Post id ${row.platformPostId}`
          : "Live now.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/ember/social-posts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/agent/ember/stats"],
      });
    },
    onError: (err: any) => {
      // apiRequest throws `<status>: <body>`; dig out the server's detail so
      // the toast says why rather than showing a raw JSON blob.
      const raw = err?.message ?? "Unknown error";
      let detail = raw;
      const body = raw.slice(raw.indexOf(":") + 1).trim();
      try {
        detail = JSON.parse(body)?.detail ?? raw;
      } catch {
        /* not JSON — show the raw message */
      }
      toast({
        title: "Publish failed",
        description: detail,
        variant: "destructive",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/ember/social-posts"],
      });
    },
  });

  const trigger = useMutation({
    mutationFn: async ({
      action,
      dryRun,
      input,
    }: {
      action: EmberAction;
      dryRun: boolean;
      input?: Record<string, any>;
    }) => {
      const res = await apiRequest("POST", "/api/admin/agent/ember/trigger", {
        action,
        input: input ?? {},
        dry_run: dryRun,
      });
      return res.json();
    },
    onSuccess: (payload, { action, dryRun }) => {
      const label =
        action === "generate_blog_post"
          ? "Blog post"
          : action === "generate_gmb_post"
            ? "GMB post"
            : action === "generate_social_content"
              ? "Social posts"
              : action === "create_campaign"
                ? "Campaign"
                : action === "generate_heygen_video"
                  ? "HeyGen video"
                  : action === "generate_higgsfield_video"
                    ? "Higgsfield video"
                    : action === "publish_to_social"
                      ? "Publish to social"
                      : "Newsletter";
      toast({
        title: dryRun ? `Ember dry-run — ${label}` : `Ember queued — ${label}`,
        description: dryRun
          ? `Preview: ${JSON.stringify(payload?.result ?? {}).slice(0, 160)}`
          : `Job ${payload?.jobId ?? ""} runs in background.`,
      });
      if (!dryRun) {
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/agent/ember/stats"],
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Ember trigger failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <AgentAvatar agentKey="ember-lane" size="md" showName showRole />
            <CardDescription className="mt-1.5">
              Content & marketing · Blog drafts, GMB posts, social copy, newsletter · Calgary voice
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                trigger.mutate({ action: "generate_blog_post", dryRun: false })
              }
              disabled={trigger.isPending}
              data-testid="button-ember-blog"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Generate Blog Post
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                trigger.mutate({ action: "generate_gmb_post", dryRun: false })
              }
              disabled={trigger.isPending}
              data-testid="button-ember-gmb"
            >
              <MapPin className="w-3.5 h-3.5 mr-1.5" />
              Generate GMB Post
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                trigger.mutate({ action: "generate_social_content", dryRun: false })
              }
              disabled={trigger.isPending}
              data-testid="button-ember-social"
            >
              <Instagram className="w-3.5 h-3.5 mr-1.5" />
              Generate Social (All)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                trigger.mutate({ action: "generate_blog_post", dryRun: true })
              }
              disabled={trigger.isPending}
              data-testid="button-ember-preview"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Preview
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const name = window.prompt("Campaign name?");
                if (!name) return;
                const objective =
                  window.prompt("Objective (awareness, conversion, retention)?") ??
                  "awareness";
                const audience =
                  window.prompt("Audience (e.g. Calgary residents 25-45)?") ??
                  "Calgary residents";
                trigger.mutate({
                  action: "create_campaign",
                  dryRun: false,
                  input: {
                    name,
                    objective,
                    audience,
                    platforms: ["instagram", "facebook", "linkedin"],
                  },
                });
              }}
              disabled={trigger.isPending}
              data-testid="button-ember-campaign"
            >
              <Megaphone className="w-3.5 h-3.5 mr-1.5" />
              Create Campaign
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const contentItemId = window.prompt("Content item ID (must have script)?");
                if (!contentItemId) return;
                trigger.mutate({
                  action: "generate_heygen_video",
                  dryRun: false,
                  input: { contentItemId },
                });
              }}
              disabled={trigger.isPending}
              data-testid="button-ember-heygen"
            >
              <Film className="w-3.5 h-3.5 mr-1.5" />
              Generate HeyGen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const contentItemId = window.prompt("Content item ID?");
                if (!contentItemId) return;
                trigger.mutate({
                  action: "generate_higgsfield_video",
                  dryRun: false,
                  input: { contentItemId },
                });
              }}
              disabled={trigger.isPending}
              data-testid="button-ember-higgsfield"
            >
              <Video className="w-3.5 h-3.5 mr-1.5" />
              Generate Higgsfield
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const contentItemId = window.prompt(
                  "Content item ID (approved facebook/instagram item)?",
                );
                if (!contentItemId) return;
                trigger.mutate({
                  action: "publish_to_social",
                  dryRun: false,
                  input: { contentItemId },
                });
              }}
              disabled={trigger.isPending}
              data-testid="button-ember-publish-social"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Publish to Social
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading content snapshot…
          </div>
        )}
        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox
                label="Blog posts"
                value={data.totalPosts}
                icon={<FileText className="w-3 h-3" />}
                tone="neutral"
              />
              <StatBox
                label="Published"
                value={data.publishedPosts}
                icon={<CheckCircle2 className="w-3 h-3" />}
                tone="good"
              />
              <StatBox
                label="Drafts"
                value={data.draftPosts}
                icon={<FilePen className="w-3 h-3" />}
                tone="warm"
              />
              <StatBox
                label="GMB posts"
                value={data.gmbPostsTotal}
                icon={<MapPin className="w-3 h-3" />}
                tone="neutral"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox
                label="Campaigns"
                value={data.activeCampaigns}
                icon={<Megaphone className="w-3 h-3" />}
                tone="neutral"
              />
              <StatBox
                label="Videos generating"
                value={data.videosGenerating}
                icon={<Loader2 className="w-3 h-3" />}
                tone="warm"
              />
              <StatBox
                label="Videos ready"
                value={data.videosReady}
                icon={<Video className="w-3 h-3" />}
                tone="good"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox
                label="Facebook"
                value={data.socialDraftsByPlatform.facebook}
                icon={<Facebook className="w-3 h-3" />}
                tone="neutral"
              />
              <StatBox
                label="Instagram"
                value={data.socialDraftsByPlatform.instagram}
                icon={<Instagram className="w-3 h-3" />}
                tone="neutral"
              />
              <StatBox
                label="TikTok"
                value={data.socialDraftsByPlatform.tiktok}
                icon={<Music2 className="w-3 h-3" />}
                tone="neutral"
              />
              <StatBox
                label="LinkedIn"
                value={data.socialDraftsByPlatform.linkedin}
                icon={<Linkedin className="w-3 h-3" />}
                tone="neutral"
              />
            </div>

            {!!socialData?.posts?.length && (
              <div className="rounded-md border">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                  Social posts
                </div>
                <ul className="divide-y">
                  {socialData.posts.slice(0, 8).map((post) => {
                    const canPublish =
                      PUBLISHABLE_PLATFORMS.has(post.platform) &&
                      PUBLISHABLE_STATUSES.has(post.status ?? "draft");

                    return (
                      <li key={post.id} className="px-3 py-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-medium capitalize">
                              {post.platform}
                            </span>
                            <span
                              className={`text-xs ${socialStatusTone(post.status)}`}
                            >
                              {post.status ?? "draft"}
                            </span>
                          </div>
                          {canPublish ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0"
                              onClick={() => publishSocial.mutate(post.id)}
                              disabled={publishSocial.isPending}
                              data-testid={`button-publish-social-${post.id}`}
                            >
                              {publishSocial.isPending ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Send className="w-3 h-3 mr-1" />
                              )}
                              Publish
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {post.status === "published"
                                ? "live"
                                : "no publisher"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {post.content}
                        </p>
                        {!!post.failureReason && (
                          <p className="text-xs text-red-600 line-clamp-2">
                            {post.failureReason}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {data.recentEvents.length > 0 && (
              <div className="rounded-md border">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                  Recent events
                </div>
                <ul className="divide-y">
                  {data.recentEvents.slice(0, 5).map((e) => (
                    <li
                      key={e.id}
                      className="px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <span
                        className={`text-sm font-medium ${eventTone(e.eventType)}`}
                      >
                        {e.eventType.replace(/^agent\.ember\./, "")}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function socialStatusTone(status: string | null): string {
  if (status === "published" || status === "posted") return "text-emerald-600";
  if (status === "failed") return "text-red-600";
  if (status === "approved") return "text-blue-600";
  return "text-muted-foreground";
}

function eventTone(eventType: string): string {
  if (eventType.includes("publish_blog_post")) return "text-emerald-600";
  if (eventType.includes("generate_blog_post")) return "text-blue-600";
  if (eventType.includes("generate_gmb_post")) return "text-orange-600";
  if (eventType.includes("generate_social_content")) return "text-purple-600";
  if (eventType.includes("respond_to_review")) return "text-teal-600";
  if (eventType.includes("generate_newsletter")) return "text-indigo-600";
  return "text-foreground";
}

function StatBox({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  tone?: "good" | "warm" | "bad" | "neutral";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warm"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-foreground";
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
