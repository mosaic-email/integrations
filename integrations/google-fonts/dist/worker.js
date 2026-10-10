const OPERATION_ID = "google_fonts.parse_font_source"
const ERROR_CODES = [
  "GOOGLE_FONT_CATALOG_INVALID",
  "GOOGLE_FONT_SELECTION_INVALID",
  "GOOGLE_FONT_SELECTION_UNSUPPORTED",
  "GOOGLE_FONT_CSS_INVALID",
  "GOOGLE_FONT_CSS_UNSUPPORTED",
  "GOOGLE_FONT_RESOURCE_INVALID",
]
const ALLOWED_CATEGORIES = new Set([
  "display",
  "handwriting",
  "icons",
  "monospace",
  "sans-serif",
  "serif",
])
if (context.operationId !== OPERATION_ID) throw new Error("UNKNOWN_OPERATION")

return parseFontSource(input)

function parseFontSource(input) {
  const fallback =
    isRecord(input) && input.kind === "selection"
      ? "GOOGLE_FONT_SELECTION_INVALID"
      : isRecord(input) && input.kind === "css"
        ? "GOOGLE_FONT_CSS_INVALID"
        : "GOOGLE_FONT_CATALOG_INVALID"
  try {
    if (!isRecord(input)) fail(fallback)
    if (input.kind === "catalog") return parseCatalog(input)
    if (input.kind === "selection") return parseSelection(input)
    if (input.kind === "css") return parseCss(input)
    fail(fallback)
  } catch (error) {
    const code =
      error && typeof error.googleFontCode === "string" &&
      ERROR_CODES.includes(error.googleFontCode)
        ? error.googleFontCode
        : fallback
    return { kind: "error", code }
  }
}

function parseCatalog(input) {
  if (!Array.isArray(input.rows) || input.rows.length > 128)
    fail("GOOGLE_FONT_CATALOG_INVALID")
  const fonts = []
  for (const row of input.rows) {
    if (!isRecord(row) || row.type !== "google") continue
    fonts.push(normalizeCatalogItem(row))
  }
  return { kind: "catalog", fonts }
}

function normalizeCatalogItem(row) {
  const category = row.category
  if (
    typeof row.id !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(row.id) ||
    typeof row.family !== "string" ||
    row.family.trim() !== row.family ||
    row.family.length < 1 ||
    row.family.length > 100 ||
    /[\u0000-\u001f\u007f]/u.test(row.family) ||
    typeof category !== "string" ||
    !ALLOWED_CATEGORIES.has(category) ||
    !Array.isArray(row.weights) ||
    !Array.isArray(row.styles) ||
    !Array.isArray(row.subsets) ||
    typeof row.variable !== "boolean" ||
    typeof row.lastModified !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(row.lastModified)
  ) {
    fail("GOOGLE_FONT_CATALOG_INVALID")
  }
  const weights = row.weights.map((weight) => {
    if (
      typeof weight !== "number" ||
      !Number.isSafeInteger(weight) ||
      weight < 100 ||
      weight > 900 ||
      weight % 100 !== 0
    ) {
      fail("GOOGLE_FONT_CATALOG_INVALID")
    }
    return weight
  })
  const styles = row.styles.map((style) => {
    if (style !== "normal" && style !== "italic")
      fail("GOOGLE_FONT_CATALOG_INVALID")
    return style
  })
  const subsets = row.subsets.map((subset) => {
    if (typeof subset !== "string" || !/^[a-z0-9-]{1,40}$/u.test(subset))
      fail("GOOGLE_FONT_CATALOG_INVALID")
    return subset
  })
  if (
    weights.length === 0 ||
    styles.length === 0 ||
    new Set(weights).size !== weights.length ||
    new Set(styles).size !== styles.length ||
    new Set(subsets).size !== subsets.length
  ) {
    fail("GOOGLE_FONT_CATALOG_INVALID")
  }
  return {
    id: row.id,
    family: row.family,
    category,
    weights,
    styles,
    subsets,
    variable: row.variable,
    lastModified: row.lastModified,
    supported: /^[A-Za-z][A-Za-z0-9 .&'()-]{0,79}$/u.test(row.family),
  }
}

function parseSelection(input) {
  if (!isRecord(input.font) || !isRecord(input.selection))
    fail("GOOGLE_FONT_SELECTION_INVALID")
  const font = input.font
  const selection = validateSelectionInput(input.selection)
  if (
    typeof font.id !== "string" ||
    typeof font.family !== "string" ||
    font.id !== selection.id ||
    font.family.normalize("NFKC") !== selection.family.normalize("NFKC") ||
    !Array.isArray(font.weights) ||
    !Array.isArray(font.styles) ||
    typeof font.supported !== "boolean"
  ) {
    fail("GOOGLE_FONT_SELECTION_INVALID")
  }
  if (!font.supported)
    fail("GOOGLE_FONT_SELECTION_UNSUPPORTED")
  const variants = normalizeVariants(selection.variants, font)
  return {
    kind: "selection",
    id: font.id,
    family: font.family,
    variants,
  }
}

function validateSelectionInput(input) {
  if (
    typeof input.family !== "string" ||
    input.family.length < 1 ||
    input.family.length > 100 ||
    /[\u0000-\u001f\u007f]/u.test(input.family) ||
    typeof input.id !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.id) ||
    !Array.isArray(input.variants) ||
    input.variants.length < 1 ||
    input.variants.length > 20
  ) {
    fail("GOOGLE_FONT_SELECTION_INVALID")
  }
  return {
    family: input.family,
    id: input.id,
    variants: input.variants.map(validateVariant),
  }
}

