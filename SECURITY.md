# Security and threat model

DhuanTrace takes photos and readings from the public and sends alerts to officials, so the main risks are false data, abuse of the write endpoints, and leaking keys or private data. This page lists what could go wrong and what the code does about it. Each item names the test that checks it.

## What is protected

| Asset | Why it matters |
|---|---|
| API keys (NASA FIRMS, data.gov.in, Gemini) | Misuse costs quota or money |
| Forecast and alert integrity | A false alert sends officials to the wrong district |
| Each state's air-quality history in the federated network | States share models, not data |
| Citizen photos and locations | Personal data |

## Threats and mitigations

| Threat | Mitigation | Checked by |
|---|---|---|
| Fake or recycled smoke photos push the forecast | Trust score per photo: EXIF time and GPS against the reported place, SHA-256 duplicate and 64-bit perceptual-hash near-duplicate check, Gemini check for screen photos and AI images, satellite support. Reports under 0.25 trust stay out of the forecast | `research.test.js` (trust), `server.test.js` (duplicate lowers trust) |
| Flooding the write endpoints (spam reports, Gemini cost) | Token-bucket rate limit per address and endpoint: photo reports 10/min, questions and alerts 12/min, federated runs 4/min, others 60/min; `429` with `Retry-After` | `server.test.js` (429) |
| Oversized or malformed bodies | Size limit per endpoint (`413`), JSON content type required (`415`), body must be a JSON object (`400`), images only JPEG/PNG/WebP, field lengths capped | `server.test.js` (413, 415, 400) |
| Points outside the modelled area give nonsense | Coordinates outside 18–30°N, 70–87°E refused with a reason | `server.test.js` |
| Script injection through names, notes or Gemini text | Every value is HTML-escaped before it reaches the page; Content Security Policy allows scripts only from this site and cdnjs; `nosniff`, `X-Frame-Options`, `Referrer-Policy` | `server.test.js` (CSP header) |
| Gemini returns invented numbers or odd output | Gemini gets only computed facts; replies are parsed as JSON and validated field by field; the template alert is used if anything fails | `live-paths.test.js` |
| A federated node is impersonated or a message replayed | Every message signed with HMAC-SHA256 over timestamp and body; nodes refuse unsigned, altered or older-than-5-minute messages | `fednet.test.js` |
| A node leaks raw data, or the coordinator asks for it | The protocol has no field for raw rows. The coordinator refuses any reply with fields outside the whitelist and reports it; the node never sends its rows | `fednet.test.js` (leaking node refused) |
| A node sends bad weights to poison the model | Weights must be 5 finite numbers under 50 in size; invalid updates are dropped for that round | `fednet.test.js` |
| A node goes down mid-training | Its round is skipped and training continues with the others | `fednet.test.js` |
| Server errors leak internals | 5xx replies carry only a reference code; details go to the structured log | code review (`server.js`) |
| Keys end up in the container image or in git | `.env` is listed in `.gitignore`, `.dockerignore` and `.gcloudignore`; keys are read from the environment only | review of ignore files |
| Container compromise | Runs as the unprivileged `node` user; only the data folder is writable | `Dockerfile` |

## Known limits (not solved here)

- Rate limits are per address and in memory, so they reset on restart and do not cover a botnet. A production deployment would add Cloud Armor or an API gateway.
- There is no login. Anyone can read the open data (by design) and anyone can post a report (limited as above). Alert status changes are not tied to an official's account.
- Trust scoring makes fake photos costly, not impossible: a real photo taken at the right place and time of an unrelated fire would still pass.
- The federated secret is shared by all nodes. A real multi-state deployment would give each node its own key pair.
- The latest 300 citizen photo reports are stored with their location. There is no deletion request flow yet.

## Reporting a problem

Open an issue or contact the team; please do not post keys or personal data in the issue.
