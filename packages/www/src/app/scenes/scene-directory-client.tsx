'use client';

import { useEffect, useId, useState } from 'react';

import type { SceneDirectoryFilter } from './sceneDirectoryFilters';
import { matchesSceneDirectoryFilters } from './sceneDirectoryFilters';
import styles from './scene-directory.module.css';

const filters: readonly Readonly<{
  value: SceneDirectoryFilter;
  label: string;
}>[] = [
  { value: 'all', label: 'All' },
  { value: 'panorama', label: 'Panoramas' },
  { value: 'special', label: 'Special scenes' },
  { value: 'transition', label: 'Transitions' },
  { value: 'puzzle', label: '2D puzzles' },
];

type SceneDirectoryClientProps = {
  totalScenes: number;
};

export function SceneDirectoryClient({
  totalScenes,
}: SceneDirectoryClientProps) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SceneDirectoryFilter>('all');
  const [visibleCount, setVisibleCount] = useState(totalScenes);

  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>('[data-scene-card]');
    let nextVisibleCount = 0;

    for (const card of cards) {
      const sceneId = Number(card.dataset.sceneId);
      const type = card.dataset.sceneType;
      const subtype = card.dataset.sceneSubtype;
      if (
        !Number.isSafeInteger(sceneId) ||
        (type !== 'panorama' && type !== 'special') ||
        (subtype !== undefined &&
          subtype !== 'transition' &&
          subtype !== 'puzzle')
      ) {
        throw new Error('Scene directory card has invalid filter data');
      }
      const matches = matchesSceneDirectoryFilters(
        { sceneId, type, ...(subtype === undefined ? {} : { subtype }) },
        query,
        filter,
      );
      card.hidden = !matches;
      if (matches) nextVisibleCount += 1;
    }

    setVisibleCount(nextVisibleCount);
  }, [filter, query]);

  return (
    <section className={styles.controls} aria-label="Filter the scene index">
      <div className={styles.searchField}>
        <label htmlFor={searchId}>Find a scene ID</label>
        <input
          id={searchId}
          type="search"
          inputMode="numeric"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="e.g. 1050"
          aria-controls="scene-directory-list"
        />
      </div>

      <fieldset className={styles.filterFieldset}>
        <legend>Scene type</legend>
        <div className={styles.filterOptions}>
          {filters.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="scene-type"
                value={option.value}
                checked={filter === option.value}
                onChange={() => setFilter(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className={styles.resultCount} aria-live="polite" aria-atomic="true">
        Showing {visibleCount.toLocaleString('en-US')} of{' '}
        {totalScenes.toLocaleString('en-US')} scenes
      </p>
    </section>
  );
}
