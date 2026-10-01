# ScamShield demonstration

The local demo uses the user's Gemini key. Start it with `npm run build:demo` followed by `.venv/bin/python scripts/run-public-demo.py`, then open http://127.0.0.1:8000. Use synthetic or anonymized text. Keep keys in ignored server settings.

## Walkthrough

1. Select Hindi and paste this **synthetic** example: `SBI KYC बंद हो जाएगी। OTP तुरंत भेजें। merchant@ybl पर भुगतान करें।`. It contains an instruction to share an OTP, not an actual OTP value.
2. Check the message, then open **Agent trace**. Show the model-requested `check_upi`, its observation and the completed loop. These are actual events, not a hidden reasoning transcript. UPI syntax cannot establish account ownership.
3. Show the **Suspicious** verdict and score 40. Explain that evidence determines the score. It is not a probability and Unverified never means safe.
4. Simulate **I sent money**, ₹5,000, SBI, then update recovery steps. Show that 1930 and the bank take priority. This is a demonstration scenario, not a verified loss or recovered payment.
5. Review and edit the family warning and complaint. Approval unlocks downloads and sends nothing to a bank, family member or government portal.
6. Download the Hindi evidence PDF and reminder calendar. The tested PDF contains eight pages and redacted identifiers. The calendar contains three reminders, which require user import.
7. Finish with the sourced evaluation limitation and deployment status. The standalone public demo intentionally has no saved-case history.

## Existing evidence

- `output/demo/gemini-new-key-attempt.json` and `gemini-connection-status.json`: successful live local Gemini call and completed tool loop.
- `output/demo/hindi-browser-proof.txt` and `hindi-trace-focused.jpg`: actual Hindi browser result and call `call_247334`.
- `output/demo/hindi-evidence-pack.pdf` and `hindi-follow-up.ics`: actual browser downloads for the simulated ₹5,000/SBI flow.
- `output/demo/ScamShield-demo-walkthrough.mp4`: edited narration over actual local app captures. It is a walkthrough, not a continuous screen recording or a publicly deployed session.
- `output/presentation/final/ScamShield-pitch-v2.pptx`: five editable slides with the sourced evaluation and release dependencies.

## Claims to keep separate

The five sourced excerpts matched categories 5/5 but generated warning verdicts 0/5. Their median live analysis time was 1.16 seconds, excluding OCR and PDF creation. The earlier synthetic UPI connection check took 24.30 seconds with the full agent loop. The small selected set cannot support general accuracy claims. See [SOURCED-EVALUATION.md](SOURCED-EVALUATION.md).

The older 25/25 authored taxonomy cases and screenshot fixtures are local regressions, not real-world accuracy. The Hindi browser example and ₹5,000 loss are synthetic. No manual time baseline, recovery rate or official competition score was measured.

## Deployment and submission

The existing owner-private Site serves an earlier version. The updated source needs a connected review repository, required CI, independent review and host configuration before public release. The Render Blueprint uses paid persistent storage, so hosting cost needs a decision even with a free-tier Gemini key. A container definition exists, but Docker execution is unverified.

After deployment, repeat the live Gemini check against the actual HTTPS `/analyze` URL from another network and keep that evidence separate from local runs. Verify the hackathon's current endpoint/manifest requirements. The user submits the final form and artifacts.
