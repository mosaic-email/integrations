# AGENTS.md

## Scope

This is the official Mosaic integration repository, owned by Locki Dynamics LLC.
Read README.md and the relevant existing core Mosaic contracts before editing.
Keep packages independently versioned under integrations/<integration-id>/.
Core mandatory packages and architectural docs remain in Mosaic.

## Working agreement

- Implement only the requested integration or migration; reuse existing host seams.
- Do not invent host APIs, introduce speculative infrastructure, or modify the core
  checkout without explicit authorization.
- Preserve minimum host-version eligibility, explicit interface compatibility,
  exact release identity, and deterministic output evidence.
- Packages receive only bounded, capability-scoped authority. Keep credentials
  and customer data out of source, logs, fixtures, and release assets.
- Preserve unrelated work. Never overwrite or transfer another repository.
- Do not start or stop the owner's development processes.
- Do not publish releases or change repository access without authorization.

## Verification

Run the smallest meaningful deterministic checks for changed behavior. High-risk
runtime, security, and migration changes require independent read-only review.
Agents must not use browsers to test Mosaic. Report owner-run visual and
email-client QA as pending, and distinguish local checks from live release proof.
Record changed behavior, checks actually run, and outstanding migration risks.
