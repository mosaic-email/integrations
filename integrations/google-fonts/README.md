# Google Fonts

Google Fonts is a standalone Mosaic source-parser package. It normalizes bounded Fontsource catalog batches, validates an exact static-family selection, and parses a bounded Google Fonts CSS2 response into font-face declarations.

Mosaic owns all network access. Its host fetches Fontsource metadata, requests CSS from Google Fonts with the established static-font User-Agent, checks URLs, downloads and validates WOFF resources, computes hashes, and stores governed font records. The package Worker receives only bounded JSON or CSS strings and has no network, filesystem, credential, or persistent-data authority.

## Release compatibility

| | Version |
| --- | --- |
| Package | 1.1.0 |
| Mosaic | 0.0.3 or later |
| Compiler interface | 141 or later |

The Worker implements one fixed source-parser operation. It does not add a generic connector, network permission, cache, renderer, asset-delivery path, or completion path.

## Local checks

Run npm test to build the release descriptor and assets, validate the release/schema contract, and test catalog normalization, static selection, and CSS parsing.

