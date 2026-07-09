# Trade-Offs

## 1. Speed vs Accuracy

Fully automated research is fast, but it can misclassify auth, plan gating, or partner approval. Verification loops and human checks are necessary to improve trust.

## 2. Breadth vs Depth

Researching 100 apps gives broad coverage, but high-priority apps still need deeper follow-up before roadmap decisions or customer-facing launches.

## 3. Official Docs vs General Web

Official docs are more reliable and easier to audit, but they can still be incomplete. Broader search improves discovery but introduces noise and stale community content.

## 4. LLM Extraction vs Deterministic Parsing

LLMs can understand messy docs quickly, but they can hallucinate. Schemas, enums, citations, confidence scores, and verification samples reduce the risk.

## 5. Self-Serve Ambiguity

Public docs do not always mean public access. Some products still require paid plans, admin approval, app review, business verification, or partner programs.

## 6. MCP Detection

MCP availability can be official, unofficial, or unclear. Unofficial MCP should be flagged as signal only, not treated as production-ready support.

## 7. Buildability vs Business Priority

An app can be technically buildable and still not deserve near-term product priority. Customer demand, strategic category fit, and support cost still matter.

## 8. Paid / Gated Apps

Gating is not failure. The correct product-ops output is often `needs_outreach`, with the access blocker stated explicitly.

## 9. Verification Cost

Manually verifying all 100 apps is expensive. A sample-based verification loop plus targeted re-checks is a more practical operating model.

## 10. Presentation vs Completeness

The reviewer should understand the key patterns quickly. The report therefore leads with findings and matrices before the full 100-row table.
