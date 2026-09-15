import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  Hash,
  FileText,
  MessageSquare,
  ChevronRight,
  AlertCircle,
  PlayCircle,
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

interface QASection {
  passed?: boolean;
  issues?: string[];
}

interface QAResults {
  passed?: boolean;
  brandQA?: QASection;
  claimsQA?: QASection;
  productQA?: QASection;
  recommendation?: string;
  error?: string;
  raw?: string;
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

function wordCount(text: string | null): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

const SOCIAL_PLATFORMS = new Set(["facebook", "instagram", "tiktok", "linkedin"]);

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
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);
  const [previewedIds, setPreviewedIds] = useState<Set<string>>(new Set());
  const [confirmingItem, setConfirmingItem] = useState<ContentItem | null>(null);

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
      toast({ title: "Content item approved & publishing" });
      invalidate();
      setConfirmingItem(null);
      setPreviewItem(null);
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

  const openPreview = (item: ContentItem) => {
    setPreviewItem(item);
    if (!previewedIds.has(item.id)) {
      setPreviewedIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
    }
  };

  const requestApprove = (item: ContentItem) => {
    if (!previewedIds.has(item.id)) {
      toast({
        title: "Preview required",
        description: "Review the content before approving.",
      });
      openPreview(item);
      return;
    }
    setConfirmingItem(item);
  };

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
            {items.map((item) => (
              <ContentItemCard
                key={item.id}
                item={item}
                previewed={previewedIds.has(item.id)}
                onOpen={() => openPreview(item)}
                onApprove={() => requestApprove(item)}
                onTrigger={(action) =>
                  trigger.mutate({ action, contentItemId: item.id })
                }
                approvePending={approve.isPending}
                triggerPending={trigger.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <ContentPreviewModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onApprove={() => {
          if (previewItem) requestApprove(previewItem);
        }}
        onTrigger={(action, itemId) =>
          trigger.mutate({ action, contentItemId: itemId })
        }
        triggerPending={trigger.isPending}
        approvePending={approve.isPending}
      />

      <AlertDialog
        open={!!confirmingItem}
        onOpenChange={(open) => {
          if (!open) setConfirmingItem(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve & publish?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmingItem?.platform &&
              SOCIAL_PLATFORMS.has(confirmingItem.platform) &&
              confirmingItem.videoUrl
                ? `This will publish to ${confirmingItem.platform} immediately. This action cannot be undone from here.`
                : "This will mark the item approved and published. Auto-publish will run if the platform and video are ready."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approve.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={approve.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmingItem) approve.mutate(confirmingItem.id);
              }}
            >
              {approve.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Approving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Approve & Publish
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContentItemCard({
  item,
  previewed,
  onOpen,
  onApprove,
  onTrigger,
  approvePending,
  triggerPending,
}: {
  item: ContentItem;
  previewed: boolean;
  onOpen: () => void;
  onApprove: () => void;
  onTrigger: (action: EmberAction) => void;
  approvePending: boolean;
  triggerPending: boolean;
}) {
  const canApprove = item.status !== "published" && item.status !== "approved";
  const canGenerateHeygen = item.type === "heygen_video" && !item.videoUrl;
  const canGenerateHiggsfield =
    item.type === "higgsfield_video" && !item.videoUrl;
  const canPublish =
    item.status === "approved" &&
    !!item.videoUrl &&
    item.platform !== null &&
    SOCIAL_PLATFORMS.has(item.platform);

  const brief = item.creativeBrief as { concept?: string } | null;
  const scriptWords = wordCount(item.script);
  const hashtagCount = item.hashtags?.length ?? 0;

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <Card
      onClick={onOpen}
      className="cursor-pointer hover:bg-muted/50 transition-colors"
    >
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
              {previewed && (
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                  <Eye className="w-3 h-3 mr-1" />
                  Reviewed
                </Badge>
              )}
            </div>
            {brief?.concept && (
              <div className="text-sm mt-1.5">{brief.concept}</div>
            )}
            {item.caption && (
              <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {item.caption}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {scriptWords > 0 && (
                <span className="inline-flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {scriptWords} word{scriptWords === 1 ? "" : "s"}
                </span>
              )}
              {hashtagCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  {hashtagCount}
                </span>
              )}
              {item.videoUrl && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <PlayCircle className="w-3 h-3" />
                  video ready
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {canGenerateHeygen && (
              <Button
                size="sm"
                variant="outline"
                disabled={triggerPending}
                onClick={stop(() => onTrigger("generate_heygen_video"))}
              >
                <Film className="w-3.5 h-3.5 mr-1.5" />
                Generate
              </Button>
            )}
            {canGenerateHiggsfield && (
              <Button
                size="sm"
                variant="outline"
                disabled={triggerPending}
                onClick={stop(() => onTrigger("generate_higgsfield_video"))}
              >
                <Video className="w-3.5 h-3.5 mr-1.5" />
                Generate
              </Button>
            )}
            {canApprove && (
              <Button
                size="sm"
                disabled={approvePending}
                onClick={stop(onApprove)}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Approve & Publish
              </Button>
            )}
            {canPublish && (
              <Button
                size="sm"
                variant="outline"
                disabled={triggerPending}
                onClick={stop(() => onTrigger("publish_to_social"))}
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
}

function QABlock({ label, section }: { label: string; section?: QASection }) {
  if (!section) return null;
  const passed = !!section.passed;
  const issues = Array.isArray(section.issues) ? section.issues : [];
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 font-medium">
        {passed ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        ) : (
          <AlertCircle className="w-4 h-4 text-red-600" />
        )}
        <span>{label}</span>
        <Badge
          variant="secondary"
          className={
            passed
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }
        >
          {passed ? "passed" : "failed"}
        </Badge>
      </div>
      {issues.length > 0 && (
        <ul className="mt-1 ml-6 list-disc text-xs text-red-600 space-y-0.5">
          {issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContentPreviewModal({
  item,
  onClose,
  onApprove,
  onTrigger,
  triggerPending,
  approvePending,
}: {
  item: ContentItem | null;
  onClose: () => void;
  onApprove: () => void;
  onTrigger: (action: EmberAction, itemId: string) => void;
  triggerPending: boolean;
  approvePending: boolean;
}) {
  const [briefOpen, setBriefOpen] = useState(false);

  if (!item) {
    return (
      <Dialog open={false} onOpenChange={(open) => !open && onClose()}>
        <DialogContent />
      </Dialog>
    );
  }

  const brief = (item.creativeBrief ?? null) as Record<string, unknown> | null;
  const qa = (item.qaResults ?? null) as QAResults | null;
  const scriptChars = item.script?.length ?? 0;
  const scriptWords = wordCount(item.script);
  const canGenerateVideo =
    !item.videoUrl &&
    (item.type === "heygen_video" || item.type === "higgsfield_video");
  const generateAction: EmberAction =
    item.type === "higgsfield_video"
      ? "generate_higgsfield_video"
      : "generate_heygen_video";
  const canApprove = item.status !== "published" && item.status !== "approved";
  const canPublish =
    item.status === "approved" &&
    !!item.videoUrl &&
    item.platform !== null &&
    SOCIAL_PLATFORMS.has(item.platform);

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8">
            {typeBadge(item.type)}
            {item.platform && (
              <Badge variant="outline" className="capitalize">
                {item.platform}
              </Badge>
            )}
            {statusBadge(item.status)}
          </div>
          <DialogTitle className="sr-only">Content preview</DialogTitle>
        </DialogHeader>

        {/* Section 1 — Video */}
        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Video
          </div>
          {item.videoUrl ? (
            <>
              <video
                src={item.videoUrl}
                controls
                className="w-full rounded-lg max-h-96 bg-black"
                poster={item.thumbnailUrl ?? undefined}
              />
              <a
                href={item.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Open full size
              </a>
            </>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/40 py-8 px-4 text-center space-y-3">
              <div className="text-3xl">🎬</div>
              <div className="text-sm text-muted-foreground">
                Video not yet generated
              </div>
              {canGenerateVideo && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={triggerPending}
                  onClick={() => onTrigger(generateAction, item.id)}
                >
                  {item.type === "higgsfield_video" ? (
                    <Video className="w-3.5 h-3.5 mr-1.5" />
                  ) : (
                    <Film className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Generate Video
                </Button>
              )}
            </div>
          )}
        </section>

        {/* Section 2 — Script */}
        {item.script && (
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Script
              </div>
              <div className="text-xs text-muted-foreground">
                {scriptWords} words · {scriptChars} chars
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 max-h-64 overflow-y-auto font-mono text-xs whitespace-pre-wrap">
              {item.script}
            </div>
          </section>
        )}

        {/* Section 3 — Caption */}
        {item.caption && (
          <section className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />
              Caption
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {item.caption}
            </div>
          </section>
        )}

        {/* Section 4 — Hashtags + CTA */}
        {(!!(item.hashtags && item.hashtags.length) || !!item.cta) && (
          <section className="space-y-2">
            {item.hashtags && item.hashtags.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Hashtags
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.hashtags.map((tag, i) => (
                    <Badge key={`${tag}-${i}`} variant="secondary" className="text-xs">
                      #{tag.replace(/^#/, "")}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {item.cta && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Call to action
                </div>
                <div className="text-sm">{item.cta}</div>
              </div>
            )}
          </section>
        )}

        {/* Section 5 — QA */}
        {qa && (
          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              QA results
            </div>
            <div className="space-y-2">
              <QABlock label="Brand QA" section={qa.brandQA} />
              <QABlock label="Claims QA" section={qa.claimsQA} />
              <QABlock label="Product QA" section={qa.productQA} />
              {qa.recommendation && (
                <div className="text-xs text-muted-foreground">
                  Recommendation: <span className="font-medium">{qa.recommendation}</span>
                </div>
              )}
              {qa.error && (
                <div className="text-xs text-red-600">QA parse error: {qa.error}</div>
              )}
            </div>
          </section>
        )}

        {/* Section 6 — Creative brief */}
        {brief && Object.keys(brief).length > 0 && (
          <Collapsible open={briefOpen} onOpenChange={setBriefOpen}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${briefOpen ? "rotate-90" : ""}`}
              />
              Creative brief
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <dl className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
                {Object.entries(brief).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[7rem_1fr] gap-2">
                    <dt className="font-medium text-muted-foreground capitalize">{k}</dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                    </dd>
                  </div>
                ))}
              </dl>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {canPublish && (
            <Button
              size="sm"
              variant="outline"
              disabled={triggerPending}
              onClick={() => onTrigger("publish_to_social", item.id)}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Publish now
            </Button>
          )}
          {canApprove && (
            <Button
              size="sm"
              disabled={approvePending}
              onClick={onApprove}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Approve & Publish
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
