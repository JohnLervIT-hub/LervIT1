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
