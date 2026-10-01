# 2-minute demonstration

1. Open ScamShield. Briefly introduce a parent receiving an electricity-disconnection message.
2. Click **Electricity bill**. Identify it as a synthetic example. Or upload `public/demo-electricity.png`; text is extracted on-device. Review it before checking.
3. Click **Check for scam signals**. Open **Agent trace** to show the actual plan, parallel tools and deterministic score. Open **Evidence** to show the reserved demo domain, brand mismatch, request for remote access and explicit unavailable checks. Never say this fake domain has a real registration age or a real threat-list match.
4. Set **I sent money**, amount ₹5,000, bank SBI, and click **Update recovery steps**. Show that 1930 and the bank move to the top; no export is needed before calling.
5. Open **Review drafts**. Review the complaint and bank letter, and explain the liability caveat. Select Hindi or Marathi **before a new check** for a localized family alert and checklist.
6. Click **Approve drafts & unlock downloads**. Download the PDF and calendar. Approval sends nothing and the calendar only creates reminders after import.
7. Open **Your cases** and reopen the saved result.

## Measured statement

Use the exact current `docs/evaluation.json` values: 25/25 authored synthetic taxonomy fixtures matched; this is regression coverage, not real-world accuracy. Median rules-only analysis + Hindi PDF generation on this machine was approximately 0.97 seconds over five measured runs. These runs skip live AI/threat services and use reserved demo domains. A browser screenshot extraction run is a different operation and should not use this latency claim.

Read `docs/ocr-evaluation.json` separately for screenshot-fixture results. Do not present text classification results as OCR accuracy. No manual time baseline was measured.

## Submission checklist

- Publish your built Docker image, replace `runtime.image` in the YAML template, and test the sandbox file contract inside the real container.
- Or host FastAPI on your chosen public service and verify its `/analyze` endpoint from another network.
- Add optional AI credentials to demonstrate native tool calls, then make a fresh live measurement. No keys are required for the on-device OCR and rules flow.
- Record your own demo and submit the official Google Form yourself. The supplied PDF’s submission window says 8–10 PM IST on 1 Oct 2026, with development ending at 9 PM; confirm any organiser updates.
