import OpenAI from "openai";
import type { SupportTicket, SupportTicketReply, Booking, User } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface TicketContext {
  ticket: SupportTicket;
  replies: SupportTicketReply[];
  user?: User;
  relatedBooking?: Booking;
}

interface AiAnalysisResult {
  summary: string;
  category: string;
  suggestedPriority: "low" | "normal" | "high" | "urgent";
  rootCause: string;
  recommendations: string[];
  customerResponse: string;  // Professional, empathetic response for customers (NO technical details)
  internalNotes: string;     // Technical analysis for support staff only (NOT sent to customers)
  similarCases: string[];
  confidence: number;
  // Legacy field for backwards compatibility
  suggestedResponse?: string;
}

const SYSTEM_PROMPT = `You are an expert customer support analyst for LervIT, a premium moving marketplace platform in Calgary, Alberta. Your role is to analyze support tickets and provide actionable insights to help support staff resolve issues quickly and effectively.

LervIT Platform Context:
- Two-sided marketplace connecting customers with freelance movers
- Features: Real-time booking, GPS tracking, Stripe payments (CAD), AI-powered load estimation
- Common issue categories: Booking problems, payment disputes, mover complaints, technical issues, account access
- Priority levels: low (informational), normal (standard support), high (service impacted), urgent (safety/financial critical)

Your analysis should:
1. Understand the core issue from the customer's perspective
2. Identify the root cause based on platform knowledge
3. Provide specific, actionable recommendations for STAFF
4. Generate TWO separate response outputs:
   - customerResponse: A professional, warm, empathetic response to send to the customer
   - internalNotes: Technical analysis and debugging details for support staff ONLY
5. Estimate confidence in your analysis (0-100)

CRITICAL RULES FOR customerResponse:
- NEVER include API routes, endpoints, database details, or technical jargon
- NEVER mention error codes, JSON, logs, console warnings, or stack traces
- NEVER reference internal systems, session IDs, or technical infrastructure
- DO use warm, empathetic language that acknowledges the customer's frustration
- DO provide clear next steps in plain language
- DO apologize for any inconvenience and assure them the issue is being resolved
- Keep it professional but friendly - like a 5-star hotel concierge

CRITICAL RULES FOR internalNotes:
- Include all technical details: API routes, error codes, database issues, etc.
- Document the root cause analysis with technical specifics
- List debugging steps and system checks performed
- This is NEVER shown to customers - it's for staff reference only

Respond in JSON format only.`;

const ANALYSIS_PROMPT = `Analyze this support ticket and provide comprehensive insights:

TICKET DETAILS:
- Subject: {{subject}}
- Category: {{category}}
- Current Priority: {{priority}}
- Status: {{status}}
- Created: {{createdAt}}

CUSTOMER MESSAGE:
{{message}}

{{#if replies}}
CONVERSATION HISTORY:
{{replies}}
{{/if}}

{{#if bookingContext}}
RELATED BOOKING:
{{bookingContext}}
{{/if}}

Provide your analysis in this exact JSON structure:
{
  "summary": "2-3 sentence summary of the issue",
  "category": "booking|payment|mover|technical|account|general",
  "suggestedPriority": "low|normal|high|urgent",
  "rootCause": "Brief non-technical explanation of likely root cause",
  "recommendations": ["Staff Action 1", "Staff Action 2", "Staff Action 3"],
  "customerResponse": "Warm, empathetic response for the customer - NO technical details, API routes, or error codes. Write like a 5-star hotel concierge.",
  "internalNotes": "Technical details for staff only: API routes, error codes, database issues, debugging steps. NEVER send this to customers.",
  "similarCases": ["Similar issue type 1 and typical resolution", "Similar issue type 2 and typical resolution"],
  "confidence": 85
}`;

