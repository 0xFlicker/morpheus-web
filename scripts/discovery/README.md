The canonical approved catalog is `packages/www/src/lib/discovery/catalog.json`.
Its authored memberships, exclusions, evidence, and map digest are retained from the reviewed 2D audit. Do not infer new aliases from shared rooms or assets.

After `nvm use`, run `node scripts/discovery/generate-swift.mjs` from the web repository to update the native Swift catalog in the sibling `morpheus` checkout. Run with `--check` to detect catalog drift without writing. Runtime parity is additionally checked by compiling the generated Swift implementation and comparing counts and resolution for every catalog unit.

Run `node scripts/discovery/check-swift-parity.mjs` to compile and execute the native calculator against every approved unit, alias, conditional observation, and section total. A configured Xcode Swift compiler is required.
