import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCatalogCurrent,
  generateSceneCatalogFromSource,
  serializeSceneCatalog,
} from './scene-catalog.mjs';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAP_PATH = path.resolve(
  packageDirectory,
  '../../morpheus/client/js/service/morpheus.map.json',
);
const DEFAULT_CATALOG_PATH = path.resolve(
  packageDirectory,
  '../src/generated/sceneCatalog.json',
);

export function parseCatalogArguments(argv = process.argv.slice(2)) {
  const options = {
    mode: null,
    mapPath: DEFAULT_MAP_PATH,
    catalogPath: DEFAULT_CATALOG_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') {
      if (options.mode !== null) {
        throw new Error('Choose exactly one catalog mode: --write or --check');
      }
      options.mode = 'write';
    } else if (argument === '--check') {
      if (options.mode !== null) {
        throw new Error('Choose exactly one catalog mode: --write or --check');
      }
      options.mode = 'check';
    } else if (argument === '--map' && argv[index + 1]) {
      options.mapPath = path.resolve(argv[++index]);
    } else if (argument === '--catalog' && argv[index + 1]) {
      options.catalogPath = path.resolve(argv[++index]);
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown catalog argument: ${argument}`);
    }
  }
  return options;
}

export async function runCatalogCommand({
  mode,
  mapPath = DEFAULT_MAP_PATH,
  catalogPath = DEFAULT_CATALOG_PATH,
  log = console.log,
}) {
  if (mode !== 'write' && mode !== 'check') {
    throw new Error('Choose exactly one catalog mode: --write or --check');
  }

  const mapSource = await readFile(mapPath, 'utf8');
  const catalog = generateSceneCatalogFromSource(mapSource);

  if (mode === 'write') {
    await mkdir(path.dirname(catalogPath), { recursive: true });
    await writeFile(catalogPath, serializeSceneCatalog(catalog), 'utf8');
    log(`Wrote ${catalog.sceneCount} scenes to ${catalogPath}`);
    return catalog;
  }

  const catalogText = await readFile(catalogPath, 'utf8');
  assertCatalogCurrent({ catalogText, mapSource });
  log(`Scene catalog is current (${catalog.sceneCount} scenes)`);
  return catalog;
}

async function main() {
  const options = parseCatalogArguments();
  if (options.help) {
    process.stdout
      .write(`Usage: node scripts/generate-scene-catalog.mjs [options]

Options:
  --write           Generate and write the committed catalog
  --check           Fail unless the committed catalog is byte-current
  --map <path>      Path to morpheus.map.json
  --catalog <path>  Path to sceneCatalog.json
`);
    return;
  }
  await runCatalogCommand(options);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
