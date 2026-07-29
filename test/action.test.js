import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { promisify } from 'node:util'

const ACTION = join(import.meta.dirname, '..', 'action.js')
let exec = promisify(execFile)

function envFor(inputs) {
  let env = { ...process.env }
  for (let [name, value] of Object.entries(inputs)) {
    env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] = String(value)
  }
  return env
}

async function run(cwd, inputs = {}) {
  await exec(process.execPath, [ACTION], { cwd, env: envFor(inputs) })
  return join(cwd, 'cleaned-project')
}

let dir
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'clean-project-'))
})
afterEach(async () => {
  await rm(dir, { force: true, recursive: true })
})

describe('action.js', () => {
  test('removes default ignored files and directories', async () => {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'pkg', version: '1.0.0' })
    )
    await writeFile(join(dir, '.eslintrc.json'), '{}')
    await writeFile(join(dir, '.prettierrc'), '{}')
    await writeFile(join(dir, 'yarn.lock'), '')
    await writeFile(join(dir, 'eslint.config.js'), '')
    await writeFile(join(dir, 'README.fr.md'), 'french')
    await mkdir(join(dir, '.github'))
    await writeFile(join(dir, '.github', 'ci.yml'), '')
    await mkdir(join(dir, 'src'))
    await writeFile(join(dir, 'src', 'index.js'), 'export default 1\n')

    let out = await run(dir)

    let entries = (await readdir(out)).sort()
    assert.deepEqual(entries, ['package.json', 'src'])
    let srcEntries = await readdir(join(out, 'src'))
    assert.deepEqual(srcEntries, ['index.js'])
  })

  test('strips default fields and scripts from package.json', async () => {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'pkg',
        version: '1.0.0',
        devDependencies: { jest: '^29.0.0' },
        jest: { testEnvironment: 'node' },
        prettier: { semi: false },
        scripts: {
          build: 'rollup',
          prepare: 'husky install',
          prepublish: 'npm run build',
          test: 'jest'
        }
      })
    )

    let out = await run(dir)

    let pkg = JSON.parse(await readFile(join(out, 'package.json'), 'utf8'))
    assert.deepEqual(pkg, {
      name: 'pkg',
      version: '1.0.0',
      scripts: {
        prepare: 'husky install',
        prepublish: 'npm run build'
      }
    })
  })

  test('removes additional fields from `fields` input', async () => {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'pkg',
        version: '1.0.0',
        keywords: ['x'],
        private: true
      })
    )

    let out = await run(dir, { fields: 'keywords, private' })

    let pkg = JSON.parse(await readFile(join(out, 'package.json'), 'utf8'))
    assert.deepEqual(pkg, {
      name: 'pkg',
      version: '1.0.0'
    })
  })

  test('merges publishConfig into the root', async () => {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'pkg',
        version: '1.0.0',
        main: 'src/index.js',
        publishConfig: { access: 'public', main: 'dist/index.js' }
      })
    )

    let out = await run(dir)

    let pkg = JSON.parse(await readFile(join(out, 'package.json'), 'utf8'))
    assert.deepEqual(pkg, {
      name: 'pkg',
      version: '1.0.0',
      main: 'dist/index.js',
      access: 'public'
    })
  })

  test('clean-docs keeps only the main README section', async () => {
    await writeFile(join(dir, 'package.json'), '{}')
    await writeFile(
      join(dir, 'README.md'),
      '# Title\n\nIntro line.\n\n## Options\n\nDetails.\n'
    )

    let out = await run(dir, { 'clean-docs': true })

    let md = await readFile(join(out, 'README.md'), 'utf8')
    assert.equal(md, '# Title\n\nIntro line.\n')
  })

  test('clean-docs adds a link to full docs from repository', async () => {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'pkg',
        version: '1.0.0',
        repository: 'user/repo'
      })
    )
    await writeFile(
      join(dir, 'README.md'),
      '# Title\n\nIntro line.\n\n## Options\n\nDetails.\n'
    )

    let out = await run(dir, { 'clean-docs': true })

    let md = await readFile(join(out, 'README.md'), 'utf8')
    assert.equal(
      md,
      '# Title\n\nIntro line.\n\n## Docs\n' +
        'Read full docs **[here](https://github.com/user/repo#readme)**.\n'
    )
  })

  test('clean-docs prefers homepage and parses git URLs', async () => {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'pkg',
        version: '1.0.0',
        homepage: 'https://example.com/docs',
        repository: { type: 'git', url: 'git+https://github.com/user/repo.git' }
      })
    )
    await writeFile(
      join(dir, 'README.md'),
      '# Title\n\nIntro line.\n\n## Options\n\nDetails.\n'
    )

    let out = await run(dir, { 'clean-docs': true })

    let md = await readFile(join(out, 'README.md'), 'utf8')
    assert.equal(
      md,
      '# Title\n\nIntro line.\n\n## Docs\n' +
        'Read full docs **[here](https://example.com/docs)**.\n'
    )
  })

  test('clean-comments strips JS comments', async () => {
    await writeFile(join(dir, 'package.json'), '{}')
    await writeFile(
      join(dir, 'index.js'),
      [
        '// header comment',
        'const url = "https://example.com" // trailing',
        '/* block comment */',
        'const path = `/api/v1/users`',
        'export { path, url }',
        ''
      ].join('\n')
    )

    let out = await run(dir, { 'clean-comments': true })

    let code = await readFile(join(out, 'index.js'), 'utf8')
    assert.equal(
      code,
      [
        'const url = "https://example.com"',
        'const path = `/api/v1/users`',
        'export { path, url }',
        ''
      ].join('\n')
    )
  })

  test('clean-comments keeps RegExp literals intact', async () => {
    await writeFile(join(dir, 'package.json'), '{}')
    await writeFile(
      join(dir, 'index.js'),
      [
        "const scope = name.replace(/^@[^/]+\\//, '') // strip scope",
        'const div = a / 2 / 1 // division, not a regex',
        'const cls = /[/?]+/g',
        'export { scope, div, cls }',
        ''
      ].join('\n')
    )

    let out = await run(dir, { 'clean-comments': true })

    let code = await readFile(join(out, 'index.js'), 'utf8')
    assert.equal(
      code,
      [
        "const scope = name.replace(/^@[^/]+\\//, '')",
        'const div = a / 2 / 1',
        'const cls = /[/?]+/g',
        'export { scope, div, cls }',
        ''
      ].join('\n')
    )
  })
})
