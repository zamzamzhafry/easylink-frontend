import { buildHopBStatusResponse } from '@/lib/hop-b-status.js';

export const dynamic = 'force-dynamic';

function jsonResponse(body, status) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET() {
  try {
    const payload = await buildHopBStatusResponse();
    return jsonResponse(payload, 200);
  } catch (error) {
    return jsonResponse(
      {
        status: 'error',
        code: 'STATUS_QUERY_FAILED',
        message: 'Failed to read HOP B ingest status',
      },
      500,
    );
  }
}
