import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cloud/reports', () => ({
  listCloudReports: vi.fn(),
  listCloudSaveDiagnostics: vi.fn(),
  listCloudSessions: vi.fn(),
  parseAdminPagination: vi.fn(),
}));

import { AdminReportsTable, AdminSavesTable } from './CloudDashboard';
import { calculateDiscovery, evaluateAchievements } from '@/lib/discovery';

describe('admin cloud tables', () => {
  it('escapes report text and reveals only an admin attachment control', () => {
    const markup = renderToStaticMarkup(
      <AdminReportsTable
        reports={[
          {
            id: '22222222-2222-4222-8222-222222222222',
            playerId: '11111111-1111-4111-8111-111111111111',
            authenticated: false,
            platform: 'web',
            description: '<script>alert("report")</script>',
            sceneId: 1010,
            appVersion: '1',
            hasAttachment: true,
            status: 'new',
            createdAt: '2026-09-05T01:00:00Z',
          },
        ]}
      />,
    );
    expect(markup).toContain('&lt;script&gt;');
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('View attachments');
    expect(markup).not.toContain('blob.vercel-storage.com');
  });
  it('labels imported achievement matches unverified and shows server-calculated sections', () => {
    const markup = renderToStaticMarkup(
      <AdminSavesTable
        saves={[
          {
            playerId: '11111111-1111-4111-8111-111111111111',
            authenticated: true,
            slotId: 'slot-1',
            revision: 1,
            updatedAt: '2026-09-05T01:00:00Z',
            runId: '22222222-2222-4222-8222-222222222222',
            sceneId: 1010,
            source: 'imported',
            discovery: calculateDiscovery([1010]),
            achievements: evaluateAchievements([1010], 'imported'),
          },
        ]}
      />,
    );
    expect(markup).toContain('imported');
    expect(markup).toContain('Unverified');
    expect(markup).toContain('Sections');
    expect(markup).toContain('locations');
  });
});
