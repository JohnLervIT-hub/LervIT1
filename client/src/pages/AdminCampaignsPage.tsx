import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  Megaphone,
  Film,
  Video,
  Send,
  ExternalLink,
  Eye,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";

type CampaignStatus = "draft" | "active" | "completed" | "paused";
type ItemStatus =
  | "draft"
  | "generating"
  | "qa"
  | "approved"
  | "published"
  | "failed";
type EmberAction =
  | "generate_heygen_video"
  | "generate_higgsfield_video"
  | "publish_to_social";

interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  audience: string;
  platforms: string[] | null;
  status: CampaignStatus | null;
  startDate: string | null;
  endDate: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

interface ContentItem {
  id: string;
  campaignId: string | null;
  type: string;
  objective: string | null;
  platform: string | null;
  status: ItemStatus | null;
  script: string | null;
  creativeBrief: unknown;
  caption: string | null;
  hashtags: string[] | null;
  cta: string | null;
  aspectRatio: string | null;
  generator: string | null;
  providerJobId: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  assetUrl: string | null;
  qaResults: unknown;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  costEstimate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CampaignDetail {
  campaign: CampaignRow & { contentPlan: unknown; offer: string | null; durationDays: number | null };
  items: ContentItem[];
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  generating: "bg-blue-100 text-blue-700",
  qa: "bg-purple-100 text-purple-700",
  approved: "bg-teal-100 text-teal-700",
  published: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

function statusBadge(status: string | null) {
  const s = status ?? "draft";
  return (
    <Badge variant="secondary" className={STATUS_TONE[s] ?? "bg-slate-100 text-slate-700"}>
      {s}
    </Badge>
  );
}

function typeBadge(type: string) {
  const label =
    type === "heygen_video"
      ? "HeyGen"
      : type === "higgsfield_video"
        ? "Higgsfield"
        : type;
  return (
    <Badge variant="outline" className="capitalize">
      {label}
    </Badge>
  );
}

export default function AdminCampaignsPage() {
  const params = useParams<{ id?: string }>();
  const selectedId = params.id;

  if (selectedId) {
    return <CampaignDetailView campaignId={selectedId} />;
  }
  return <CampaignListView />;
}

function CampaignListView() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery<{ campaigns: CampaignRow[] }>({
    queryKey: ["/api/admin/campaigns"],
  });

  const create = useMutation({
    mutationFn: async (input: {
      name: string;
      objective: string;
      audience: string;
      platforms?: string[];
    }) => {
      const res = await apiRequest("POST", "/api/admin/agent/ember/trigger", {
        action: "create_campaign",
        input,
        dry_run: false,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign queued",
        description: "Ember is drafting the content plan. Refresh in a moment.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
    },
    onError: (err: any) => {
      toast({
        title: "Create failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const promptForCampaign = () => {
    const name = window.prompt("Campaign name?");
    if (!name) return;
    const objective =
      window.prompt("Objective (awareness | conversion | retention)?") ?? "awareness";
    const audience =
      window.prompt("Audience (e.g. Calgary residents 25-45)?") ?? "Calgary residents";
    const platformsRaw =
      window.prompt("Platforms (comma-separated: instagram,tiktok,facebook)?") ??
      "instagram,tiktok,facebook";
    const platforms = platformsRaw
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    create.mutate({ name, objective, audience, platforms });
  };

  const rows = data?.campaigns ?? [];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" />
          Admin
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-orange-500" />
            Ember Campaigns
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-item content plans generated by Ember Lane.
          </p>
        </div>
        <Button onClick={promptForCampaign} disabled={create.isPending}>
          {create.isPending ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-1.5" />
          )}
          Create Campaign
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading campaigns…
        </div>
      )}
      {error && (
        <div className="text-sm text-red-600">
          Failed to load campaigns: {(error as Error).message}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No campaigns yet. Click "Create Campaign" to generate one.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {rows.map((c) => (
          <Card key={c.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-base truncate">{c.name}</span>
                    {statusBadge(c.status)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {c.objective} · {c.audience}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(c.platforms ?? []).map((p) => (
                      <Badge key={p} variant="outline" className="capitalize text-xs">
                        {p}
                      </Badge>
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">
                      · {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      · created {format(new Date(c.createdAt), "PP")}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/admin/campaigns/${c.id}`)}
                >
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  View
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CampaignDetailView({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<CampaignDetail>({
    queryKey: [`/api/admin/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/campaigns/${campaignId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
  };

  const approve = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/campaigns/${campaignId}/approve/${itemId}`,
        {},
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Content item approved" });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Approve failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const trigger = useMutation({
    mutationFn: async ({ action, contentItemId }: { action: EmberAction; contentItemId: string }) => {
      const res = await apiRequest("POST", "/api/admin/agent/ember/trigger", {
        action,
        input: { contentItemId },
        dry_run: false,
      });
      return res.json();
    },
    onSuccess: (payload, { action }) => {
      const label =
        action === "generate_heygen_video"
          ? "HeyGen video"
          : action === "generate_higgsfield_video"
            ? "Higgsfield video"
            : "Publish to social";
      toast({
        title: `Ember queued — ${label}`,
        description: `Job ${payload?.jobId ?? ""} runs in background.`,
      });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Ember trigger failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading campaign…
        </div>
      </div>
    );
  }

  if (error || !data?.campaign) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-6 space-y-3">
        <Link href="/admin/campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to campaigns
        </Link>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {error ? (error as Error).message : "Campaign not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { campaign, items } = data;
  const socialPlatforms = new Set(["facebook", "instagram", "tiktok", "linkedin"]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-4">
      <Link
        href="/admin/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to campaigns
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {campaign.name}
                {statusBadge(campaign.status)}
              </CardTitle>
              <CardDescription className="mt-1">
                {campaign.objective} · {campaign.audience}
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              Created {format(new Date(campaign.createdAt), "PPp")}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {(campaign.platforms ?? []).map((p) => (
              <Badge key={p} variant="outline" className="capitalize">
                {p}
              </Badge>
            ))}
            {campaign.offer && (
              <Badge variant="secondary" className="ml-1">
                Offer: {campaign.offer}
              </Badge>
            )}
            {campaign.durationDays && (
              <span className="text-xs text-muted-foreground ml-1">
                · {campaign.durationDays} days
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Content items ({items.length})
        </h2>
        {items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No content items yet. Ember may still be drafting.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {items.map((item) => {
              const canApprove = item.status !== "published" && item.status !== "approved";
              const canGenerateHeygen = item.type === "heygen_video" && !item.videoUrl;
              const canGenerateHiggsfield =
                item.type === "higgsfield_video" && !item.videoUrl;
              const canPublish =
                item.status === "approved" &&
                !!item.videoUrl &&
                item.platform !== null &&
                socialPlatforms.has(item.platform);
              return (
                <Card key={item.id}>
                  <CardContent className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {typeBadge(item.type)}
                          {item.platform && (
                            <Badge variant="outline" className="capitalize">
                              {item.platform}
                            </Badge>
                          )}
                          {statusBadge(item.status)}
                          {!!item.qaResults && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                              QA
                            </Badge>
                          )}
                        </div>
                        {(() => {
                          const brief = item.creativeBrief as { concept?: string } | null;
                          return brief?.concept ? (
                            <div className="text-sm mt-1.5">{brief.concept}</div>
                          ) : null;
                        })()}
                        {item.script && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {item.script}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.videoUrl && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={item.videoUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                              Preview
                            </a>
                          </Button>
                        )}
                        {canGenerateHeygen && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={trigger.isPending}
                            onClick={() =>
                              trigger.mutate({
                                action: "generate_heygen_video",
                                contentItemId: item.id,
                              })
                            }
                          >
                            <Film className="w-3.5 h-3.5 mr-1.5" />
                            Generate
                          </Button>
                        )}
                        {canGenerateHiggsfield && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={trigger.isPending}
                            onClick={() =>
                              trigger.mutate({
                                action: "generate_higgsfield_video",
                                contentItemId: item.id,
                              })
                            }
                          >
                            <Video className="w-3.5 h-3.5 mr-1.5" />
                            Generate
                          </Button>
                        )}
                        {canApprove && (
                          <Button
                            size="sm"
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(item.id)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Approve
                          </Button>
                        )}
                        {canPublish && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={trigger.isPending}
                            onClick={() =>
                              trigger.mutate({
                                action: "publish_to_social",
                                contentItemId: item.id,
                              })
                            }
                          >
                            <Send className="w-3.5 h-3.5 mr-1.5" />
                            Publish
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
