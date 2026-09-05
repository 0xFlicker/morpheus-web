import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <>
      <h1>Your journey, kept private.</h1>
      <p>
        Updated September 5, 2026. False Floor, LLC operates the Morpheus apps
        and online services at soapbubble.xyz.
      </p>
      <p>
        We use your information to save and resume your game, connect your
        devices when you sign in, show discovery progress, protect the service,
        and investigate reports you send. We do not sell your data or use
        advertising identifiers, cross-site advertising, or device
        fingerprinting.
      </p>
      <h2>What Morpheus keeps</h2>
      <p>
        Your device keeps save slots, preferences, discovered locations, and
        pending saves. After you choose to play with online services, Morpheus
        also stores your game state, a random player and device identifier, and
        basic session details such as platform, app version, current scene, and
        service activity times. You can play without an account.
      </p>
      <p>
        Signing in associates your progress with your account so other signed-in
        devices can resume it. Clerk handles authentication, including
        information provided by your sign-in method. We use your verified
        account identifier to own saves; we do not require your real name or
        public profile.
      </p>
      <p>
        A report is sent only when you select Send. It includes your text, the
        optional technical details described in the report form, and any
        screenshot you include. Reports stay private to the developer. Avoid
        including unrelated personal information; a reply email is optional.
      </p>
      <h2>Discovery and service diagnostics</h2>
      <p>
        Discovery is calculated from locations recorded in your saves. At the
        ending, Morpheus may compare your discovery with an aggregate of other
        players’ currently saved completed games. It does not reveal anyone
        else’s identity or save, and is shown only when at least 20 other
        players are represented. Recorded progress is not a certification that a
        game was played without modifications.
      </p>
      <p>
        We use operational session records to make saves and support work. We do
        not keep a separate click-by-click browsing history or use these records
        for advertising.
      </p>
      <h2>Your choices</h2>
      <p>
        The game menu’s Privacy control lets you stop online services while
        continuing to play locally. Saves and reconnects do not ask you to make
        repeated privacy choices. Signing out changes the account used on the
        device; it does not delete an account or erase previously stored online
        information.
      </p>
      <p>
        Privacy also lets you delete online saves, sessions, and reports while
        keeping this device’s journeys. That stops online services on this
        device. Another connected device may upload its local progress again.
        Deleting your sign-in account through account settings also removes its
        Morpheus online records. Private attachments become inaccessible
        immediately and are removed by daily cleanup once they are at least 24
        hours old.
      </p>
      <p>
        You can request access, correction, export, or deletion using our{' '}
        <Link href="/support">contact form</Link>. Include a reply address if
        you want a response. Depending on where you live, you may also object to
        processing, restrict it, withdraw consent without affecting earlier
        lawful processing, or complain to your data-protection authority. We may
        need enough information to confirm which records are yours.
      </p>
      <h2>Storage and retention</h2>
      <p>
        Neon stores game and session records; private Vercel Blob storage holds
        report attachments. These Morpheus stores are located in the United
        States. Vercel delivers the website and API, and Clerk provides account
        services. Their infrastructure may process information in other
        countries, subject to their contractual safeguards.
      </p>
      <p>
        Signed-in saves remain until deletion is requested. Inactive anonymous
        player data is eligible for deletion after 90 days, session diagnostics
        after 30 days, and reports after 90 days. A daily cleanup removes
        expired records and abandoned report uploads. Provider backups and
        security logs may remain for their separate limited retention periods.
      </p>
      <p>
        The app does not store raw IP addresses in its player database. For
        abuse prevention, it uses expiring request counters and daily keyed
        hashes of network addresses. Hosting and authentication providers also
        process connection information to operate and secure their services.
      </p>
      <p>
        A hash of a deleted account identifier remains for up to 30 days to
        prevent a retrying session from recreating deleted data. It contains no
        profile or game progress.
      </p>
      <h2>Why we process it</h2>
      <p>
        We process the information needed to provide the game services you
        request, and limited security and reliability information for our
        legitimate interest in operating them safely. Where processing relies on
        your permission, you can withdraw it through Privacy or contact us. We
        do not treat optional advertising or unrelated analytics as necessary
        gameplay processing.
      </p>
      <p>
        Material changes will be described where you use the affected feature.
        For privacy or support requests,{' '}
        <Link href="/support">contact False Floor, LLC</Link>.
      </p>
    </>
  );
}
