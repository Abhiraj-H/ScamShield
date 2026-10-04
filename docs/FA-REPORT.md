# ScamShield
## Agentic Scam Triage and Complaint Preparation

FA Activity: Agentic AI Application Implementation. Prepared 4 October 2026.

Student name(s): ____________________    Roll number(s): ____________________
Class / division: ____________________    Faculty: ____________________

Closest suggested domain: #17 Smart Complaint Management Agent. Related elements: #10 Customer Support Agent and #16 Document Intelligence Agent. This is a working local prototype. Source publication and public runtime deployment are separate.

## 1. Introduction

Indian families receive suspicious payment requests, KYC messages and impersonation attempts through SMS and messaging applications. Interpreting the message is only part of the task: the user also needs to understand what happened, preserve useful facts and choose the next step. ScamShield combines a constrained language model, retrieval, verification tools and explicit user approval to prepare that next step.

The application supports English, Hindi and Marathi templates, with partial interface translation. It uses a shared JavaScript analysis engine behind a React frontend and a Python FastAPI service. The user can paste text or review browser OCR text from a screenshot.

## 2. Problem Statement

A generic chatbot can provide fluent but unsupported guidance. A binary scam label can also confuse absence of evidence with safety. Users who already sent money need a different response from users who only received a message. ScamShield addresses this by separating evidence gathering, classification, deterministic scoring, situation-based guidance and draft review.

The objective is scam triage and complaint preparation. It is not a public identity-validation service, an automatic complaint-filing service or a promise of recovering funds. No finding establishes criminal conduct.

## 3. Objectives

- Extract message indicators and mask sensitive number patterns before text-model processing.
- Retrieve relevant official guidance with semantic embeddings and visible citations.
- Let Gemini select bounded verification tools and observe their real outputs.
- Compute an inspectable evidence score and adapt guidance to prevention, exposure or money loss.
- Prepare editable complaint, bank-letter and warning drafts, with user approval before downloads.
- Demonstrate failure handling, access isolation and reproducible testing without exposing credentials.

## 4. Proposed Agent Architecture

The input layer collects text or reviewed local OCR. The shared engine masks sensitive number patterns, extracts indicators, retrieves guidance and calls the constrained classifier. A bounded Gemini tool loop chooses additional registered checks. The engine records observations, computes the evidence score and prepares the action plan and drafts. Approval controls PDF/calendar download. FastAPI uses a Node bridge to the same engine that the frontend service uses, avoiding two separate scoring implementations.

The architecture diagram is supplied as FA-Architecture.pdf and docs/FA-ARCHITECTURE.mmd. Required checks remain policy-controlled. Model-selected checks are bounded by an allow-list and cannot open a user-supplied site or invent a target. Storage uses SQLite for FastAPI and D1 for the hosted frontend service. The stateless demo keeps results in the browser without saving a case.

## 5. Prompt Design

The classification prompt requests JSON with an allowed taxonomy value, relevant tool names and up to three citation IDs from the retrieved guidance. It explicitly treats user text and retrieved passages as data, forbids invented evidence and prohibits refund assertions. Temperature is zero. Code validates the response rather than trusting JSON syntax alone.

The tool-planner prompt permits only supplied verification tools, requires observing their actual results and states that code computes scores and actions. The first round requires a function call when optional tools exist; the loop has a two-round budget. Functions accept an empty argument object because extracted inputs are bound by the application. Unknown or duplicate calls and forged arguments are rejected.

The full executable prompt text, input fields and validators are documented in docs/PROMPTS.md. The trace reports execution events and observations, not hidden model reasoning. Opaque Gemini protocol signatures remain server-side.

## 6. RAG Implementation

The corpus contains six short, manually reviewed paraphrases of official guidance: financial cyber-fraud reporting, Chakshu communication reporting, electricity/KYC pretexts, UPI receiving-money safety, PIN confidentiality and historical bank-liability context. Every passage has a stable ID, publisher, source URL and review date. Sources are references, not evidence about a particular sender.