export async function analyzeTicket(context: TicketContext): Promise<AiAnalysisResult> {
  const startTime = Date.now();
  
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OpenAI API key not configured, returning fallback analysis");
    return getFallbackAnalysis(context.ticket);
  }

  try {
    const repliesText = context.replies.length > 0
      ? context.replies.map((r, i) => 
          `[${r.isStaff ? 'Staff' : 'Customer'}]: ${r.message}`
        ).join('\n')
      : '';

    const bookingContext = context.relatedBooking
      ? `Booking ID: ${context.relatedBooking.id}, Status: ${context.relatedBooking.status}, Amount: $${context.relatedBooking.price || 'N/A'}`
      : '';

    const prompt = ANALYSIS_PROMPT
      .replace('{{subject}}', context.ticket.subject)
      .replace('{{category}}', context.ticket.category)
      .replace('{{priority}}', context.ticket.priority)
      .replace('{{status}}', context.ticket.status)
      .replace('{{createdAt}}', context.ticket.createdAt?.toISOString() || 'Unknown')
      .replace('{{message}}', context.ticket.message)
      .replace('{{#if replies}}', context.replies.length > 0 ? '' : '<!--')
      .replace('{{replies}}', repliesText)
      .replace('{{/if}}', context.replies.length > 0 ? '' : '-->')
      .replace('{{#if bookingContext}}', bookingContext ? '' : '<!--')
      .replace('{{bookingContext}}', bookingContext)
      .replace('{{/if}}', bookingContext ? '' : '-->');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const analysis = JSON.parse(content) as AiAnalysisResult;
    
    const processingTime = Date.now() - startTime;
    console.log(`AI ticket analysis completed in ${processingTime}ms`);

    return {
      ...analysis,
      confidence: Math.min(100, Math.max(0, analysis.confidence || 80))
    };
  } catch (error) {
    console.error("AI analysis error:", error);
    return getFallbackAnalysis(context.ticket);
  }
}

function getFallbackAnalysis(ticket: SupportTicket): AiAnalysisResult {
  const categoryMap: Record<string, string> = {
    booking: "booking",
    billing: "payment",
    technical: "technical",
    general: "general"
  };

  const priorityKeywords = {
    urgent: ["urgent", "emergency", "immediately", "asap", "refund", "scam", "fraud", "safety"],
    high: ["problem", "issue", "broken", "not working", "error", "failed", "charged"],
    normal: ["question", "help", "how to", "unable", "can't"],
    low: ["feedback", "suggestion", "wondering", "curious"]
  };

  let suggestedPriority: "low" | "normal" | "high" | "urgent" = "normal";
  const lowerMessage = ticket.message.toLowerCase();
  
  for (const [priority, keywords] of Object.entries(priorityKeywords)) {
    if (keywords.some(kw => lowerMessage.includes(kw))) {
      suggestedPriority = priority as typeof suggestedPriority;
      break;
    }
  }

  return {
    summary: `Customer reported an issue regarding: ${ticket.subject}. The ticket requires review and response from support staff.`,
    category: categoryMap[ticket.category] || "general",
    suggestedPriority,
    rootCause: "Manual review required to determine root cause.",
    recommendations: [
      "Review the customer's message carefully",
      "Check for any related bookings or transactions",
      "Respond within 24 hours with next steps"
    ],
    customerResponse: `Hi there,\n\nThank you for reaching out to LervIT support. We've received your message regarding "${ticket.subject}" and our team is reviewing it carefully.\n\nWe understand how important this is to you, and we're working to resolve it as quickly as possible. You can expect an update from us within 24 hours.\n\nIf you have any additional information that might help, please don't hesitate to reply to this message.\n\nWarm regards,\nThe LervIT Support Team`,
    internalNotes: "AI analysis unavailable - manual review required. Check system logs, database records, and related bookings for this customer.",
    similarCases: [
      "Standard customer inquiry - typical resolution time: 24-48 hours"
    ],
    confidence: 40
  };
}

export function getQuickResponses(category: string): { label: string; template: string }[] {
  const responses: Record<string, { label: string; template: string }[]> = {
    booking: [
      { label: "Booking Confirmed", template: "Great news! Your booking has been confirmed. You'll receive updates as your mover accepts the job." },
      { label: "Booking Modified", template: "Your booking has been updated as requested. Please review the changes in your dashboard." },
      { label: "Booking Cancelled", template: "Your booking has been cancelled. If you were charged, a refund will be processed within 5-7 business days." }
    ],
    payment: [
      { label: "Refund Processing", template: "We've initiated a refund for your transaction. Please allow 5-7 business days for it to appear in your account." },
      { label: "Payment Issue Resolved", template: "The payment issue has been resolved. Your account has been updated accordingly." },
      { label: "Payment Clarification", template: "I'd be happy to clarify your charges. Your total includes the base rate plus any applicable fees." }
    ],
    mover: [
      { label: "Mover Complaint Acknowledged", template: "We take your feedback seriously. Our team is reviewing this matter and will take appropriate action." },
      { label: "Report Escalated", template: "Your report has been escalated to our safety team for priority review. We'll follow up within 24 hours." }
    ],
    technical: [
      { label: "Troubleshooting Steps", template: "Please try clearing your browser cache and cookies, then log in again. If the issue persists, let us know." },
      { label: "Bug Reported", template: "Thank you for reporting this issue. Our technical team has been notified and is working on a fix." }
    ],
    general: [
      { label: "Thank You Response", template: "Thank you for reaching out! Is there anything else we can help you with?" },
      { label: "Need More Info", template: "To better assist you, could you please provide more details about your issue?" }
    ]
  };

  return responses[category] || responses.general;
}
