# Changelog

## [1.4.0] - 2026-10-09

### Changed

- Move FlatPack's release source, package schemas, fixtures, and deterministic
  build checks into the independent integrations repository. Keep the Worker
  and raster-plan v2 output behavior unchanged.
- Declare the Mosaic Package Release v3 contract with explicit Mosaic and
  compiler compatibility floors. Release tooling builds precomputed assets
  without importing the Mosaic checkout.


## [1.3.1] - 2026-09-24

### Changed

- Use Mosaic green (`#0fa64a`) for FlatPack Builder rails, toggle, and properties panel stroke.

## [1.3.0] - 2026-09-24

### Changed

- Generate FlatPack PNGs as part of an authorized package export from Mosaic's
  frozen canonical Email HTML and saved FlatPack settings. Repeated exports
  regenerate the images; generated PNGs are not retained as historical assets.
- Keep the existing v2 plan Worker and schemas. Mosaic owns authorization,
  rendering, HTML transformation, output validation, and ZIP delivery.

## [1.2.0] - 2026-09-22

### Changed

- Declare the v2 raster-plan contract explicitly and request the Mosaic-owned Builder bracket rail, icon, color, Link and ALT controls through FlatPack authoring metadata. New generated raster assets use package-neutral Mosaic IDs while retained FlatPack IDs and completed bytes remain readable. No Worker artifact or stored-data migration.
- Requires Mosaic 0.0.3, the first host version with this authoring and generated-asset contract.

## [1.1.1] - 2026-09-22

### Changed

- Declare FlatPack-owned completion copy for raster Worker and output-plan
  failures. Mosaic continues to own renderer, resource, storage, and artifact
  failures. Requires Mosaic 0.0.2; no artifact or stored-data migration.

## [1.1.0] - 2026-09-22

### Changed

- Added the v2 raster-plan protocol so Mosaic can omit dark presentation
  variants when Library Dark Mode governance is disabled.

## [1.0.0] - 2026-09-21

### Added

- Declared the native `email-raster-region` contribution.
- Added bounded source, plan-request, and plan-result schemas.
- Added a restricted Worker that validates canonical state inputs and returns
  the four-variant raster plan.
