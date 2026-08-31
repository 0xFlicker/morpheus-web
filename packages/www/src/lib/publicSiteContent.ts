export type PublicSiteSourceId =
  | 'itch-introduction'
  | 'itch-morpheus'
  | 'adventure-classic-review';

export type PublicSiteSource = Readonly<{
  id: PublicSiteSourceId;
  label: string;
  href: string;
}>;

export type SourcedParagraph = Readonly<{
  text: string;
  sourceIds: readonly PublicSiteSourceId[];
}>;

export type PublicDestination = Readonly<{
  id: 'web-game' | 'macos-download' | 'scene-explorer' | 'itch';
  label: string;
  eyebrow: string;
  description: string;
  href: string;
  external: boolean;
}>;

export const publicSiteSources: readonly PublicSiteSource[] = Object.freeze([
  {
    id: 'itch-introduction',
    label: 'Introduction — Morpheus devlog',
    href: 'https://soapbubble.itch.io/morpheus/devlog/12728/introduction',
  },
  {
    id: 'itch-morpheus',
    label: 'Morpheus on itch.io',
    href: 'https://soapbubble.itch.io/morpheus',
  },
  {
    id: 'adventure-classic-review',
    label: 'Morpheus review — Adventure Classic Gaming',
    href: 'https://www.adventureclassicgaming.com/index.php/site/reviews/450/',
  },
]);

export const studioStory: readonly SourcedParagraph[] = Object.freeze([
  {
    text: 'Morpheus began with a family playthrough of Myst at Christmas in 1993. Over the next five years, extended family and friends became Soap Bubble Productions: modeling environments, editing footage, and keeping expensive workstations rendering around the clock.',
    sourceIds: ['itch-introduction'],
  },
  {
    text: 'The finished game arrived in 1998 after a difficult search for a publisher. Its original studio closed soon afterward, and much of the production archive went onto 1 GB Jaz disks.',
    sourceIds: ['itch-introduction', 'itch-morpheus'],
  },
]);

export const morpheusStory: readonly SourcedParagraph[] = Object.freeze([
  {
    text: 'Morpheus is a first-person, point-and-click mystery set around the Herculania, an ill-fated luxury liner trapped in Arctic ice. Its passengers, expedition, and strange machine are waiting to be understood.',
    sourceIds: ['adventure-classic-review'],
  },
  {
    text: 'The restored edition keeps the original pre-rendered images and movies, orchestrated by a modern browser engine descended from the game map and C++ runtime built for the 1998 release.',
    sourceIds: ['itch-introduction', 'itch-morpheus'],
  },
]);

export const publicDestinations: readonly PublicDestination[] = Object.freeze([
  {
    id: 'web-game',
    label: 'Play on the web',
    eyebrow: 'Complete edition',
    description:
      'Enter through the original title sequence and keep a living save in this browser.',
    href: '/morpheus',
    external: false,
  },
  {
    id: 'macos-download',
    label: 'Download for macOS',
    eyebrow: 'Native · Version 1.0 (5)',
    description:
      'Get the universal Apple silicon and Intel build for macOS 14 or later.',
    href: 'https://ol0swvwh4hjeaxzf.public.blob.vercel-storage.com/downloads/Morpheus-1.0-5-macOS.zip?download=1',
    external: true,
  },
  {
    id: 'scene-explorer',
    label: 'Explore every scene',
    eyebrow: 'Open index',
    description:
      'Browse the authored scene map and begin anywhere with a clean game state.',
    href: '/scenes',
    external: false,
  },
  {
    id: 'itch',
    label: 'Visit itch.io',
    eyebrow: 'Project archive',
    description:
      'Find the long-running development log and the established Morpheus release page.',
    href: 'https://soapbubble.itch.io/morpheus',
    external: true,
  },
]);

export const publicSocialLinks = Object.freeze([]);
