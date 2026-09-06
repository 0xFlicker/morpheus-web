import catalog from './catalog.json';

// Versioned authored-location groups. See docs/implementation/morpheus-discovery.md.
export const DISCOVERY_CATALOG_VERSION = 2;
export const DISCOVERY_MAP_DIGEST =
  '8504cc0dc7f18afe3f77c1b13c553a3bd040993158aef92fe4f848dfb54cc094';

export const DISCOVERY_SECTION_IDS = [
  'ship',
  'voodoo',
  'harem',
  'waterfront',
  'carnival',
  'ending',
] as const;

export type DiscoverySectionId = (typeof DISCOVERY_SECTION_IDS)[number];

export const DISCOVERY_SECTION_LABELS: Readonly<
  Record<DiscoverySectionId, string>
> = {
  ship: 'Ship',
  voodoo: 'Island dream',
  harem: 'Palace dream',
  waterfront: 'Waterfront dream',
  carnival: 'Carnival dream',
  ending: 'Ending',
};

export const DISCOVERY_UNITS = catalog.units;
