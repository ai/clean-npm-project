import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import IGNORE_FIELDS from './ignore-fields.js'
import IGNORE_FILES from './ignore-files.js'
import IGNORE_SCRIPTS from './ignore-scripts.js'

const TARGET = 'cleaned-project'

function input(name) {
  return process.env[`INPUT_${name.replace(/-/g, '_').toUpperCase()}`] ?? ''
}

function isTrue(value) {
  return value === 'true' || value === '1'
}

function isIgnored(name) {
  return IGNORE_FILES.some(rule => {
    if (typeof rule === 'string') return rule === name
    return rule.test(name)
  })
}

async function copyClean(src, dest) {
  await mkdir(dest, { recursive: true })
  for (const name of await readdir(src)) {
    if (name === TARGET || isIgnored(name)) continue
    await cp(join(src, name), join(dest, name), {
      filter: source => !isIgnored(basename(source)),
      recursive: true
    })
  }
}

function cleanPackageJson(pkg, extraFields) {
  const out = {}
  for (const [key, value] of Object.entries(pkg)) {
    if (IGNORE_FIELDS.includes(key)) continue
    if (extraFields.includes(key)) continue
    out[key] = value
  }
  if (out.scripts) {
    const scripts = {}
    for (const [name, value] of Object.entries(out.scripts)) {
      if (!IGNORE_SCRIPTS.includes(name)) scripts[name] = value
    }
    if (Object.keys(scripts).length === 0) {
      delete out.scripts
    } else {
      out.scripts = scripts
    }
  }
  if (out.publishConfig && typeof out.publishConfig === 'object') {
    Object.assign(out, out.publishConfig)
    delete out.publishConfig
  }
  return out
}

function trimReadme(md) {
  const lines = md.split('\n')
  const out = []
  let started = false
  for (const line of lines) {
    if (/^#\s/.test(line)) {
      started = true
      out.push(line)
      continue
    }
    if (started && /^##\s/.test(line)) break
    if (started) out.push(line)
  }
  return out.join('\n').trimEnd() + '\n'
}

// Strips // and /* */ comments while preserving string and template literals.
function stripComments(code) {
  let out = ''
  let i = 0
  while (i < code.length) {
    const c = code[i]
    const next = code[i + 1]
    if (c === '/' && next === '/') {
      const end = code.indexOf('\n', i)
      i = end === -1 ? code.length : end
    } else if (c === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2)
      i = end === -1 ? code.length : end + 2
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out += c
      i++
      while (i < code.length) {
        const ch = code[i]
        out += ch
        if (ch === '\\') {
          out += code[i + 1] ?? ''
          i += 2
          continue
        }
        i++
        if (ch === quote) break
      }
    } else {
      out += c
      i++
    }
  }
  return out
}

async function walkJs(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkJs(full)))
    } else if (/\.[cm]?js$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

const cleanDocs = isTrue(input('clean-docs'))
const cleanComments = isTrue(input('clean-comments'))
const extraFields = input('fields')
  .split(/[\s,]+/)
  .filter(Boolean)

const src = process.cwd()
const dest = join(src, TARGET)

await rm(dest, { force: true, recursive: true })
await copyClean(src, dest)

const pkgPath = join(dest, 'package.json')
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
await writeFile(
  pkgPath,
  JSON.stringify(cleanPackageJson(pkg, extraFields), null, 2) + '\n'
)

if (cleanDocs) {
  const readmePath = join(dest, 'README.md')
  const md = await readFile(readmePath, 'utf8').catch(() => null)
  if (md !== null) await writeFile(readmePath, trimReadme(md))
}

if (cleanComments) {
  for (const file of await walkJs(dest)) {
    const code = await readFile(file, 'utf8')
    await writeFile(file, stripComments(code))
  }
}

console.log(`Cleaned project written to ${TARGET}/`)
