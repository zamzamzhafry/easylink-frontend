import { NextResponse } from 'next/server';

import { handleHopBIngestPost } from '@/lib/hop-b-ingest-handler';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const response = await handleHopBIngestPost(request);
  const body = await response.json();

  return NextResponse.json(body, {
    status: response.status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
