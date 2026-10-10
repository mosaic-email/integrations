import { createHash } from "node:crypto"
import { basename, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"

const packageRoot = resolve(fileURLToPath(new URL("../", import.meta.url)))
const manifest = await readJson("mosaic-package.json")
const packageJson = await readJson("package.json")
const release = await readJson("mosaic-package-release.json")
const support = await readJson("tests/fixtures/supported-host-contract.json")
const artifactFiles = [
  ["dist/worker.js", "worker", "text/javascript"],
  ["schemas/google_fonts.parse_font_source_request_v1.schema.json", "schema", "application/schema+json"],
  ["schemas/google_fonts.parse_font_source_result_v1.schema.json", "schema", "application/schema+json"],
]

if (
  manifest.version !== packageJson.version ||
  manifest.version !== release.version ||
  compareVersions(release.version, support.minimumPackageVersion) < 0 ||
  support.releaseSchemaVersion !== release.schemaVersion ||
  support.hostContract !== release.hostContract ||
  support.packageKey !== release.packageKey ||
  support.catalogSlug !== release.catalogSlug ||
  support.minimumMosaicVersion !== release.mosaicCompatibility.minimumVersion ||
  support.minimumCompilerVersion !== release.compilerCompatibility?.minimumVersion ||
  support.workerInterface !== release.interfaces.worker?.version ||
  support.workerArtifactPath !== release.interfaces.worker?.artifactPath ||
  support.sourceCodecIdentity !== release.interfaces.data.sourceCodecIdentity ||
  support.operationId !== release.interfaces.worker.operations[0]?.id ||
  support.operationId !== release.contributions[0]?.operationId ||
  support.contributionId !== release.contributions[0]?.id ||
  support.inputSchemaId !== release.interfaces.worker.operations[0]?.inputSchemaId ||
  support.resultSchemaId !== release.interfaces.worker.operations[0]?.resultSchemaId ||
  support.inputSchemaId !== release.contributions[0]?.inputSchemaId ||
  support.resultSchemaId !== release.contributions[0]?.resultSchemaId ||
  release.capabilities.length !== 0 ||
  release.contributions.length !== 1 ||
  release.contributions[0]?.kind !== "output" ||
  release.contributions[0]?.requiredCapabilityId !== null ||
  release.interfaces.uiBridge !== null ||
  release.interfaces.connectorJobs !== null ||
  release.interfaces.data.records.length !== 0 ||
  release.interfaces.data.migrations.length !== 0 ||
  release.interfaces.data.retainedSourceCodecIdentities.length !== 0
) {
  throw new Error("GOOGLE_FONT_SOURCE_RELEASE_SUPPORT_FIXTURE_MISMATCH")
}

await mkdir(resolveInsidePackage("dist"), { recursive: true })
await copyFile(resolveInsidePackage("src/worker.js"), resolveInsidePackage("dist/worker.js"))
release.artifacts = await Promise.all(
  artifactFiles.map(async ([path, kind, mediaType]) => {
    const bytes = await readFile(resolveInsidePackage(path))
    return { path, kind, mediaType, byteSize: bytes.byteLength, digest: digest(bytes) }
  })
)
release.releaseDigest = digest(
  Buffer.from(canonicalJson(withoutReleaseLocationAndDigest(release)), "utf8")
)
await writeJson("mosaic-package-release.json", release)

const assetDirectory = resolveInsidePackage(".release-assets")
await rm(assetDirectory, { recursive: true, force: true })
await mkdir(assetDirectory, { recursive: true })
await copyFile(
  resolveInsidePackage("mosaic-package-release.json"),
  join(assetDirectory, "mosaic-package-release.json")
)
const names = new Set(["mosaic-package-release.json"])
for (const artifact of release.artifacts) {
  const name = basename(artifact.path)
  if (names.has(name)) throw new Error("GOOGLE_FONT_RELEASE_ASSET_NAME_COLLISION")
  names.add(name)
  await copyFile(resolveInsidePackage(artifact.path), join(assetDirectory, name))
}
console.log("Built Google Fonts " + release.version + " release assets in .release-assets/")

async function readJson(path) {
  return JSON.parse(await readFile(resolveInsidePackage(path), "utf8"))
}

async function writeJson(path, value) {
  await writeFile(
    resolveInsidePackage(path),
    JSON.stringify(value, null, 2) + "\n",
    "utf8"
  )
}

function resolveInsidePackage(path) {
  const resolved = resolve(packageRoot, path)
  if (!resolved.startsWith(packageRoot + sep))
    throw new Error("GOOGLE_FONT_RELEASE_PATH_INVALID")
  return resolved
}

function digest(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex")
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

function withoutReleaseLocationAndDigest(value) {
  const { $schema, releaseDigest, ...descriptor } = value
  return descriptor
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]"
  return "{" + Object.keys(value)
    .sort()
    .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key]))
    .join(",") + "}"
}

