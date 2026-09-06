import {
  DISCOVERY_CATALOG_VERSION,
  DISCOVERY_UNITS,
  DISCOVERY_SECTION_IDS,
  DISCOVERY_SECTION_LABELS,
  type DiscoverySectionId,
} from './catalog';

export {
  DISCOVERY_CATALOG_VERSION,
  DISCOVERY_MAP_DIGEST,
  DISCOVERY_SECTION_IDS,
  DISCOVERY_SECTION_LABELS,
  type DiscoverySectionId,
} from './catalog';

export type DiscoveryLocation = {
  readonly id: string;
  readonly sectionId: DiscoverySectionId;
  readonly sceneIds: readonly number[];
};

export type DiscoveryCount = {
  readonly discovered: number;
  readonly total: number;
  readonly percent: number;
};

export type DiscoveryProgress = {
  readonly catalogVersion: number;
  readonly overall: DiscoveryCount;
  readonly sections: readonly (DiscoveryCount & {
    readonly id: DiscoverySectionId;
    readonly label: string;
  })[];
  readonly discoveredLocationIds: readonly string[];
  /** The authored ending movie has led into narrative credits. */
  readonly completed: boolean;
};

const locations: readonly DiscoveryLocation[] = Object.freeze(
  DISCOVERY_UNITS.map((unit) =>
    Object.freeze({
      id: unit.id,
      sectionId: unit.section as DiscoverySectionId,
      sceneIds: Object.freeze([...unit.sceneIds]),
    }),
  ),
);
const locationIds = new Set(locations.map((location) => location.id));
export function isDiscoveryUnitId(id: string): boolean {
  return locationIds.has(id);
}

/** Called only after presentation; conditional content requires the visible cast. */
export function resolveDiscoveryObservation(
  sceneId: number,
  visibleAssetPaths: readonly string[] = [],
): readonly string[] {
  const ordinary = findDiscoveryLocation(sceneId);
  if (ordinary) {
    const unit = DISCOVERY_UNITS.find((unit) => unit.id === ordinary.id)!;
    return visibleAssetPaths.some((asset) => unit.assets.includes(asset))
      ? [ordinary.id]
      : [];
  }
  return DISCOVERY_UNITS.filter((unit) =>
    unit.conditionalObservations?.some(
      (observation) =>
        observation.sceneId === sceneId &&
        visibleAssetPaths.includes(observation.visibleAsset),
    ),
  ).map((unit) => unit.id);
}

const locationsByScene = new Map<number, DiscoveryLocation>();
for (const location of locations) {
  for (const sceneId of location.sceneIds) {
    if (!Number.isSafeInteger(sceneId) || sceneId <= 0) {
      throw new Error(`Invalid discovery scene ${sceneId}`);
    }
    if (locationsByScene.has(sceneId)) {
      throw new Error(`Discovery scene ${sceneId} belongs to two locations`);
    }
    locationsByScene.set(sceneId, location);
  }
}

export const DISCOVERY_ENDING_SCENE_IDS = [
  895051, 895052, 895053, 895054, 895055, 895056, 895057, 895058, 895065,
  895066,
] as const;
const endingScenes: ReadonlySet<number> = new Set(DISCOVERY_ENDING_SCENE_IDS);

export function listDiscoveryLocations(): readonly DiscoveryLocation[] {
  return locations;
}

export function findDiscoveryLocation(
  sceneId: number,
): DiscoveryLocation | undefined {
  return locationsByScene.get(sceneId);
}

/** Excluded transitions keep the last known section; authored 2D units have their own attribution. */
export function getDiscoverySection(
  sceneId: number,
): DiscoverySectionId | undefined {
  return (
    findDiscoveryLocation(sceneId)?.sectionId ??
    (DISCOVERY_UNITS.find((unit) =>
      unit.conditionalObservations?.some(
        (observation) => observation.sceneId === sceneId,
      ),
    )?.section as DiscoverySectionId | undefined)
  );
}

function count(discovered: number, total: number): DiscoveryCount {
  return {
    discovered,
    total,
    // Truncate to one decimal so unfinished discovery never displays 100%.
    percent: total === 0 ? 0 : Math.floor((discovered * 1_000) / total) / 10,
  };
}

/** Calculate on the server from recorded visits; never take client counts/totals. */
export function calculateDiscovery(
  visitedSceneIds: readonly number[],
  observedDiscoveryIds: readonly string[] = [],
): DiscoveryProgress {
  const discovered = new Set(observedDiscoveryIds.filter(isDiscoveryUnitId));
  for (const sceneId of visitedSceneIds) {
    const location = findDiscoveryLocation(sceneId);
    if (location) discovered.add(location.id);
  }
  return {
    catalogVersion: DISCOVERY_CATALOG_VERSION,
    overall: count(discovered.size, locations.length),
    sections: DISCOVERY_SECTION_IDS.map((id) => {
      const sectionLocations = locations.filter(
        (location) => location.sectionId === id,
      );
      return {
        id,
        label: DISCOVERY_SECTION_LABELS[id],
        ...count(
          sectionLocations.filter((location) => discovered.has(location.id))
            .length,
          sectionLocations.length,
        ),
      };
    }),
    discoveredLocationIds: locations
      .filter((location) => discovered.has(location.id))
      .map((location) => location.id),
    completed: visitedSceneIds.some((id) => endingScenes.has(id)),
  };
}

/** Source is a diagnostic claim, not evidence that a playthrough is legal. */
export type DiscoveryEvidenceSource = 'played' | 'imported';

export type ObservedAchievement = {
  readonly id: string;
  readonly title: string;
  readonly catalogVersion: number;
  readonly source: DiscoveryEvidenceSource;
  readonly verified: false;
  readonly visibility: 'admin';
};

/** Matches are useful for admin testing; no snapshot can award a verified badge. */
export function evaluateAchievements(
  visitedSceneIds: readonly number[],
  source: DiscoveryEvidenceSource = 'played',
  observedDiscoveryIds: readonly string[] = [],
): readonly ObservedAchievement[] {
  const progress = calculateDiscovery(visitedSceneIds, observedDiscoveryIds);
  const matches: { id: string; title: string }[] = [];
  if (progress.overall.discovered > 0) {
    matches.push({ id: 'first-location', title: 'First discovery' });
  }
  const dreams = progress.sections.filter(
    (section) => section.id !== 'ship' && section.id !== 'ending',
  );
  for (const section of dreams) {
    if (section.discovered > 0) {
      matches.push({
        id: `enter-${section.id}`,
        title: `Enter the ${section.label.toLowerCase()}`,
      });
    }
  }
  if (dreams.every((section) => section.discovered > 0)) {
    matches.push({ id: 'all-dreams', title: 'Visit every dream world' });
  }
  for (const section of progress.sections) {
    if (section.discovered === section.total) {
      matches.push({
        id: `discover-${section.id}`,
        title: `Discover every location: ${section.label}`,
      });
    }
  }
  if (progress.completed) {
    matches.push({ id: 'reach-ending', title: 'Reach the ending' });
  }
  if (progress.overall.discovered === progress.overall.total) {
    matches.push({ id: 'all-locations', title: 'Discover every location' });
  }
  return matches.map((match) => ({
    ...match,
    catalogVersion: DISCOVERY_CATALOG_VERSION,
    source,
    verified: false,
    visibility: 'admin',
  }));
}

export const MINIMUM_DISCOVERY_COMPARISON_PLAYERS = 1;
