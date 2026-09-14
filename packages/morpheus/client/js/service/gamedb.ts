import { endsWith } from 'lodash'
import { hdAssetPaths } from './hd-assets'
import { hdSpatialPaths } from './hd-spatial-assets'

export const HD_ASSETS_PREFERENCE_KEY = 'Morpheus.hdAssetsEnabled'

export function getHDAssetsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(HD_ASSETS_PREFERENCE_KEY) === 'true'
  } catch (error) {
    console.warn('HD asset preference could not be read.', error)
    return false
  }
}

export function setHDAssetsEnabled(enabled: boolean) {
  window.localStorage.setItem(HD_ASSETS_PREFERENCE_KEY, String(enabled))
}

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

export function getAssetUrl(assetPath: string, type?: VideoMediaStrings, hdEnabled = getHDAssetsEnabled()) {
  const path = normalizeGameDbAssetPath(assetPath)
  const relativePath = `${path}${
    type && !endsWith(assetPath, type) ? `.${type}` : ''
  }`
  if (hdEnabled && hdSpatialPaths[relativePath]) {
    return `${baseUrl}/HD/spatial-x2-v1/${hdSpatialPaths[relativePath]}`.replaceAll('#', '%23')
  }
  const prefix = hdEnabled && hdAssetPaths.has(relativePath)
    ? 'HD/rife-x2-v1/' : ''
  return `${baseUrl}/${prefix}${relativePath}`.replaceAll('#', '%23')
}

export function getPanoAnimUrl(assetPath: string) {
  return getAssetUrl(assetPath)
}
