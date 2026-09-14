import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms and app license' };

export default function TermsPage() {
  return (
    <>
      <h1>Terms and app license</h1>
      <p>
        Updated September 5, 2026. These terms cover the Morpheus application
        and online services operated by False Floor, LLC.
      </p>
      <h2>Playing Morpheus</h2>
      <p>
        You may use the application and services for personal play on devices
        you own or control. This permission does not transfer ownership of the
        game, artwork, music, trademarks, or other material. Separately licensed
        software and materials remain subject to their own licenses and notices.
      </p>
      <p>
        You can play locally without signing in. Online services store progress
        and help connected devices resume it. You are responsible for your
        account access and for choosing which progress to retain when devices
        have made conflicting changes. Save export remains a useful way to keep
        your own copy.
      </p>
      <h2>Fair use of the service</h2>
      <p>
        Do not access another player’s information, interfere with the service,
        upload malicious content, or submit material you do not have permission
        to share. Modified or imported saves may not qualify for comparisons or
        achievements. Technical validation does not guarantee that a save
        represents an unmodified playthrough.
      </p>
      <p>
        Send bug reports and support requests with only the information needed
        to investigate them. You permit us to store and use the material you
        submit for that purpose. Our <Link href="/privacy">Privacy Policy</Link>{' '}
        explains account, save, diagnostic, and report processing.
      </p>
      <h2>Availability and your rights</h2>
      <p>
        We work to keep the game and saves reliable, but online services can be
        interrupted or changed. To the extent permitted by applicable law, the
        application and services are provided as available without additional
        warranties. Nothing here excludes consumer guarantees or other rights
        that cannot lawfully be excluded.
      </p>
      <p>
        We may restrict access where necessary to address abuse or protect
        players. You can stop using the service and request deletion of your
        online data. Material changes to these terms will be made available in
        the application or website.
      </p>
      <h2>Apple distribution</h2>
      <p>
        If you obtained Morpheus from Apple, the applicable Apple usage rules
        and any license presented with that download also apply. Apple is not
        the operator of Morpheus’s cloud-save or support service.
      </p>
      <p>
        For questions about these terms, privacy, or support,{' '}
        <Link href="/support">contact False Floor, LLC</Link>.
      </p>
    </>
  );
}
