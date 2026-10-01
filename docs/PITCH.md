# ScamShield five-slide pitch

The editable deck is `output/presentation/final/ScamShield-pitch-v2.pptx`. It reflects the locally verified prototype on 1 October 2026. It does not claim a new public deployment, enterprise certification or recovery outcomes.

1. **ScamShield:** scam triage and recovery preparation for Indian families. A suspicious message can create pressure to act before verifying the sender.
2. **A clear next step:** on-device screenshot OCR or pasted text produces evidence and an action plan. The plan changes after clicks, credential sharing or payment. Reviewable drafts, a PDF and reminders support the next step. English, Hindi and Marathi templates have partial interface coverage.
3. **Verified Gemini tool-calling:** the model selected `check_upi`, received its real output and completed the loop. The visible trace records actual calls and observations. Strict tool schemas bind inputs to extracted entities. Required checks and evidence scoring stay under code control. Syntax cannot verify UPI ownership.
4. **Sourced evaluation:** five historical excerpts produced 5/5 category matches and 0/5 warning verdicts. One retained host was extracted 1/1. Median live classification/analysis was 1.16 seconds in that small local run. Short excerpts and redactions remove evidence, and the current scoring policy misses warnings. No general accuracy claim follows.
5. **Implementation and release dependencies:** React/Vite/Vinext, FastAPI transport, a shared JavaScript engine, native Gemini REST, Tesseract, pdf-lib and D1/SQLite. Local security gates scan code, dependencies, secrets and package provenance, then generate SBOMs. Production still needs reviewed remote CI, host configuration, actual IdP/MFA activation and a verified container/public endpoint.

Source provenance and evaluation limits are in [SOURCED-EVALUATION.md](SOURCED-EVALUATION.md). The deck's speaker notes identify supporting sources. Security coverage and activation requirements are in [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md).
