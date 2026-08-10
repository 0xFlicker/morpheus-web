import { endsWith } from 'lodash'

let baseUrl = ''

const normalizeBase = (value: string) => value.trim().replace(/\/+$/, '')

const CANONICAL_GAME_DB_DIRECTORIES: Readonly<Record<string, string>> = {
  all: 'All',
  cargoh: 'CargoH',
  carnival: 'carnival',
  deck1: 'Deck1',
  deck2: 'Deck2',
  deck2bth: 'Deck2Bth',
  deck3aft: 'Deck3Aft',
  deck3for: 'Deck3For',
  deck4: 'Deck4',
  deck5: 'Deck5',
  elevator: 'Elevator',
  h2ofront: 'h2oFront',
  harem: 'Harem',
  icenchat: 'iceNchat',
  neuro: 'neuro',
  oasounds: 'OAsounds',
  sanitory: 'sanitory',
  voodoo: 'Voodoo',
}

export function normalizeGameDbAssetPath(assetPath: string): string {
  return assetPath.replace(
    /^GameDB\/([^/]+)/,
    (prefix, directory: string) =>
      `GameDB/${CANONICAL_GAME_DB_DIRECTORIES[directory.toLowerCase()] ?? directory}`
  )
}

enum VideoMedia {
  mp4,
  webm,
  png,
  mp3,
  ogg,
  aac,
}
type VideoMediaStrings = keyof typeof VideoMedia

export function setBaseUrl(url: string) {
  baseUrl = normalizeBase(url)
}

export function getAssetUrl(assetPath: string, type?: VideoMediaStrings) {
  const path = normalizeGameDbAssetPath(assetPath)
  return `${baseUrl}/${path}${
    type && !endsWith(assetPath, type) ? `.${type}` : ''
  }`.replaceAll('#', '%23')
}

export function getPanoAnimUrl(assetPath: string) {
  return getAssetUrl(assetPath)
}
