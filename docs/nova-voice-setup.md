# Nova Voice Setup — Working Configuration

## Architecture
Customer calls +18889820885
  → Telnyx receives (FQDN connection)
  → Routes to sip.rtc.elevenlabs.io:5060
  → ElevenLabs answers with Nova agent
  → Full bidirectional audio ✅

## Telnyx Configuration

### Phone Number
- Number: +18889820885
- Type: Toll-free
- Connection: lervitnova22 (FQDN)

### FQDN Connection (lervitnova22)
- FQDN: sip.rtc.elevenlabs.io
- Port: 5060
- DNS Record Type: A
- Inbound Codecs: G711U, G711A, OPUS
- Webhook: none (SIP-based routing)

### Call Control App (LervIT Nova Outbound)
- ID: 3049814607938979114
- Webhook: https://app.lervit.com/api/nova/webhook
- Used for: outbound calls only
- first_command_timeout: true (30s)

## ElevenLabs Configuration

### Agent
- Agent ID: agent_2201m2cexsewerc8m6gb17x8jk6d
- Model: claude-haiku
- Voice: Flash
- Input audio format: μ-law 8000 Hz

### Phone Number
- Phone Number ID: phnum_0501m2cn7fv9fga8nejw7jpv2gty
- Number: +18889820885
- Agent: Nova Clarke
- Inbound: leave blank (Telnyx IP-based)
- Outbound Address: sip.telnyx.com
- Outbound Transport: UDP
- Outbound Codecs: PCMU only

### Agent Tools (server-side webhooks)
Tool schemas live in the ElevenLabs console, not in this repo — adding a tool
here means adding it there. Handlers are in `server/nova-webhook-routes.ts`.

| Tool | Method + path |
| --- | --- |
| `lookup_quote` | GET `/api/nova/quote` |
| `collect_email` | POST `/api/nova/collect-email` |
| `send_signup_link` | POST + GET `/api/nova/send-link` |
| `book_move` | POST `/api/nova/book-move` |
| `send_booking_confirmation` | POST `/api/nova/send-confirmation` |
| `create_account` | POST `/api/nova/signup` |
| `send_signup` | POST `/api/nova/send-signup` |
| `report_objection` | POST `/api/nova/tool/report-objection` |

#### Dynamic variables
`server/lib/novaBridge.ts` sends `dynamic_variables` in the
`conversation_initiation_client_data` frame on every bridged call, so the console
agent config can reference them:

| Variable | Source |
| --- | --- |
| `{{leadId}}` | `NovaCallContext.leadId` — seeded at dial time by `nova.ts`, or re-hydrated from `X-Nova-Entity-Id` in the `call.initiated` handler |
| `{{leadName}}` | `NovaCallContext.customerName` (`contactName` / mover name) |
| `{{companyName}}` | `leads.company_name`, for candidates that have one |

All three are always present, `''` when unknown — ElevenLabs fails the
conversation if the agent references a variable that was not supplied, and an
inbound call has no lead behind it. Wire a tool param to `{{leadId}}` rather than
asking the agent to remember it; an empty value means the call was not seeded,
and the handler 400s rather than writing to the wrong lead.

Params are declared camelCase. PascalCase spellings (`Phone`, `LeadId`, …) still
work — `ELEVENLABS_PARAM_ALIASES` aliases the known ones — but new tools should
not rely on that.

#### `report_objection` — console setup
Webhook tool, POST `https://app.lervit.com/api/nova/tool/report-objection`:

```json
{
  "leadId": "string, required — the leadId from the call's dynamic variables",
  "reason": "string — the lead's own words, a few words is enough"
}
```

Description to give the agent: *"Call this as soon as the person says they are
not interested, to not call them again, to remove them from the list, or that
they already have a mover. Pass their reason."*

It records `interested: false` on `leads.call_context`, which is what stops the
drop-recovery re-dial in `maybeRetryDroppedColdCall` from calling them back.
The per-call prompt override in `server/lib/novaBridge.ts` already instructs the
agent to use it whenever the call carries a `leadId`.

### Test call (operator-triggered)
`POST /api/nova/test-call` dials one number through the real `call_mover_cold`
path, so a bridge or prompt change can be heard before it reaches the lead list.
It is not an ElevenLabs tool — you call it:

```bash
curl -X POST https://app.lervit.com/api/nova/test-call \
  -H 'Content-Type: application/json' \
  -H "X-Nova-Tool-Secret: $NOVA_TOOL_SECRET" \
  -d '{"phone":"+14035551234","name":"Test Lead","companyName":"Test Co"}'
```

Creates a `b2bm` lead for the number unless you pass an existing `leadId`, and
returns `{ ok, leadId, result }`. Auth **fails closed**: with `NOVA_TOOL_SECRET`
unset the endpoint 503s rather than accepting the request — it places real calls
and writes lead rows, so an open version is a toll-fraud vector.

It does not bypass the call-hours check. Outside 08:00–21:00 MT, or on a Sunday
(see `checkCallHours`), it returns `{ skipped: true, reason: 'sunday_mt' }` and
similar instead of dialling, and deliberately does not enqueue a reschedule.

## Outbound Calls (Nova → Customer)
Nova calls customers via ElevenLabs SIP API:

POST https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call
{
  "agent_id": "agent_2201m2cexsewerc8m6gb17x8jk6d",
  "agent_phone_number_id": "phnum_0501m2cn7fv9fga8nejw7jpv2gty",
  "to_number": "+1xxxxxxxxxx"
}

## Key Lessons Learned
1. Use FQDN connection (not Call Control) for inbound
2. ElevenLabs SIP handles audio natively — no bridge needed
3. No WebSocket streaming required
4. RTP bidirectional mode does NOT work with ElevenLabs
5. Telnyx Call Control App used for outbound dial only
6. PCMU codec + μ-law 8000 Hz must match on both sides

## Environment Variables
TELNYX_API_KEY=YOUR_TELNYX_API_KEY
TELNYX_CONNECTION_ID=3049814607938979114
ELEVENLABS_API_KEY=YOUR_ELEVENLABS_API_KEY
ELEVENLABS_AGENT_ID=agent_2201m2cexsewerc8m6gb17x8jk6d
ELEVENLABS_PHONE_NUMBER_ID=phnum_0501m2cn7fv9fga8nejw7jpv2gty