function validateVariant(variant) {
  if (
    !isRecord(variant) ||
    typeof variant.weight !== "number" ||
    !Number.isSafeInteger(variant.weight) ||
    variant.weight < 100 ||
    variant.weight > 900 ||
    variant.weight % 100 !== 0 ||
    (variant.style !== "normal" && variant.style !== "italic")
  ) {
    fail("GOOGLE_FONT_SELECTION_INVALID")
  }
  return { weight: variant.weight, style: variant.style }
}

function normalizeVariants(variants, font) {
  if (variants.length < 1 || variants.length > 20)
    fail("GOOGLE_FONT_SELECTION_INVALID")
  const keys = new Set()
  const normalized = variants.map((variant) => {
    const item = validateVariant(variant)
    const key = item.weight + ":" + item.style
    if (!font.weights.includes(item.weight) || !font.styles.includes(item.style) || keys.has(key))
      fail("GOOGLE_FONT_SELECTION_INVALID")
    keys.add(key)
    return item
  })
  return normalized.sort(
    (left, right) =>
      Number(left.style === "italic") - Number(right.style === "italic") ||
      left.weight - right.weight
  )
}

function parseCss(input) {
  if (
    typeof input.css !== "string" ||
    typeof input.family !== "string" ||
    !Array.isArray(input.variants) ||
    !/^[A-Za-z][A-Za-z0-9 .&'()-]{0,79}$/u.test(input.family)
  ) {
    fail("GOOGLE_FONT_CSS_INVALID")
  }
  const variants = input.variants.map(validateCssVariant)
  const faces = parseGoogleCss(input.css, input.family, variants)
  return { kind: "css", faces }
}

function validateCssVariant(value) {
  if (
    !isRecord(value) ||
    typeof value.weight !== "number" ||
    !Number.isSafeInteger(value.weight) ||
    value.weight < 100 ||
    value.weight > 900 ||
    value.weight % 100 !== 0 ||
    (value.style !== "normal" && value.style !== "italic")
  )
    fail("GOOGLE_FONT_CSS_INVALID")
  return { weight: value.weight, style: value.style }
}

function parseGoogleCss(css, family, variants) {
  const rules = [...css.matchAll(/@font-face\s*\{([^{}]*)\}/giu)]
  const remainder = css.replace(/@font-face\s*\{([^{}]*)\}/giu, "")
  if (
    rules.length !== variants.length ||
    remainder.trim() !== "" ||
    /unicode-range|@import|@media|<style|<script/iu.test(css)
  ) {
    fail("GOOGLE_FONT_CSS_UNSUPPORTED")
  }

  const expected = new Set(
    variants.map(({ weight, style }) => weight + ":" + style)
  )
  const seenVariants = new Set()
  const seenUrls = new Set()
  const faces = []
  for (const rule of rules) {
    const body = rule[1]
    if (body === undefined) fail("GOOGLE_FONT_CSS_INVALID")
    const declarations = new Map()
    for (const part of body.split(";")) {
      if (part.trim() === "") continue
      const declaration = /^\s*([a-z-]+)\s*:\s*([^;]+?)\s*$/iu.exec(part)
      if (
        declaration === null ||
        declaration[1] === undefined ||
        declaration[2] === undefined
      ) {
        fail("GOOGLE_FONT_CSS_INVALID")
      }
      const property = declaration[1].toLowerCase()
      if (declarations.has(property))
        fail("GOOGLE_FONT_CSS_INVALID")
      declarations.set(property, declaration[2].trim())
    }
    if (
      declarations.size !== 6 ||
      ![
        "font-family",
        "font-style",
        "font-weight",
        "font-stretch",
        "font-display",
        "src",
      ].every((property) => declarations.has(property))
    ) {
      fail("GOOGLE_FONT_CSS_UNSUPPORTED")
    }
    const cssFamily = unquoteCssString(declarations.get("font-family"))
    const style = declarations.get("font-style")
    const weightText = declarations.get("font-weight")
    const weight =
      weightText !== undefined && /^\d{3}$/u.test(weightText)
        ? Number(weightText)
        : NaN
    if (
      cssFamily !== family ||
      (style !== "normal" && style !== "italic") ||
      declarations.get("font-stretch") !== "normal" ||
      declarations.get("font-display") !== "swap" ||
      !Number.isSafeInteger(weight)
    ) {
      fail("GOOGLE_FONT_CSS_UNSUPPORTED")
    }
    const key = weight + ":" + style
    if (!expected.has(key) || seenVariants.has(key))
      fail("GOOGLE_FONT_CSS_UNSUPPORTED")
    const source =
      /^url\(([^(),\s]+)\)\s+format\((['"]?)(woff2?|woff)\2\)$/iu.exec(
        declarations.get("src") || ""
      )
    if (source === null || source[1] === undefined || source[3] === undefined)
      fail("GOOGLE_FONT_CSS_UNSUPPORTED")
    const sourceUrl = trustedGoogleFontUrl(source[1])
    const format = source[3].toLowerCase()
    if (fontFormatFromUrl(sourceUrl) !== format || seenUrls.has(sourceUrl))
      fail("GOOGLE_FONT_CSS_UNSUPPORTED")
    seenVariants.add(key)
    seenUrls.add(sourceUrl)
    faces.push({ sourceUrl, weight, style, format })
  }
  if (seenVariants.size !== expected.size)
    fail("GOOGLE_FONT_CSS_UNSUPPORTED")
  return faces.sort(
    (left, right) =>
      Number(left.style === "italic") - Number(right.style === "italic") ||
      left.weight - right.weight
  )
}

function unquoteCssString(value) {
  if (
    typeof value !== "string" ||
    value.length < 2 ||
    (value[0] !== "'" && value[0] !== '"') ||
    value[value.length - 1] !== value[0] ||
    value.slice(1, -1).includes("\\")
  ) {
    fail("GOOGLE_FONT_CSS_UNSUPPORTED")
  }
  return value.slice(1, -1)
}

function trustedGoogleFontUrl(value) {
  if (
    typeof value !== "string" ||
    !/^https:\/\/fonts\.gstatic\.com\/s\/[a-z0-9]+\/v\d+\/[A-Za-z0-9_-]+\.woff2?$/u.test(value)
  ) {
    fail("GOOGLE_FONT_RESOURCE_INVALID")
  }
  return value
}

function fontFormatFromUrl(value) {
  return value.toLowerCase().endsWith(".woff2")
    ? "woff2"
    : value.toLowerCase().endsWith(".woff")
      ? "woff"
      : "unknown"
}

function fail(code) {
  const error = new Error(code)
  error.googleFontCode = code
  throw error
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

