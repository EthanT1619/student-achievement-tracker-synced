/**
 * P9A operator-facing display helpers.
 * Does not change roles, version status, Enrollment, or Result write rules.
 */
(function (SAT) {
  SAT.ROLE_DISPLAY_LABELS = {
    admin: '관리자',
    teacher: '강사',
    system_admin: '시스템 관리자',
  };

  SAT.formatRoleDisplayLabel = function formatRoleDisplayLabel(role) {
    const key = String(role || '').trim();
    return SAT.ROLE_DISPLAY_LABELS[key] || '';
  };

  SAT.formatSessionLabel = function formatSessionLabel(name, role) {
    const displayName = String(name || '').trim();
    const roleLabel = SAT.formatRoleDisplayLabel(role);
    if (displayName && roleLabel) return `${displayName} · ${roleLabel}`;
    return displayName || roleLabel;
  };

  SAT.ASSESSMENT_STATUS_LABELS = {
    draft: '초안',
    published: '공개됨',
    archived: '보관됨',
  };

  SAT.formatAssessmentStatusLabel = function formatAssessmentStatusLabel(status) {
    const raw = String(status || '').trim();
    if (!raw) return '없음';
    return SAT.ASSESSMENT_STATUS_LABELS[raw] || raw;
  };

  SAT.RESULT_STALE_REFRESH_HINT = '현재 작성 내용은 사라집니다.';
  SAT.RESULT_RESTART_FROM_REMOTE_LABEL = '최신 저장본으로 다시 시작';
  SAT.RESULT_RESTART_FROM_REMOTE_CONFIRM = '현재 작성 중인 답안은 사라집니다.\n서버에 저장된 최신 답안으로 다시 시작할까요?';
  SAT.RESULT_RESTART_FROM_REMOTE_CONFIRM_LABEL = '최신본으로 다시 시작';
  SAT.RESULT_READONLY_STATUS_BODY = '지금 이 결과는 읽기 전용입니다. 저장할 수 없습니다.';

  SAT.shouldShowRestartFromRemoteButton = function shouldShowRestartFromRemoteButton({ notice, canWrite } = {}) {
    return Boolean(notice) && canWrite !== false;
  };

  SAT.isResultStaleConflictError = function isResultStaleConflictError(err) {
    return err?.code === SAT.RepositoryErrorCodes?.STALE;
  };

  SAT.keepAnswerDraftAfterRestartCancel = function keepAnswerDraftAfterRestartCancel(draft) {
    return {
      currentAnswers: draft?.currentAnswers,
      draftBaseUpdatedAt: Object.prototype.hasOwnProperty.call(draft || {}, 'draftBaseUpdatedAt')
        ? draft.draftBaseUpdatedAt
        : null,
      resultRemoteChangedNotice: true,
    };
  };

  SAT.keepAnswerDraftAfterRestartFailure = function keepAnswerDraftAfterRestartFailure(draft) {
    return SAT.keepAnswerDraftAfterRestartCancel(draft);
  };

  SAT.buildRestartedAnswerDraftFromRemote = function buildRestartedAnswerDraftFromRemote(remote) {
    return {
      currentAnswers: remote?.answers ? { ...remote.answers } : {},
      draftBaseUpdatedAt: remote?.updatedAt || null,
      savedResultPreview: remote || null,
      resultRemoteChangedNotice: false,
    };
  };
  SAT.DASHBOARD_ENROLLMENT_COUNT_LABEL = '재원 기록';

  SAT.EXAM_OVERVIEW_DEFAULT_VIEW = SAT.STUDENT_RESULT_VIEW_TEACHER;

  SAT.resolveExamOverviewView = function resolveExamOverviewView(state) {
    if (state && Object.prototype.hasOwnProperty.call(state, 'examOverviewView')) {
      return SAT.normalizeStudentResultView(state.examOverviewView);
    }
    return SAT.normalizeStudentResultView(SAT.EXAM_OVERVIEW_DEFAULT_VIEW);
  };

  SAT.isExamOverviewTeacherView = function isExamOverviewTeacherView(state) {
    return SAT.isTeacherStudentResultView(SAT.resolveExamOverviewView(state));
  };
})(window.SAT = window.SAT || {});
