/**
 * Normalized repository errors for CloudRepository (P4B).
 * UI must not receive raw Supabase objects.
 */
(function (SAT) {
  SAT.RepositoryErrorCodes = {
    TRANSPORT: 'TRANSPORT',
    RLS_OR_PERMISSION: 'RLS_OR_PERMISSION',
    NOT_FOUND: 'NOT_FOUND',
    MUTATION_EMPTY: 'MUTATION_EMPTY',
    VALIDATION: 'VALIDATION',
    STALE: 'STALE',
    WRITE_FORBIDDEN: 'WRITE_FORBIDDEN',
    UNKNOWN: 'UNKNOWN',
  };

  function codeFromSupabase(error) {
    const raw = String(error?.code || '');
    const message = String(error?.message || '');
    const status = error?.status;
    if (raw === 'NOT_FOUND' || raw === 'PGRST116') return SAT.RepositoryErrorCodes.NOT_FOUND;
    if (raw === 'MUTATION_EMPTY') return SAT.RepositoryErrorCodes.MUTATION_EMPTY;
    if (raw === 'VALIDATION') return SAT.RepositoryErrorCodes.VALIDATION;
    if (raw === 'STALE') return SAT.RepositoryErrorCodes.STALE;
    if (raw === 'WRITE_FORBIDDEN') return SAT.RepositoryErrorCodes.WRITE_FORBIDDEN;
    if (
      status === 401
      || status === 403
      || raw === '42501'
      || raw === 'PGRST301'
      || /permission|rls|policy|not allowed/i.test(message)
    ) {
      return SAT.RepositoryErrorCodes.RLS_OR_PERMISSION;
    }
    if (status >= 500 || /fetch|network|failed to fetch/i.test(message)) {
      return SAT.RepositoryErrorCodes.TRANSPORT;
    }
    return SAT.RepositoryErrorCodes.UNKNOWN;
  }

  SAT.createRepositoryError = function createRepositoryError(source, context) {
    const err = source instanceof Error ? source : null;
    const payload = source && typeof source === 'object' ? source : { message: String(source) };
    const message = String(payload.message || err?.message || 'Repository request failed');
    const code = payload.code && SAT.RepositoryErrorCodes[payload.code]
      ? payload.code
      : codeFromSupabase(payload);
    const error = new Error(message);
    error.name = 'RepositoryError';
    error.code = code;
    error.context = context || null;
    error.details = payload.details || null;
    error.hint = payload.hint || null;
    return error;
  };

  SAT.isRepositoryError = function isRepositoryError(value) {
    return Boolean(value && value.name === 'RepositoryError');
  };
})(window.SAT = window.SAT || {});
