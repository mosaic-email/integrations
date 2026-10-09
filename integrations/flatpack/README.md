<div align="center">
  <img src="logo.png" alt="FlatPack" width="180" />
  <h1>FlatPack</h1>
  <p>Responsive visual assets for Mosaic Email.</p>
</div>

FlatPack gives Mosaic authors a polished way to use responsive image treatments
inside an Email without giving up the familiar Builder experience. It is made
for campaigns that need art-directed desktop and mobile presentations, light
and dark appearance variants, governed variations, links, and accessible image
text.

## What you can do

- Convert eligible Email modules into FlatPack visual assets.
- Keep each variation’s image text and link settings independent when needed.
- Preserve the module’s normal layout controls, including spacing, alignment,
  colors, backgrounds, and rounding.
- Include FlatPack modules in groups and continue editing the surrounding Email
  normally.
- Complete the Email to freeze Mosaic's canonical HTML for Preview and output.
- Download an authorized FlatPack package with images generated for that
  export.
- Generate dark assets only when the Library's governed Dark Mode setting is
  enabled.

## How it works in Mosaic

An administrator installs FlatPack and enables it for a Library. Authors use
FlatPack-declared Link and ALT controls in the Mosaic-owned module properties
panel and bracket rail. Complete validates the Email and freezes Mosaic's
canonical HTML; Builder, Preview, and Review continue to use that HTML. When an
authorized package export is requested, Mosaic applies FlatPack's bounded plan
to the frozen source, renders the required PNGs, validates the result, and
streams the ZIP. It regenerates PNGs on each export and does not retain
historical generated image bytes. Source images remain governed Library assets.

The package release supplies the raster-plan Worker and schemas. Mosaic owns
authorization, rendering, source-resource access, output validation, and ZIP
delivery. Regenerated PNG and ZIP bytes are not guaranteed to match across
renderer or browser updates; the source version and release provenance remain
the basis for each export.

Catalog color: `#0fa64a`.

## Screenshots

Screenshots can be added here as the customer-facing experience evolves:

<!--
![FlatPack in the Email Builder](screenshots/builder.png)
![FlatPack variation settings](screenshots/variation-settings.png)
![FlatPack completed Email output](screenshots/completed-output.png)
-->

## Learn more

The FlatPack 1.4.0 candidate is maintained in this repository under
integrations/flatpack. It declares mosaic-package-host-v1, a minimum Mosaic
version of 0.0.3, and compiler version 139. The release descriptor is checked
against a pinned v3 host schema and records the exact Worker and schema bytes.

Run npm test from this directory to rebuild the Worker, verify the release
descriptor and artifact digests, and prepare the files under .release-assets/.
Mosaic still controls installation and Library enablement in **Admin → Settings →
Integrations**. Updating an installation can require authors to rebind saved
FlatPack regions before Review and Complete; existing completed output is not
silently reinterpreted.
