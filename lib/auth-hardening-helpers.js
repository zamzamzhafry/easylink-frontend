export function normalizeSubjectType(raw) {
  return raw === 'account' || raw === 'employee_nip' || raw === 'legacy_pin' ? raw : undefined;
}

export function encodeSessionToken(payload, sign, base64UrlEncode) {
  const encodedPayload = {
    sub: payload.subject,
    st: payload.subject_type ?? null,
    exp: payload.exp,
    v: 2,
  };
  const raw = base64UrlEncode(JSON.stringify(encodedPayload));
  return `${raw}.${sign(raw)}`;
}

export function decodeSessionToken(token, sign, base64UrlDecode, legacySessionPayloadCompatEnabled) {
  if (!token) return null;
  const [raw, signature] = token.split('.');
  if (!raw || !signature) return null;
  if (sign(raw) !== signature) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(raw));
    const exp = Number(decoded?.exp ?? 0);

    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    const canonicalSubject = String(decoded?.sub ?? '').trim();
    if (canonicalSubject) {
      return {
        subject: canonicalSubject,
        exp,
        payload_format: 'canonical',
        subject_type: normalizeSubjectType(decoded?.st),
      };
    }

    const legacyPin = String(decoded?.pin ?? '').trim();
    if (!legacyPin || !legacySessionPayloadCompatEnabled) {
      return null;
    }

    return {
      subject: legacyPin,
      exp,
      payload_format: 'legacy',
      subject_type: 'legacy_pin',
    };
  } catch {
    return null;
  }
}

export function hasPrivilegeMismatch(accountContext, nipContext) {
  return (
    accountContext.is_admin !== nipContext.is_admin ||
    Boolean(accountContext.is_hr) !== Boolean(nipContext.is_hr) ||
    accountContext.is_leader !== nipContext.is_leader ||
    accountContext.can_schedule !== nipContext.can_schedule ||
    accountContext.can_dashboard !== nipContext.can_dashboard
  );
}

export function maskIdentifier(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '<empty>';

  const safePrefix = normalized.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3);
  return `${safePrefix || '***'}***`;
}

export function buildNormalizedAuthUser(auth) {
  return {
    pin: auth.pin,
    nama: auth.nama,
    privilege: auth.privilege,
    is_admin: auth.is_admin,
    is_hr: Boolean(auth.is_hr),
    is_leader: auth.is_leader,
    can_schedule: auth.can_schedule,
    can_dashboard: auth.can_dashboard,
    groups: auth.groups,
    canonical_roles: auth.canonical_roles,
    subject_type: auth.subject_type || null,
    account_id: auth.account_id || null,
    login_id: auth.login_id || null,
    role_key: auth.role_key || null,
    nip: auth.nip || null,
    karyawan_id: auth.karyawan_id || null,
  };
}
