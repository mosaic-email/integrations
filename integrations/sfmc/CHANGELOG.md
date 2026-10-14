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
