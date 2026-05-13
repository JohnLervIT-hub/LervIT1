import { FileText, BookOpen, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DOCS = [
  {
    title: "12-Month Product Development Roadmap",
    description:
      "Production-aligned quarterly roadmap covering Q1–Q4 2026 through Q1 2027. Includes confirmed working features, known production gaps, schema improvements, and prioritised engineering milestones.",
    href: "/api/downloads/roadmap",
    icon: BookOpen,
    type: "Markdown",
  },
  {
    title: "Technical Brief (PDF)",
    description:
      "One-page architecture overview covering the full stack, AI capabilities, enterprise partner portal, security model, and live production metrics. Suitable for technical due diligence or partner onboarding.",
    href: "/LervIT-Technical-Brief.pdf",
    icon: FileText,
    type: "PDF",
  },
];

export default function Downloads() {
  function open(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Each document opens in a new tab — use your browser's save option to download.
          </p>
        </div>

        <div className="space-y-3">
          {DOCS.map((doc) => {
            const Icon = doc.icon;
            return (
              <Card key={doc.href}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold leading-snug">{doc.title}</p>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">
                          {doc.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {doc.description}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1"
                        onClick={() => open(doc.href)}
                        data-testid={`button-open-${doc.type}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Open in new tab
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Once the document is open in a new tab, press{" "}
          <kbd className="px-1.5 py-0.5 rounded border text-xs font-mono">Ctrl+S</kbd>{" "}
          /{" "}
          <kbd className="px-1.5 py-0.5 rounded border text-xs font-mono">Cmd+S</kbd>{" "}
          to save it to your device.
        </p>
      </div>
    </div>
  );
}
