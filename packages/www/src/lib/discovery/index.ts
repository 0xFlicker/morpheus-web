import {
  DISCOVERY_CATALOG_VERSION,
  DISCOVERY_LOCATION_SCENES,
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
  DISCOVERY_SECTION_IDS.flatMap((sectionId) =>
    DISCOVERY_LOCATION_SCENES[sectionId].map((sceneIds) => {
      if (sceneIds.length === 0) {
        throw new Error(`Empty discovery location in ${sectionId}`);
      }
      return Object.freeze({
        id: `location-${sceneIds[0]}`,
        sectionId,
        sceneIds: Object.freeze([...sceneIds]),
      });
    }),
  ),
);

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

const endingLocationId = 'location-895051';

export function listDiscoveryLocations(): readonly DiscoveryLocation[] {
  return locations;
}

export function findDiscoveryLocation(
  sceneId: number,
): DiscoveryLocation | undefined {
  return locationsByScene.get(sceneId);
}

/** Transitions/closeups have no location; the UI may keep the last known section. */
export function getDiscoverySection(
  sceneId: number,
): DiscoverySectionId | undefined {
  return findDiscoveryLocation(sceneId)?.sectionId;
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
): DiscoveryProgress {
  const discovered = new Set<string>();
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
    completed: discovered.has(endingLocationId),
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
): readonly ObservedAchievement[] {
  const progress = calculateDiscovery(visitedSceneIds);
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

export const MINIMUM_DISCOVERY_COMPARISON_PLAYERS = 20;

export type RecordedDiscoveryPlaythrough = {
  /** Server-owned player identity; never included in the returned aggregate. */
  readonly playerId: string;
  readonly catalogVersion: number;
  readonly discoveredSceneIds: readonly number[];
  readonly source: DiscoveryEvidenceSource;
};

export type DiscoveryComparison =
  | {
      readonly status: 'unavailable';
      readonly reason:
        | 'not-completed'
        | 'imported'
        | 'different-catalog'
        | 'small-cohort';
    }
  | {
      readonly status: 'available';
      readonly cohortLabel: 'Other players’ best recorded completed playthroughs';
      readonly otherPlayerCount: number;
      readonly playerPercent: number;
      readonly averagePercent: number;
      readonly verified: false;
    };

/**
 * Descriptive comparison, not a leaderboard or legal-playthrough certification.
 * Supply server-owned records. The client-supplied "played" label is unverified.
 */
export function compareDiscoveryAtEnding(
  player: RecordedDiscoveryPlaythrough,
  cohort: readonly RecordedDiscoveryPlaythrough[],
): DiscoveryComparison {
  if (player.catalogVersion !== DISCOVERY_CATALOG_VERSION) {
    return { status: 'unavailable', reason: 'different-catalog' };
  }
  if (player.source === 'imported') {
    return { status: 'unavailable', reason: 'imported' };
  }
  const progress = calculateDiscovery(player.discoveredSceneIds);
  if (!progress.completed) {
    return { status: 'unavailable', reason: 'not-completed' };
  }
  const bestPerPlayer = new Map<string, number>();
  for (const other of cohort) {
    if (
      other.playerId === player.playerId ||
      other.source === 'imported' ||
      other.catalogVersion !== DISCOVERY_CATALOG_VERSION
    ) {
      continue;
    }
    const otherProgress = calculateDiscovery(other.discoveredSceneIds);
    if (!otherProgress.completed) continue;
    const previous = bestPerPlayer.get(other.playerId) ?? 0;
    bestPerPlayer.set(
      other.playerId,
      Math.max(previous, otherProgress.overall.discovered),
    );
  }
  if (bestPerPlayer.size < MINIMUM_DISCOVERY_COMPARISON_PLAYERS) {
    return { status: 'unavailable', reason: 'small-cohort' };
  }
  const totalDiscovered = [...bestPerPlayer.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  return {
    status: 'available',
    cohortLabel: 'Other players’ best recorded completed playthroughs',
    otherPlayerCount: bestPerPlayer.size,
    playerPercent: progress.overall.percent,
    averagePercent:
      Math.floor(
        (totalDiscovered * 1_000) / (bestPerPlayer.size * locations.length),
      ) / 10,
    verified: false,
  };
}
