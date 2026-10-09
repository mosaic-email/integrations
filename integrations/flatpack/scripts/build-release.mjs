import { createHash } from "node:crypto"
import { basename, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"

const packageRoot = resolve(fileURLToPath(new URL("../", import.meta.url)))
const manifest = await readJson("mosaic-package.json")
const release = await readJson("mosaic-package-release.json")
const support = await readJson("tests/fixtures/supported-host-contract.json")
const artifactFiles = [
  ["dist/worker.js", "worker", "text/javascript"],
  ["schemas/flatpack.email_raster_source_v1.schema.json", "schema", "application/schema+json"],
  ["schemas/flatpack.email_raster_plan_request_v2.schema.json", "schema", "application/schema+json"],
  ["schemas/flatpack.email_raster_plan_v2.schema.json", "schema", "application/schema+json"],
]

if (
  manifest.version !== release.version ||
  release.schemaVersion !== support.releaseSchemaVersion ||
  release.hostContract !== support.hostContract ||
  release.mosaicCompatibility.minimumVersion !== support.minimumMosaicVersion ||
  release.compilerCompatibility?.minimumVersion !== support.minimumCompilerVersion
)
  throw new Error("FLATPACK_RELEASE_SUPPORT_FIXTURE_MISMATCH")

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
  if (names.has(name)) throw new Error("FLATPACK_RELEASE_ASSET_NAME_COLLISION")
  names.add(name)
  await copyFile(resolveInsidePackage(artifact.path), join(assetDirectory, name))
}
console.log("Built FlatPack " + release.version + " release assets in .release-assets/")

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
    throw new Error("FLATPACK_RELEASE_PATH_INVALID")
  return resolved
}

function digest(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex")
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
