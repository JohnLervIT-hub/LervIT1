import { FileText, Download, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DOCS = [
  {
    title: "12-Month Product Development Roadmap",
    description:
      "Production-aligned quarterly roadmap covering Q1–Q4 2026 through Q1 2027. Includes confirmed working features, known production gaps, schema improvements, and prioritised engineering milestones.",
    href: "/api/downloads/roadmap",
    filename: "LervIT-12-Month-Dev-Roadmap.md",
    icon: BookOpen,
  },
  {
    title: "Technical Brief",
    description:
      "One-page architecture overview covering the full stack, AI capabilities, enterprise partner portal, security model, and live production metrics. Suitable for technical due diligence or partner onboarding.",
    href: "/api/downloads/technical-brief",
    filename: "LervIT-Technical-Brief.md",
    icon: FileText,
  },
];

export default function Downloads() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Click a document below to download it.
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
                      <p className="text-sm font-semibold leading-snug">
                        {doc.title}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {doc.description}
                      </p>
                      <a href={doc.href} download={doc.filename}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          data-testid={`button-download-${doc.filename}`}
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          Download
                        </Button>
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
