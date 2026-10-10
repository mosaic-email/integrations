import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import Ajv2020 from "ajv/dist/2020.js"

const root = new URL("../", import.meta.url)
const ajv = new Ajv2020({ allErrors: true, strict: false })
const json = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"))
const digest = (bytes) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex")
const workerSource = await readFile(new URL("src/worker.js", root), "utf8")
const workerBundle = await readFile(new URL("dist/worker.js", root), "utf8")
const release = await json("mosaic-package-release.json")
const manifest = await json("mosaic-package.json")
const support = await json("tests/fixtures/supported-host-contract.json")
const baseline = await json("tests/fixtures/release-1.1.0-artifacts.json")
const hostSchema = await json("schemas/mosaic-package-release-v3.schema.json")
const requestSchema = await json("schemas/google_fonts.parse_font_source_request_v1.schema.json")
const resultSchema = await json("schemas/google_fonts.parse_font_source_result_v1.schema.json")

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]"
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}"
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number)
  const rightParts = right.split(".").map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) return difference
  }
  return 0
}

function validate(schema, value) {
  const validator = ajv.compile(schema)
  assert.equal(validator(value), true, JSON.stringify(validator.errors))
}

function run(input, operationId = "google_fonts.parse_font_source") {
  return Function("input", "context", workerBundle)(input, { operationId })
}

function baseFont(overrides = {}) {
  return {
    id: "roboto",
    type: "google",
    family: "Roboto",
    category: "sans-serif",
    weights: [400, 700],
    styles: ["normal", "italic"],
    subsets: ["latin"],
    variable: false,
    lastModified: "2025-01-02",
    ...overrides,
  }
}

test("release descriptor matches the fixed package identity and host contract", () => {
  validate(hostSchema, release)
  assert.equal(release.schemaVersion, support.releaseSchemaVersion)
  assert.equal(release.hostContract, support.hostContract)
  assert.equal(release.publisherKey, "lockidynamics")
  assert.equal(release.packageKey, support.packageKey)
  assert.equal(release.catalogSlug, support.catalogSlug)
  assert.equal(release.version, manifest.version)
  assert.ok(compareVersions(release.version, support.minimumPackageVersion) >= 0)
  assert.equal(manifest.name, "Google Fonts")
  assert.equal(manifest.slug, release.catalogSlug)
  assert.equal(manifest.version, release.version)
  assert.equal(manifest.mosaicVersion, release.mosaicCompatibility.minimumVersion)
  assert.equal(release.mosaicCompatibility.minimumVersion, support.minimumMosaicVersion)
  assert.equal(release.mosaicCompatibility.maximumVersion, null)
  assert.equal(release.compilerCompatibility.minimumVersion, support.minimumCompilerVersion)
  assert.equal(release.interfaces.worker.version, support.workerInterface)
  assert.equal(release.interfaces.worker.artifactPath, support.workerArtifactPath)
  assert.equal(release.interfaces.worker.operations[0].id, support.operationId)
  assert.equal(release.interfaces.worker.operations[0].inputSchemaId, support.inputSchemaId)
  assert.equal(release.interfaces.worker.operations[0].resultSchemaId, support.resultSchemaId)
  assert.deepEqual(release.capabilities, [])
  assert.equal(release.contributions.length, 1)
  assert.equal(release.contributions[0].id, support.contributionId)
  assert.equal(release.contributions[0].kind, "output")
  assert.equal(release.contributions[0].requiredCapabilityId, null)
  assert.equal(release.interfaces.data.sourceCodecIdentity, support.sourceCodecIdentity)
  assert.deepEqual(release.interfaces.data.retainedSourceCodecIdentities, [])
  assert.deepEqual(release.interfaces.data.records, [])
  assert.deepEqual(release.interfaces.data.migrations, [])
  assert.equal(release.interfaces.connectorJobs, null)
  assert.deepEqual(release.artifacts.map(({ path }) => path), [
    support.workerArtifactPath,
    "schemas/" + support.inputSchemaId + ".schema.json",
    "schemas/" + support.resultSchemaId + ".schema.json",
  ])
  assert.deepEqual(
    Object.fromEntries(release.artifacts.map(({ path, digest }) => [path, digest])),
    baseline.artifactDigests
  )
})

