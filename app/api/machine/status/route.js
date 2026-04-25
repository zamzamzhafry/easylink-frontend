import { NextResponse } from 'next/server';
import { getAuthContextFromCookies, unauthorizedResponse } from '@/lib/auth-session';
import { getDeviceInfoFromSdk, getDeviceTimeFromSdk } from '@/lib/easylink-sdk-client';

export const dynamic = 'force-dynamic';

function buildCheckStatus(ok) {
  return ok ? 'ok' : 'failed';
}

function buildOverallStatus(checks) {
  const okCount = checks.filter((check) => check.status === 'ok').length;
  if (okCount === checks.length) return 'online';
  if (okCount > 0) return 'degraded';
  return 'offline';
}

function isSdkConfigured() {
  const hasSn = Boolean(String(process.env.EASYLINK_DEVICE_SN || '').trim());
  const hasWsdk =
    Boolean(String(process.env.EASYLINK_WSDK_BASE_URL || '').trim()) ||
    Boolean(String(process.env.EASYLINK_WSDK_IP || '').trim()) ||
    Boolean(String(process.env.EASYLINK_LAN_HOST || '').trim()) ||
    Boolean(String(process.env.EASYLINK_API_HOST || '').trim());
  return hasSn && hasWsdk;
}

export async function GET() {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();

  const source = 'windows-sdk';
  const checkedAt = new Date().toISOString();

  // If SDK env vars are not configured, return offline immediately — no connection attempt.
  if (!isSdkConfigured()) {
    return NextResponse.json({
      ok: true,
      status: 'offline',
      source,
      checked_at: checkedAt,
      not_configured: true,
      checks: [
        { key: 'device_info', label: 'Device info', status: 'failed' },
        { key: 'device_time', label: 'Device time', status: 'failed' },
      ],
    });
  }

  const [deviceInfoResult, deviceTimeResult] = await Promise.allSettled([
    getDeviceInfoFromSdk({ source }),
    getDeviceTimeFromSdk({ source }),
  ]);

  const deviceInfoOk =
    deviceInfoResult.status === 'fulfilled' &&
    Boolean(deviceInfoResult.value && deviceInfoResult.value.info != null);
  const deviceTimeOk =
    deviceTimeResult.status === 'fulfilled' &&
    Boolean(deviceTimeResult.value && deviceTimeResult.value.time != null);
  const checks = [
    {
      key: 'device_info',
      label: 'Device info',
      status: buildCheckStatus(deviceInfoOk),
    },
    {
      key: 'device_time',
      label: 'Device time',
      status: buildCheckStatus(deviceTimeOk),
    },
  ];

  return NextResponse.json({
    ok: true,
    status: buildOverallStatus(checks),
    source,
    checked_at: checkedAt,
    checks,
  });
}
