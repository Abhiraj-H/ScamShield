# Sourced text evaluation

On 1 October 2026, five historical source-reported scam excerpts were sent to the local FastAPI `/analyze` endpoint with the user's Gemini key. Annotations and the 30/60 scoring thresholds were fixed before evaluating. Text inputs and expected annotations did not change after the run. Excerpt word-count descriptions were corrected afterwards; the original input hash remains in the run report.

| Source-reported message | Expected / returned category | Score | Verdict |
|---|---|---:|---|
| I4C electricity-disconnection advisory | Electricity disconnection | 10 | Unverified |
| IBTimes KBC fact-check, English translation of Hindi | Prize / lottery fraud | 0 | Unverified |
| Public NGO complaint: teaching-job offer | Job / task fraud | 0 | Unverified |
| MTNL message reported in a Delhi Police warning | KYC / account phishing | 10 | Unverified |
| Reddit self-report: obfuscated wallet-expiry SMS | KYC / account phishing | 10 | Unverified |

**Category agreement was 5/5. Warning detection at score 30 was 0/5; strong verdicts at score 60 were 0/5.** These are separate outcomes. A category match does not establish successful scam detection. The application never returned Safe, and its prevention advice still asked users to pause and independently verify.

All five requests used live Gemini classification. Median analysis time was **1.16 seconds** in this run. The UPI agent connectivity check is a separate synthetic request that took **24.30 seconds**, including classification and two tool-agent rounds. Neither measurement includes browser OCR, PDF creation, network-independent hosting or a manual baseline.

Only **one usable URL host** remained after excerpting and contact redaction. It was extracted, with no extra identifiers returned: 1/1. This denominator is too small to support a broad entity-extraction accuracy claim. The platform host `wa.me` is not itself evidence of fraud.

Five separate, authored benign controls produced 0 warnings in rules mode. They were not sent to the model, are not real benign messages, and must not be combined with the five sourced positives into a mixed accuracy score.

## Why the warning threshold was missed

The current score requires specific weighted evidence such as credential requests, reference-domain mismatches, threat-list findings or suspect contact patterns. Short excerpts often remove these. The model identifies the topic, but its topic label deliberately does not add risk points on its own. The wallet text also uses unusual punctuation. This is a material detection limitation, not a clean bill of health for the messages.

The benchmark is a diagnostic set for the next scoring revision, not an independent holdout for tuning on these same five cases. Any revised scoring policy needs separate cases and legitimate-message controls before a generalization claim.

## Provenance and limits

Source links, source-label strength, exact redactions and frozen annotations are in [sourced-samples.json](sourced-samples.json). The set includes an official advisory, a publisher fact-check, a police-warning news report and two public self-reports. Self-reports are not judicial findings or independently verified fraud outcomes. No person, phone number or underlying platform is declared criminal by this evaluation.

All five tested scam inputs were English, including one publisher translation of Hindi. Hindi and Marathi interface/action templates and synthetic regression tests are separate capabilities. This run does not establish performance on real Hindi/Marathi scams or real screenshot OCR.

Results and five browser screenshots are in `output/evaluation/sourced-local/` and `output/evaluation/screenshots/`. The screenshots are separate browser reruns of the same inputs; metrics refer to the saved API run, not screenshot timing. The endpoint was local; public deployment has not been verified.

Reproduce with `.venv/bin/python scripts/evaluate-sourced-samples.py --base-url http://127.0.0.1:8000`. Use a fresh output directory when testing a new model or a publicly hosted endpoint, so the original run remains intact.