test("release digest and declared artifact bytes are exact", async () => {
  const descriptor = { ...release }
  delete descriptor.$schema
  delete descriptor.releaseDigest
  assert.equal(digest(Buffer.from(stableJson(descriptor))), release.releaseDigest)
  for (const artifact of release.artifacts) {
    const bytes = await readFile(new URL(artifact.path, root))
    assert.equal(bytes.byteLength, artifact.byteSize, artifact.path)
    assert.equal(digest(bytes), artifact.digest, artifact.path)
    const name = artifact.path.split("/").at(-1)
    assert.equal(digest(await readFile(new URL(".release-assets/" + name, root))), artifact.digest, name)
  }
  assert.deepEqual(
    await readFile(new URL(".release-assets/mosaic-package-release.json", root)),
    Buffer.from(JSON.stringify(release, null, 2) + "\n")
  )
})

test("operation schemas use the supported bounded schema dialect", () => {
  const allowed = new Set([
    "$schema", "type", "properties", "required", "additionalProperties", "items",
    "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum",
    "enum", "const", "oneOf", "anyOf", "allOf", "description",
  ])
  for (const [name, schema] of [["request", requestSchema], ["result", resultSchema]]) {
    let nodes = 0
    let maximumDepth = 0
    const visit = (node, depth) => {
      nodes += 1
      maximumDepth = Math.max(maximumDepth, depth)
      for (const [key, value] of Object.entries(node)) {
        assert.ok(allowed.has(key), name + " uses unsupported schema keyword " + key)
        if (key === "properties") {
          for (const child of Object.values(value)) visit(child, depth + 1)
        } else if (key === "items") {
          visit(value, depth + 1)
        } else if (["oneOf", "anyOf", "allOf"].includes(key)) {
          for (const child of value) visit(child, depth + 1)
        }
      }
    }
    visit(schema, 1)
    assert.ok(nodes <= 2000, name + " schema node count " + nodes)
    assert.ok(maximumDepth <= 24, name + " schema depth " + maximumDepth)
  }
})

test("catalog batches normalize Google fonts and skip other metadata sources", () => {
  const input = {
    kind: "catalog",
    rows: [
      baseFont(),
      { family: "Ignored", type: "typekit" },
      null,
    ],
  }
  validate(requestSchema, input)
  const output = run(input)
  validate(resultSchema, output)
  assert.deepEqual(output, {
    kind: "catalog",
    fonts: [{
      id: "roboto",
      family: "Roboto",
      category: "sans-serif",
      weights: [400, 700],
      styles: ["normal", "italic"],
      subsets: ["latin"],
      variable: false,
      lastModified: "2025-01-02",
      supported: true,
    }],
  })
  assert.deepEqual(run({ kind: "catalog", rows: [baseFont({ weights: [425] })] }), {
    kind: "error",
    code: "GOOGLE_FONT_CATALOG_INVALID",
  })
  assert.deepEqual(run({ kind: "catalog", rows: [baseFont({ lastModified: "2025-1-02" })] }), {
    kind: "error",
    code: "GOOGLE_FONT_CATALOG_INVALID",
  })
})

