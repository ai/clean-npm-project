import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'

import IGNORE_FIELDS from './ignore-fields.js'
import IGNORE_FILES from './ignore-files.js'
import KEEP_SCRIPTS from './keep-scripts.js'

const TARGET = 'cleaned-project'

function input(name) {
  // GitHub builds INPUT_* vars by uppercasing and replacing spaces
  // with underscores, so `clean-docs` becomes `INPUT_CLEAN-DOCS`.
  return process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? ''
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
  for (let name of await readdir(src)) {
    if (name === TARGET || isIgnored(name)) continue
    await cp(join(src, name), join(dest, name), {
      filter: source => !isIgnored(basename(source)),
      recursive: true
    })
  }
}

function cleanPackageJson(pkg, extraFields) {
  let out = {}
  for (let [key, value] of Object.entries(pkg)) {
    if (IGNORE_FIELDS.includes(key) || extraFields.includes(key)) {
      console.log(`Removed package.json key ${key}`)
      continue
    }
    out[key] = value
  }
  if (out.scripts) {
    let scripts = {}
    for (let [name, value] of Object.entries(out.scripts)) {
      if (!KEEP_SCRIPTS.includes(name)) {
        console.log(`Removed package.json key scripts.${name}`)
      } else {
        scripts[name] = value
      }
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
  let lines = md.split('\n')
  let out = []
  let started = false
  for (let line of lines) {
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
// A comment that fills a whole line drops the line; a trailing comment drops
// the whitespace before it, so no blank or dangling lines are left behind.
function stripComments(code) {
  let out = ''
  let i = 0
  while (i < code.length) {
    let c = code[i]
    let next = code[i + 1]
    if (c === '/' && next === '/') {
      let nl = code.indexOf('\n', i)
      let lineStart = out.lastIndexOf('\n') + 1
      if (out.slice(lineStart).trim() === '') {
        out = out.slice(0, lineStart)
        i = nl === -1 ? code.length : nl + 1
      } else {
        out = out.replace(/[ \t]+$/, '')
        i = nl === -1 ? code.length : nl
      }
    } else if (c === '/' && next === '*') {
      let end = code.indexOf('*/', i + 2)
      let after = end === -1 ? code.length : end + 2
      let nl = code.indexOf('\n', after)
      let lineStart = out.lastIndexOf('\n') + 1
      let trailing = code.slice(after, nl === -1 ? code.length : nl)
      if (out.slice(lineStart).trim() === '' && trailing.trim() === '') {
        out = out.slice(0, lineStart)
        i = nl === -1 ? code.length : nl + 1
      } else {
        out = out.replace(/[ \t]+$/, '')
        i = after
      }
    } else if (c === '"' || c === "'" || c === '`') {
      let quote = c
      out += c
      i++
      while (i < code.length) {
        let ch = code[i]
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
  let files = []
  for (let entry of await readdir(dir, { withFileTypes: true })) {
    let full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkJs(full)))
    } else if (/\.[cm]?js$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

let cleanDocs = isTrue(input('clean-docs'))
let cleanComments = isTrue(input('clean-comments'))
let extraFields = input('fields')
  .split(/[\s,]+/)
  .filter(Boolean)

let src = process.cwd()
let dest = join(src, TARGET)

await rm(dest, { force: true, recursive: true })
await copyClean(src, dest)

let pkgPath = join(dest, 'package.json')
let pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
await writeFile(
  pkgPath,
  JSON.stringify(cleanPackageJson(pkg, extraFields), null, 2) + '\n'
)
console.log(`Cleaned ${relative(dest, pkgPath)}`)

if (cleanDocs) {
  let readmePath = join(dest, 'README.md')
  let md = await readFile(readmePath, 'utf8').catch(() => null)
  if (md !== null) {
    let trimmed = trimReadme(md)
    if (trimmed !== md) {
      await writeFile(readmePath, trimmed)
      console.log('Cleaned README.md to the intro section')
    }
  }
}

if (cleanComments) {
  for (let file of await walkJs(dest)) {
    let code = await readFile(file, 'utf8')
    let stripped = stripComments(code)
    if (stripped !== code) {
      await writeFile(file, stripped)
      console.log(`Cleaned comments from ${relative(dest, file)}`)
    }
  }
}

console.log(`Cleaned project written to ${TARGET}/`)
