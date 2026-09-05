import Link from 'next/link';

import {
  morpheusStory,
  publicDestinations,
  publicSiteSources,
  studioStory,
} from '@/lib/publicSiteContent';
import styles from './home.module.css';

export default function Home() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">
        Skip to the story
      </a>
      <header id="top" className={styles.masthead}>
        <div className={styles.issueLine}>
          <span>Web edition · Issue 001</span>
          <span>Independent games &amp; impossible places</span>
          <span>World Wide Web · 2026</span>
        </div>
        <h1 className={styles.wordmark}>Soap Bubble Productions</h1>
        <nav className={styles.primaryNav} aria-label="Primary navigation">
          <a href="#morpheus">Morpheus</a>
          <a href="#studio">The studio</a>
          <a href="#ways-to-play">Ways to play</a>
          <Link href="/scenes">Scene index</Link>
        </nav>
      </header>

      <main id="main-content" className={styles.main}>
        <article id="morpheus" className={styles.lead}>
          <div className={styles.leadCopy}>
            <p className={styles.kicker}>The feature · 1998 / restored 2026</p>
            <h2>Dreaming in the ice.</h2>
            <p className={styles.dek}>{morpheusStory[0].text}</p>
            <div className={styles.heroActions}>
              <Link className={styles.button} href="/morpheus">
                Play Morpheus
              </Link>
              <Link className={styles.textLink} href="/scenes">
                Open scene index
              </Link>
            </div>
          </div>

          <figure className={styles.heroFigure}>
            <div className={styles.imageCrop}>
              <img
                className={styles.heroImage}
                src="/morpheus-assets/texture/title.png"
                alt="Morpheus title above an Arctic field of ice"
                width="800"
                height="499"
              />
            </div>
            <figcaption className={styles.caption}>
              <span>Soap Bubble Productions · 1998</span>
            </figcaption>
          </figure>
        </article>

        <section
          id="studio"
          className={styles.story}
          aria-labelledby="studio-title"
        >
          <div>
            <p className={styles.sectionNumber}>01 / The studio</p>
          </div>
          <h2 id="studio-title">A family made a world.</h2>
          <div className={styles.storyBody}>
            {studioStory.map((paragraph) => (
              <p key={paragraph.text}>{paragraph.text}</p>
            ))}
            <p>{morpheusStory[1].text}</p>
          </div>
        </section>

        <section
          id="ways-to-play"
          className={styles.ways}
          aria-labelledby="ways-title"
        >
          <div className={styles.waysHeader}>
            <div>
              <p className={styles.sectionNumber}>02 / Directory</p>
              <h2 id="ways-title" className={styles.indexHeading}>
                Ways to enter
              </h2>
            </div>
            <p className={styles.waysIntro}>
              Start at the title, jump straight into the map, or read the
              restoration log. Only destinations that exist are listed here.
            </p>
          </div>

          <ol className={styles.destinationList}>
            {publicDestinations.map((destination, index) => {
              const content = (
                <>
                  <span className={styles.destinationIndex}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <span className={styles.destinationEyebrow}>
                      {destination.eyebrow}
                    </span>
                    <span className={styles.destinationTitle}>
                      {destination.label}
                    </span>
                  </span>
                  <span className={styles.destinationDescription}>
                    {destination.description}
                  </span>
                  <span className={styles.destinationArrow} aria-hidden="true">
                    {destination.external ? '↗' : '→'}
                  </span>
                </>
              );

              return (
                <li key={destination.id}>
                  {destination.external ? (
                    <a
                      className={styles.destinationLink}
                      href={destination.href}
                    >
                      {content}
                    </a>
                  ) : (
                    <Link
                      className={styles.destinationLink}
                      href={destination.href}
                    >
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section className={styles.dispatchGrid} aria-label="Site dispatches">
          <article className={styles.sceneDispatch}>
            <p className={styles.sectionNumber}>03 / Scene explorer</p>
            <h2>Every door has a number.</h2>
            <p>
              The complete authored scene map is open for browsing. Start from
              any panorama, puzzle, or transition with a clean game state and
              follow the working connections from there.
            </p>
            <Link className={styles.textLink} href="/scenes">
              Browse all scenes
            </Link>
          </article>
          <aside className={styles.socialDispatch}>
            <p className={styles.sectionNumber}>Transmission desk</p>
            <h2>More channels, when they are ready.</h2>
            <p>
              This page will carry official social and TestFlight destinations
              when there is something real to visit. Until then, the signal
              stays quiet.
            </p>
          </aside>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerLine}>
          <span>Sources &amp; further reading</span>
          <span>Keep the strange machinery running</span>
        </div>
        <ol className={styles.sources}>
          {publicSiteSources.map((source, index) => (
            <li key={source.id}>
              <span className={styles.sourceNumber}>
                {String(index + 1).padStart(2, '0')} ·{' '}
              </span>
              <a href={source.href}>{source.label}</a>
            </li>
          ))}
        </ol>
        <div className={styles.footerLine}>
          <span>Soap Bubble Productions</span>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/support">Contact</a>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </div>
  );
}