test("catalog preserves unsupported-family flags and metadata-only variable fonts", () => {
  const unsupported = run({
    kind: "catalog",
    rows: [baseFont({ id: "noto-sans", family: "Ｎｏｔｏ Sans" })],
  }).fonts[0]
  assert.equal(unsupported.supported, false)
  assert.deepEqual(run({
    kind: "selection",
    font: unsupported,
    selection: {
      family: "Noto Sans",
      id: "noto-sans",
      variants: [{ weight: 400, style: "normal" }],
    },
  }), { kind: "error", code: "GOOGLE_FONT_SELECTION_UNSUPPORTED" })

  const variable = run({
    kind: "catalog",
    rows: [baseFont({ variable: true, weights: [400], styles: ["normal"] })],
  }).fonts[0]
  assert.equal(variable.variable, true)
  assert.deepEqual(run({
    kind: "selection",
    font: variable,
    selection: {
      family: "Roboto",
      id: "roboto",
      variants: [{ weight: 400, style: "normal" }],
    },
  }), {
    kind: "selection",
    id: "roboto",
    family: "Roboto",
    variants: [{ weight: 400, style: "normal" }],
  })
})

test("static selections reject mismatched families and return stable variants", () => {
  const catalog = run({ kind: "catalog", rows: [baseFont()] })
  const font = catalog.fonts[0]
  const input = {
    kind: "selection",
    font,
    selection: {
      family: "Roboto",
      id: "roboto",
      variants: [
        { weight: 700, style: "italic" },
        { weight: 400, style: "normal" },
      ],
    },
  }
  validate(requestSchema, input)
  const output = run(input)
  validate(resultSchema, output)
  assert.deepEqual(output, {
    kind: "selection",
    id: "roboto",
    family: "Roboto",
    variants: [
      { weight: 400, style: "normal" },
      { weight: 700, style: "italic" },
    ],
  })
  assert.deepEqual(run({
    ...input,
    selection: { ...input.selection, family: "Inter" },
  }), { kind: "error", code: "GOOGLE_FONT_SELECTION_INVALID" })
  assert.deepEqual(run({
    ...input,
    selection: { ...input.selection, variants: [{ weight: 500, style: "normal" }] },
  }), { kind: "error", code: "GOOGLE_FONT_SELECTION_INVALID" })
  assert.deepEqual(run({
    ...input,
    font: { ...font, supported: false },
  }), { kind: "error", code: "GOOGLE_FONT_SELECTION_UNSUPPORTED" })
})

test("CSS parsing returns only exact static declarations for trusted Google font files", () => {
  const css = "@font-face { font-family: 'Roboto'; font-style: normal; font-weight: 400; font-stretch: normal; font-display: swap; src: url(https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2) format('woff2'); }"
  const input = {
    kind: "css",
    css,
    family: "Roboto",
    variants: [{ weight: 400, style: "normal" }],
  }
  validate(requestSchema, input)
  const output = run(input)
  validate(resultSchema, output)
  assert.deepEqual(output, {
    kind: "css",
    faces: [{
      sourceUrl: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2",
      weight: 400,
      style: "normal",
      format: "woff2",
    }],
  })
  assert.deepEqual(run({
    ...input,
    css: css.replace("fonts.gstatic.com", "example.com"),
  }), { kind: "error", code: "GOOGLE_FONT_RESOURCE_INVALID" })
  assert.deepEqual(run({
    ...input,
    css: css.replace(" }", " unicode-range: U+0000-00FF; }"),
  }), { kind: "error", code: "GOOGLE_FONT_CSS_UNSUPPORTED" })
  assert.deepEqual(run({
    ...input,
    css: css + "@import url(https://example.com/other.css);",
  }), { kind: "error", code: "GOOGLE_FONT_CSS_UNSUPPORTED" })
  assert.deepEqual(run({
    ...input,
    css: css.replace("font-weight: 400", "font-weight: 100 900"),
  }), { kind: "error", code: "GOOGLE_FONT_CSS_UNSUPPORTED" })
})

test("Worker exposes no network or package ambient authority", () => {
  assert.doesNotMatch(workerSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|indexedDB|localStorage/u)
  assert.throws(() => run({ kind: "catalog", rows: [] }, "google_fonts.other_operation"), /UNKNOWN_OPERATION/u)
})

