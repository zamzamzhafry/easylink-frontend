import { hasPrivilegeMismatch } from './auth-hardening-helpers.js';

function buildCollisionLogMeta(loginId, selectedSubjectType, alternateSubjectType) {
  return {
    code: 'AUTH_IDENTITY_COLLISION',
    login_id: loginId,
    selected_subject_type: selectedSubjectType,
    alternate_subject_type: alternateSubjectType,
  };
}

export async function resolveAuthenticatedLane({
  loginId,
  accountContext,
  nipContext,
  selectedSubjectType,
}) {
  if (selectedSubjectType === 'account') {
    if (accountContext && nipContext && hasPrivilegeMismatch(accountContext, nipContext)) {
      console.warn('AUTH_IDENTITY_COLLISION', buildCollisionLogMeta(loginId, 'account', 'employee_nip'));
      return { ok: false, status: 409, error: 'Auth identity conflict.' };
    }

    return { ok: true, authContext: accountContext, subjectType: 'account' };
  }

  if (selectedSubjectType === 'employee_nip') {
    if (accountContext && nipContext && hasPrivilegeMismatch(accountContext, nipContext)) {
      console.warn('AUTH_IDENTITY_COLLISION', buildCollisionLogMeta(loginId, 'employee_nip', 'account'));
      return { ok: false, status: 409, error: 'Auth identity conflict.' };
    }

    return { ok: true, authContext: nipContext, subjectType: 'employee_nip' };
  }

  return { ok: false, status: 500, error: 'Failed to resolve authenticated lane' };
}