The offline build script calls Gemini's gemini-embedding-001 with RETRIEVAL_DOCUMENT and 768 dimensions. Runtime queries use RETRIEVAL_QUERY with the same model and dimensions. Both vectors are normalized. An exact cosine search returns up to three passages above a 0.35 similarity floor. A corpus hash rejects stale or incompatible vectors. Six passages need no external vector database; search cost is O(Nd).

The retrieved passages augment the classification prompt. Gemini selects valid citation IDs and the application composes an extractive answer from their exact reviewed text. The UI shows reference candidates, selected passages and official links. This is constrained extractive RAG, not unrestricted generated legal advice. Invalid selections fall back to the retrieved excerpts; empty selection abstains. Embedding errors use visibly labelled keyword fallback. Similarity never contributes risk points. Changed recovery answers mark the original retrieval stale until reanalysis.

Five authored diagnostic queries found the expected passage in the top three during a live run, including one Hindi and one Marathi query. This small check does not establish general retrieval quality, multilingual detection accuracy or correctness on arbitrary user messages.

## 7. Tool/API Integration

Native Gemini REST performs constrained classification and actual function calling. The indexed corpus and runtime queries also use Gemini embeddings. No OpenAI key is required for this configuration, and no new SDK dependency was added.

RDAP can supply registration age for eligible public domains. Google Safe Browsing is optional and requires separate credentials; credentialed live behavior remains unverified. UPI parsing checks syntax only, while phone/SMS checks are heuristics without subscriber ownership verification. Known official domains and scam patterns are finite reference lists. Unavailable services produce explicit uncertainty.

Browser OCR uses Tesseract with English, Hindi and Marathi assets. PDF generation uses pdf-lib and calendar export creates three importable events. These tools prepare files without submitting a complaint or contacting an authority. Docker and aiKart adapters exist, but an actual container build/run remains unverified.

## 8. Agent Workflow

1. The user pastes a message or reviews locally extracted screenshot text.
2. The engine masks sensitive patterns, extracts entities and creates a contact-redacted retrieval query with situation flags.
3. Semantic retrieval supplies official guidance to constrained classification and citation selection.
4. Gemini selects allowed evidence tools. The engine executes them and returns actual observations for model review.
5. Required checks and observed evidence determine the capped score: 60 or more Scam, 30-59 Suspicious, below 30 Unverified. The app never returns Safe.
6. The situation selects prevention, possible credential/device exposure or money-loss actions. The money-loss path prioritizes 1930 and bank contact before exports.
7. The user reviews and edits drafts. Approval unlocks PDF and calendar download. Changing facts revokes approval. Nothing is automatically filed or shared.

The fresh synthetic integration used a Hindi output setting and the message “SBI KYC expires tonight. Send OTP. Pay demo123@ybl.” It produced Suspicious with score 40, semantic retrieval, model-selected citation IDs and a real completed check_upi loop. A simulated payment selected branch C and the 1930-first action.

## 9. Safety Mechanism

Safety controls include sensitive-number masking, a contact-redacted embedding query, fixed provider endpoints, bounded tool rounds and argument validation. Prompt text cannot choose arbitrary network hosts or file a complaint. The score derives only from evidence, and unsupported checks remain unverified. The UPI parser cannot establish ownership. Official-host matching does not verify message content.

The user retains control over filing, calls and sharing. Drafts avoid guaranteed liability or recovery claims. Historical RBI material is explicitly historical, with current applicability left to the bank. Approval is a review gate for downloads. Imported calendar reminders do not create automatic contact.

Production authentication is designed to fail closed until OIDC/MFA is configured. Resource ownership, audit chains and durable quotas have local tests. A real deployed IdP, production hosting and operational certifications are not established by these tests. Free-tier provider use should be demonstrated with synthetic or anonymised inputs. Masking is not a claim of complete anonymisation.

## 10. Results

