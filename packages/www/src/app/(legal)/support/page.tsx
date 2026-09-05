import type { Metadata } from 'next';
import { CloudReportForm } from '@/morpheus-app/cloud/CloudReportForm';

export const metadata: Metadata = { title: 'Contact and support' };

export default function SupportPage() {
  return (
    <>
      <h1>Contact False Floor, LLC</h1>
      <p>
        Send a Morpheus bug report, support question, or privacy request. You do
        not need to sign in. Include a reply email if you would like a response.
      </p>
      <CloudReportForm />
    </>
  );
}
