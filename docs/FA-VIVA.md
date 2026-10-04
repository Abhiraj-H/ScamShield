# ScamShield viva preparation

## A 60-second introduction

ScamShield is an agentic scam-triage and complaint-preparation application for Indian families. A user pastes a suspicious message or reviews text extracted locally from a screenshot. The system masks sensitive patterns, retrieves official guidance using Gemini embeddings, and gives the language model a constrained classification task. Gemini selects registered verification tools, receives their actual outputs and completes a bounded loop. Code computes the evidence score and chooses a prevention, exposure or payment-recovery path. The user reviews drafts and approves downloads. The app never submits complaints automatically.

## Likely questions and precise answers

1. **Why is this an agent rather than a chatbot?** It makes a bounded tool decision based on extracted entities, executes that decision, returns the observation to the model and records the multi-step trace. The live synthetic check selected `check_upi` and completed after its real output. Rules-only fallback does not demonstrate live LLM planning.
2. **Why is the score deterministic?** Security outcomes need consistent, inspectable evidence weights. A fluent category label should not create risk points or imply proof of a crime. The LLM classifies and selects checks; code scores the resulting evidence.
3. **Where is RAG?** Six reviewed official guidance paraphrases have precomputed 768-dimensional Gemini document embeddings. Runtime query embeddings retrieve top-three chunks by normalized cosine similarity. Their content augments the classification prompt and the model selects grounded citation IDs. The app composes an extractive answer from those passages and shows source links.
4. **Why only six documents?** This is a reviewable prototype corpus covering financial reporting, attempted-fraud reporting, KYC/electricity pretexts, UPI PIN safety and historical liability context. Larger coverage needs document ingestion, periodic review and independent retrieval evaluation.
5. **Is selecting passages still generation?** The answer uses an LLM-selected extractive composition. We intentionally restrict generation to corpus passages rather than accepting novel financial or legal assertions. It is a retrieval-augmented constrained LLM workflow, with an explicit extractive fallback.
6. **What if Gemini fails?** Retrieval explicitly becomes keyword fallback, classification becomes rules mode and remaining checks execute under code control. Missing verification stays visible. There is never a Safe verdict.
7. **What does the 5/5 retrieval result prove?** Only that the expected passage appeared in the top three for five authored diagnostic queries, including Hindi and Marathi. It is not general retrieval accuracy or scam-detection accuracy.
8. **Why did the old sourced scam evaluation produce 0/5 warnings?** Short excerpts and redaction removed weighted indicators. Topic classification matched all five, but its label did not add score. This is a material scoring limitation. The benchmark must not be reused as an independent holdout after tuning.
9. **Does a valid UPI handle identify the recipient?** No. This checks syntax only. It cannot confirm ownership, existence, trustworthiness or criminal conduct.
10. **Does Safe Browsing work?** The adapter and failure handling exist. Credentialed live Safe Browsing remains unverified. RDAP can also be unavailable. Neither an absent match nor an unavailable lookup proves safety.
11. **What leaves the device?** Browser screenshot OCR stays on the device. Configured text classification and query embedding go directly to Gemini after sensitive-number masking. The embedding query also masks extracted contacts. This is not a claim of perfect anonymisation. Users should use synthetic or anonymised examples for the demo.
12. **Can the app file a complaint or recover money?** It prepares drafts only. The user chooses to call, submit or share. Reporting does not guarantee recovery. A money-lost path prioritizes 1930 and the bank before exports.
13. **What happens after approval?** PDF and calendar downloads unlock. Changing the facts revokes approval. Three calendar events become active only when the user imports the file.
14. **Is it deployed?** Source exists on GitHub. The new RAG revision is in the supplied ZIP and local checkout. Public runtime deployment, a live IdP/MFA and a container run remain unverified.
15. **What is the main trade-off?** Bounded autonomy and constrained guidance reduce unsupported actions and advice, but the small corpus, fixed weights, partial translations and API availability limit coverage.

## Three-minute local demonstration

- Start the local stateless demo. Show health as configuration status, not proof of a call.
- Use the synthetic message: `SBI KYC expires tonight. Send OTP. Pay demo123@ybl.` Explain that its risk score is evidence points.
- Show Retrieved guidance: semantic mode, source IDs, official links and selected passages. Explain the corpus and cosine top-3 retrieval.
- Show Agent trace: Gemini's actual `check_upi` call and observation. Say clearly that syntax is not ownership.
- Simulate INR 5,000 already sent via SBI. Show the 1930-first path. Updated answers mark earlier retrieval stale and revoke approval.
- Edit drafts, approve and download. Explain that this does not submit the report and calendar reminders require import.
- Finish with the testing document and the historical 0/5 warning limitation. Keep a rules-mode fallback ready and describe it honestly if quota is unavailable.

## Submission checklist

Fill in student name(s), roll number(s), class and faculty details on the report. Check the faculty's exact deadline: timely submission contributes 5 marks and cannot be established by local tests. Submit the ZIP or a repository revision that actually contains this RAG update. Keep `.dev.vars`, keys, databases and local evidence out of the source package. Do not claim a public endpoint unless it has been tested publicly.

## Current dependency security status

The initial 4 October 2026 gate failed on CVE-2026-93687 in transitive braces. The Vercel revision removes the unused Sites/vinext build adapter and Next-specific lint dependency chain; npm audit now passes without suppression, and braces/micromatch/fast-glob are absent from the lockfile. New Vercel tests cover input validation, quotas shared between instances, concurrent metadata audit chaining and failures that must withhold results. There are now 45 Node tests and 27 Python tests. A public release still requires the complete security gate, CI, independently reviewed main and durable Redis configuration. Old PDF/ZIP artifacts predate this remediation and must not be presented as the new release.

Official advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
