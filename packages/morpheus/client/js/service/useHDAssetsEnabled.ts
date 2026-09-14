import { useSyncExternalStore } from 'react'
import { getHDAssetsEnabled } from './gamedb'

const subscribe = () => () => undefined
const serverSnapshot = () => false

// Match server markup during hydration, then select the browser preference.
// Media reads the preference on render; the setting applies to new scene loads.
export function useHDAssetsEnabled() {
  return useSyncExternalStore(subscribe, getHDAssetsEnabled, serverSnapshot)
}
