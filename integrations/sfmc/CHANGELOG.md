# 1.60.0 — 2026-11-03

- Publish a maintenance baseline for the reviewed SFMC connected-operation workflow; preserve the 1.15.0 Worker, native-token behavior, and operation-schema bytes.
- Document accompanying host repairs for recipient response completeness, SOAP read-error classification, and the existing optional image-folder destination in manual Push to SFMC.
- Clarify metadata-only refresh, transient preview, shared Enterprise ownership, and delivery recovery boundaries using concepts from the reviewed open-source tools, without adding dependencies or copying source.
- Requires Mosaic ≥0.0.5 and compiler bridge ≥160. Host repairs require separate Mosaic deployment; package update alone does not deploy them. No new migration or historical-artifact rewrite.

# 1.15.0

- Declare a bounded native system-token emission list for email address, subscriber key, and Additional Email Attributes 1–5. Unknown provider tokens remain unsupported.
- Require compiler bridge 160 for host-side validation and rendering of exact native-token nodes. The Worker still receives no authored Email content and does not render provider tokens.
- Preserve the previous inert-only profile and all historical package outputs.

# 1.14.0

- Adds local/shared ownership metadata for Content Builder folders and Data Extensions. Requires Mosaic 0.0.5.
- Shared Content Builder uses the child MID. Enterprise shared DE metadata requires Library Admin opt-in and Enterprise BU access on the Installed Package; Mosaic resolves and verifies the Enterprise MID. Recipient rows remain separately authorized.
- Preserves offline provider-plan output and historical artifacts.

# Changelog

## [1.13.0] - 2026-10-14

### Added

- Declare six Library-scoped SFMC Connector operations for connection verification, metadata discovery, recipient preview, and completed-Email publication, with closed bounded request/result schemas and explicit capability classifications.
- Preserve the offline provider Worker and its two schemas byte-for-byte. Connected operations use Mosaic's trusted host dispatch; no credentials, tokens, recipient-row keys or values, or raw provider rows are exposed to the Package Worker.

## [1.12.28] - 2026-10-09

### Changed

- Reissue the unchanged SFMC Worker, operation schemas, and compatibility floors under a new release identity.

## [1.12.27] - 2026-10-09

### Added

- Extract the SFMC provider into a standalone, bounded Worker package with a declared provider-plan operation and pinned request/result schemas.
- Keep profile support, personalization-binding resolution, scalar emission, variation-condition planning, and selected raster expressions in the package. Mosaic retains rendering, raw-code safety validation, authorization, and artifact ownership.
- Require compiler bridge version 140.
