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
    steps:
      - name: Checkout the repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - name: Clean npm package
        uses: ai/clean-npm-project@1680ee151d1b693e807c8e9bd95d26c2d57018ac #v1.0.0
        with:
          clean-docs: true
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
