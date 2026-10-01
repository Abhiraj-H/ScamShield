# Human narration for the demo

Read only the quoted paragraphs. The timestamps match the 2:36 edited walkthrough. Aim for a clear conversational pace of about 140 words per minute. Record one audio file with short pauses between sections, or record ten separate clips named `01-intro` through `10-status`. WAV, M4A or MP3 is fine. Keep the microphone distance steady and avoid background music.

The clean visuals are `output/demo/ScamShield-demo-visuals.mp4`. They contain no automated voice. After the user's audio is available, replace the narration, adjust scene timing to the recording, update captions and export a new final video. Preserve the original video. If recording the live app instead, wait for the actual result and describe the tools that really appear; model choices and timings can vary.

## 00:00–00:10 — Introduction

Show: ScamShield title.

> ScamShield helps Indian families understand suspicious messages and prepare a clear next step. This demonstration uses a synthetic Hindi example.

## 00:10–00:28 — Message intake

Show: Hindi message in the checker.

> This message claims that an SBI KYC account will close. It asks the recipient to send an OTP and make a UPI payment. Users can paste text or review screenshot text extracted on their device.

## 00:28–00:53 — Actual agent tool call

Show: the model-requested UPI check, its observation and agent completion.

> Gemini makes a real tool decision here. It selects the UPI check, which our engine executes and records. The actual result goes back to Gemini before completion. The trace shows the call and its observation. This check validates the handle's syntax, but it cannot confirm who owns the account.

## 00:53–01:06 — Evidence and verdict

Show: Suspicious, score 40.

> The result is Suspicious, with an evidence score of forty. The credential request contributes to that score. It is not a probability, and an Unverified result never means safe.

## 01:06–01:28 — Payment recovery path

Show: money-sent recovery guidance. The selected demo amount is ₹5,000 and bank is SBI.

> Now we simulate a payment of five thousand rupees through SBI. The guidance switches to the money-sent path: call nineteen thirty, contact the bank promptly, then prepare the official report and preserve evidence. The user should not wait for a PDF before taking these steps. Recovery is not guaranteed.

## 01:28–01:45 — Family warning

Show: editable Hindi family alert.

> The family warning is a Hindi draft that the user can edit. It advises against payment, opening suspicious links, or sharing an OTP or UPI PIN. ScamShield prepares the text, and the user decides whether to share it.

## 01:45–01:58 — Complaint and approval

Show: complaint draft and approval control.

> The complaint and bank letter organize the facts for review. The user can add missing details privately. Approval unlocks downloads; it does not submit a report or contact anyone.

## 01:58–02:14 — PDF and reminders

Show: approved download controls. Optionally show the actual downloaded PDF and calendar file.

> The tested downloads produced an eight-page Hindi evidence pack with redacted identifiers, plus three calendar reminders. Users must import the calendar to activate those reminders. The files help prepare the next step without sending a complaint automatically.

## 02:14–02:26 — Evaluation

Show: the five-sample evaluation slide.

> Five sourced excerpts matched categories, but none triggered a warning verdict. That exposes a scoring gap. This small local evaluation does not establish general scam-detection accuracy.

## 02:26–02:36 — Current status

Show: implementation and deployment slide.

> Live Gemini and the recovery flow work locally. Fifty-six tests and our security gate passed. Public runtime deployment still needs configuration and verification.

## Recording handoff

Send the audio recording or the video with your own narration. The final edit should use the human voice, remove the automated track, and retain the synthetic-input and local-demo disclosures. If GitHub publishing or public runtime deployment finishes before recording, use only the newly verified status and URL in the closing line. Publishing source on GitHub is separate from hosting the FastAPI application.

These claims reflect the saved local proof on 1 October 2026. Source details and limitations: [SOURCED-EVALUATION.md](SOURCED-EVALUATION.md), [DEMO.md](DEMO.md) and [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md).