The fresh regression suite contains 64 passing tests: 37 JavaScript and 27 Python. Seven authored functional scenarios pass, covering English/Hindi/Marathi requests, benign advice, a payment path, UPI uncertainty and prompt injection. Five live retrieval diagnostics found the expected passage in the top three. A separate live synthetic agent check completed native Gemini tool calling and cited semantic guidance. Commands, exact outcomes and testing boundaries are in FA-Test-Report.pdf and docs/FA-TEST-REPORT.md.

The historical sourced evaluation on 1 October 2026 remains separate: five selected English excerpts achieved 5/5 category agreement and 0/5 warning verdicts at threshold 30. This exposes a scoring gap and does not demonstrate detection accuracy. The new RAG changes do not alter the evidence weights and have not established that this gap is resolved.

GitHub contains the earlier published prototype. The new RAG revision and assignment documents are in the supplied source ZIP and local checkout. A public runtime URL is still unverified. Timely submission carries five marks in the supplied rubric; this report cannot establish submission or award marks.

## 11. Limitations

The corpus is small, manually reviewed and English. Semantic retrieval has only five authored diagnostic queries, including Hindi/Marathi query examples. Reference excerpts currently display in English even when action templates are localized. No broad real multilingual or screenshot detection-accuracy estimate exists. The 0.35 relevance floor is a prototype choice, not a calibrated fraud threshold.

Deterministic scoring can miss suspicious short or obfuscated messages. The previous 0/5 warnings are a concrete example. API quota, RDAP availability and internet connectivity affect the live agent. Safe Browsing credentials, provider vision, public deployment, live IdP/MFA and container execution remain unverified. No tool here confirms the owner of a UPI handle or phone number. Draft approval is not a legal review.

## 12. Future Scope

Expand and periodically review the corpus with multilingual guidance and clearer source-version management. Evaluate retrieval and scam scoring separately using new held-out scam and legitimate-message cases. Revise scoring only after controlling false positives, rather than treating a model topic label as proof.

Verify credentialed Safe Browsing, deploy a public runtime with the required identity controls and test the container. Larger corpora may justify a managed vector index with tenant isolation. Add more accessible language coverage and measure OCR errors on real, consented screenshots. Keep complaint submission user-controlled.

## References

- Assignment: FA Activity_ Agentic AI Application Implementation.pdf supplied by the student. Requires architecture, working app, GitHub/ZIP, at least five tests and a 12-section short report.
- Google AI for Developers, embeddings: https://ai.google.dev/gemini-api/docs/embeddings
- I4C financial reporting portal: https://ncrp-grievanceredressal.mha.gov.in/
- DoT Chakshu launch: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2011383&lang=2&reg=3
- DoT electricity/KYC advisory: https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2025970&lang=2&reg=48
- NPCI fraud awareness: https://www.npci.org.in/fraud-awareness
- NPCI UPI PIN guidance: https://www.youtube.com/watch?v=tzdR1wOypfw
- Historical government bank-liability reply: https://sansad.in/getFile/loksabhaquestions/annex/16/AU2325.pdf?source=pqals
- Source repository: https://github.com/Abhiraj-H/ScamShield
- Prior diagnostic evaluation: docs/SOURCED-EVALUATION.md. Current redacted receipts: output/fa/.

## Current dependency security status

The initial 4 October 2026 gate failed on CVE-2026-93687 in transitive braces. The Vercel revision removes the unused Sites/vinext build adapter and Next-specific lint dependency chain; npm audit now passes without suppression, and braces/micromatch/fast-glob are absent from the lockfile. New Vercel tests cover input validation, quotas shared between instances, concurrent metadata audit chaining and failures that must withhold results. There are now 45 Node tests and 41 Python tests. A public release requires the complete security gate, exact-commit CI on protected main, the explicit sole-owner release policy and durable Redis configuration. Independent PR review is not part of the owner-selected workflow. Old PDF/ZIP artifacts predate this remediation and must not be presented as the new release.

Official advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
