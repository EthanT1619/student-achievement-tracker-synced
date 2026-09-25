/**
 * P8 UX / session contract.
 * Historical Result class stays on ExamInstance. Current class is open Enrollment.
 * No Realtime. No historical class rewrite.
 */
(function (SAT) {
  SAT.CURRENT_CLASS_LABEL = '현재 반';
  SAT.HISTORICAL_EXAM_CLASS_LABEL = '시험 당시 반';
  SAT.RESULT_STALE_MESSAGE = '다른 화면에서 이미 저장된 답이 있습니다. 「최신 저장본으로 다시 시작」한 뒤 저장하세요.';
  SAT.RESULT_STALE_NOTICE = '다른 화면에서 이 결과가 변경되었습니다. 현재 작성 중인 답안은 이 화면에 그대로 남아 있습니다.';
  SAT.RESULT_WRITE_FORBIDDEN_MESSAGE = '시험 당시 기록은 읽기 전용입니다.';
  SAT.RESULT_READONLY_HINT = '시험 당시 기록 · 읽기 전용';

  SAT.P8_MULTI_DEVICE = {
    navigationRefetch: false,
    explicitRefresh: true,
    visibilityRefresh: true,
    staleOverwriteGuard: true,
    realtime: false,
  };

  SAT.resolveCurrentClassName = function resolveCurrentClassName(student, classes) {
    const classId = student?.classId || null;
    if (!classId) return '';
    const cls = (classes || []).find((row) => row.id === classId);
    return cls?.name || '';
  };

  SAT.formatCurrentClassCaption = function formatCurrentClassCaption(student, classes) {
    const name = SAT.resolveCurrentClassName(student, classes);
    return name
      ? `${SAT.CURRENT_CLASS_LABEL}: ${name}`
      : `${SAT.CURRENT_CLASS_LABEL}: 없음`;
  };

  SAT.formatHistoricalClassCaption = function formatHistoricalClassCaption(className) {
    const name = String(className || '').trim();
    return name
      ? `${SAT.HISTORICAL_EXAM_CLASS_LABEL}: ${name}`
      : `${SAT.HISTORICAL_EXAM_CLASS_LABEL}: —`;
  };

  SAT.isResultUpdatedAtStale = function isResultUpdatedAtStale(localRow, remoteRow) {
    if (!localRow || !remoteRow) return false;
    const local = localRow.updatedAt;
    const remote = remoteRow.updatedAt;
    if (!local || !remote) return false;
    return String(local) !== String(remote);
  };

  SAT.resolveDraftBaseUpdatedAt = function resolveDraftBaseUpdatedAt(existing) {
    return existing?.updatedAt || null;
  };

  SAT.shouldPinAnswerDraftBase = function shouldPinAnswerDraftBase(currentAnswers) {
    return currentAnswers == null;
  };

  SAT.isDraftBaseStaleAgainstRemote = function isDraftBaseStaleAgainstRemote(baseUpdatedAt, remoteRow) {
    if (!baseUpdatedAt || !remoteRow?.updatedAt) return false;
    return String(baseUpdatedAt) !== String(remoteRow.updatedAt);
  };

  SAT.nextDraftBaseUpdatedAtAfterSave = function nextDraftBaseUpdatedAtAfterSave(savedRow) {
    return savedRow?.updatedAt || null;
  };

  SAT.keepAnswerDraftAfterStoreRefresh = function keepAnswerDraftAfterStoreRefresh(draft, storeRow) {
    return {
      currentAnswers: draft?.currentAnswers,
      draftBaseUpdatedAt: Object.prototype.hasOwnProperty.call(draft || {}, 'draftBaseUpdatedAt')
        ? draft.draftBaseUpdatedAt
        : null,
      storeUpdatedAt: storeRow?.updatedAt || null,
    };
  };

  SAT.canWriteCloudResult = function canWriteCloudResult({ profile, actorId, student, examClass }) {
    if (SAT.isAdmin(profile)) return true;
    const userId = actorId || profile?.id || null;
    if (!userId || !student?.ownerId || !examClass?.ownerId) return false;
    return student.ownerId === userId && examClass.ownerId === userId;
  };

  SAT.classifyEmptyResultUpdate = function classifyEmptyResultUpdate({ baseUpdatedAt, remote }) {
    if (!remote) return SAT.RepositoryErrorCodes.NOT_FOUND;
    if (SAT.isDraftBaseStaleAgainstRemote(baseUpdatedAt, remote)) {
      return SAT.RepositoryErrorCodes.STALE;
    }
    return SAT.RepositoryErrorCodes.WRITE_FORBIDDEN;
  };

  SAT.createResultWriteForbiddenError = function createResultWriteForbiddenError() {
    return SAT.createRepositoryError({
      code: 'WRITE_FORBIDDEN',
      message: SAT.RESULT_WRITE_FORBIDDEN_MESSAGE,
    }, 'results.update');
  };

  SAT.shouldResetCloudSessionOnBootKeyChange = function shouldResetCloudSessionOnBootKeyChange(prevKey, nextKey) {
    return Boolean(nextKey) && prevKey !== nextKey;
  };

  SAT.shouldRerenderAfterBackgroundRefresh = function shouldRerenderAfterBackgroundRefresh(currentView, reason) {
    if (reason === 'manual') return true;
    return currentView !== 'answer-entry';
  };

  SAT.createResultStaleConflictError = function createResultStaleConflictError() {
    return SAT.createRepositoryError({
      code: 'STALE',
      message: SAT.RESULT_STALE_MESSAGE,
    }, 'results.update');
  };
})(window.SAT = window.SAT || {});
