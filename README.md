# Clean npm Project

This action make npm packages smaller by cleaning `package.json` and popular development configs.

It will create `cleaned-project/` folder with cleaned project. Then you can run `npm publish` there.

```yml
# Publish new version with npm Staged Publishing on tag
on:
  push:
    tags:
      - '*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout the repository
        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
      - name: Clean npm package
        uses: ai/clean-npm-project@0360e11d62a76db910e3035fad44c6c07d5348c4 #v0.1.0
      - name: Install Node.js
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 26
      - name: Publish npm package
        run: npm stage publish
        working-directory: cleaned-project/
```

Don’t forget to configure [Trusted Publishing](https://docs.npmjs.com/trusted-publishers).

This action will clean:

1. [Dev configs](./ignore-fields.js) from `package.json`.
2. [Scripts](./ignore-scripts.js) from `package.json`.
3. [Popular dev configs](./ignore-scripts.js) from the folder.

## Options

### `clean-docs`

Keeps only main section of `README.md`.

Default `false`.

### `clean-comments`

Removes all inline comments from JS files.

Default `false`.

### `fields`

Keys to remove from `package.json` in additional to [default list](./ignore-fields.js).

## Thanks

Based on [`clean-publish`](https://github.com/shashkovdanil/clean-publish).
