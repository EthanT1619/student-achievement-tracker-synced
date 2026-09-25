/**
 * P9E — closeout helpers for dialogs, toast, backup copy.
 * Does not change scoring, RLS, or navigation architecture.
 */
(function (SAT) {
  SAT.BACKUP_UNSUPPORTED_NOTICE = '클라우드 파일 백업/내보내기는 아직 지원하지 않습니다.';
  SAT.BACKUP_STATUS_TITLE = '데이터 현황';
  SAT.CONFIRM_DIALOG_INITIAL_FOCUS = 'cancel';

  SAT.confirmDialogTreatsEscapeAsCancel = function confirmDialogTreatsEscapeAsCancel() {
    return true;
  };

  SAT.shouldAutoFocusDangerConfirm = function shouldAutoFocusDangerConfirm() {
    return false;
  };

  SAT.toastDurationMs = function toastDurationMs(type) {
    return type === 'error' ? 6000 : 3500;
  };

  SAT.shouldShowDisabledBackupActions = function shouldShowDisabledBackupActions() {
    return false;
  };

  SAT.resolveDialogReturnFocus = function resolveDialogReturnFocus(opener) {
    if (opener && typeof opener.focus === 'function') return opener;
    return null;
  };

  SAT.isSafeDialogFocusTarget = function isSafeDialogFocusTarget(action) {
    return action === 'cancel' || action === '__cancel';
  };
})(window.SAT = window.SAT || {});
