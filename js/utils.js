/**
 * Shared utilities.
 */
(function (SAT) {
  SAT.generateId = function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  SAT.escapeHtml = function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  SAT.clampPercent = function clampPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  };

  SAT.safeCount = function safeCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  };

  SAT.percentFromRatio = function percentFromRatio(correct, total) {
    const t = SAT.safeCount(total);
    if (t === 0) return 0;
    const c = SAT.safeCount(correct);
    return SAT.clampPercent(Math.round((c / t) * 100));
  };

  SAT.formatDate = function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return SAT.escapeHtml(String(iso));
      return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return SAT.escapeHtml(String(iso));
    }
  };

  SAT.formatPercent = function formatPercent(value) {
    if (value == null || Number.isNaN(value)) return '데이터 없음';
    return `${Math.round(value * 100)}%`;
  };

  SAT.formatRatio = function formatRatio(correct, total) {
    if (total === 0) return '데이터 없음';
    return `${SAT.formatPercent(correct / total)} · ${correct}/${total}`;
  };

  SAT.nowIso = function nowIso() {
    return new Date().toISOString();
  };

  SAT.daysSince = function daysSince(iso) {
    if (!iso) return Infinity;
    const then = new Date(iso).getTime();
    const now = Date.now();
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
  };

  SAT.showToast = function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--visible'));
    const holdMs = SAT.toastDurationMs ? SAT.toastDurationMs(type) : (type === 'error' ? 6000 : 3500);
    setTimeout(() => {
      el.classList.remove('toast--visible');
      setTimeout(() => el.remove(), 300);
    }, holdMs);
  };

  SAT.confirmDialog = function confirmDialog(message, { title = '확인', confirmLabel = '확인', danger = false } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-overlay');
      const modal = document.getElementById('confirm-modal');
      if (!overlay || !modal) {
        resolve(window.confirm(message));
        return;
      }
      const opener = SAT.resolveDialogReturnFocus
        ? SAT.resolveDialogReturnFocus(document.activeElement)
        : document.activeElement;
      modal.querySelector('.modal-title').textContent = title;
      modal.querySelector('.modal-body').textContent = message;
      const typedBox = document.getElementById('typed-confirm-fields');
      if (typedBox) typedBox.classList.add('hidden');
      const confirmBtn = modal.querySelector('[data-action="confirm"]');
      const cancelBtn = modal.querySelector('[data-action="cancel"]');
      confirmBtn.textContent = confirmLabel;
      confirmBtn.disabled = false;
      confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

      let settled = false;
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey, true);
        overlay.classList.add('hidden');
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onCancel);
        resolve(result);
        requestAnimationFrame(() => {
          if (opener && document.contains(opener) && typeof opener.focus === 'function') {
            opener.focus();
          }
        });
      };

      const onConfirm = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        cleanup(false);
      };

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey, true);

      overlay.classList.remove('hidden');
      modal.classList.remove('hidden');
      requestAnimationFrame(() => {
        if (!SAT.shouldAutoFocusDangerConfirm || !SAT.shouldAutoFocusDangerConfirm()) {
          cancelBtn?.focus();
        }
      });
    });
  };

  SAT.typedConfirmDialog = function typedConfirmDialog(
    message,
    { title = '확인', confirmLabel = '확인', requiredText = '', promptLabel = '문제집 이름 입력', danger = true } = {},
  ) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-overlay');
      const modal = document.getElementById('confirm-modal');
      if (!overlay || !modal) {
        const typed = window.prompt(`${message}\n\n${promptLabel}`, '');
        resolve(SAT.canSubmitForceDeleteConfirm
          ? SAT.canSubmitForceDeleteConfirm(typed, requiredText)
          : String(typed ?? '') === String(requiredText ?? ''));
        return;
      }
      const opener = SAT.resolveDialogReturnFocus
        ? SAT.resolveDialogReturnFocus(document.activeElement)
        : document.activeElement;
      modal.querySelector('.modal-title').textContent = title;
      modal.querySelector('.modal-body').textContent = message;
      const typedBox = document.getElementById('typed-confirm-fields');
      const typedInput = document.getElementById('typed-confirm-input');
      const typedLabel = document.getElementById('typed-confirm-label');
      if (typedBox) typedBox.classList.remove('hidden');
      if (typedLabel) typedLabel.textContent = promptLabel;
      if (typedInput) typedInput.value = '';
      const confirmBtn = modal.querySelector('[data-action="confirm"]');
      const cancelBtn = modal.querySelector('[data-action="cancel"]');
      confirmBtn.textContent = confirmLabel;
      confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
      confirmBtn.disabled = true;

      const syncConfirm = () => {
        const typed = typedInput ? typedInput.value : '';
        confirmBtn.disabled = SAT.canSubmitForceDeleteConfirm
          ? !SAT.canSubmitForceDeleteConfirm(typed, requiredText)
          : String(typed) !== String(requiredText);
      };
      syncConfirm();

      let settled = false;
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey, true);
        typedInput?.removeEventListener('input', syncConfirm);
        overlay.classList.add('hidden');
        modal.classList.add('hidden');
        if (typedBox) typedBox.classList.add('hidden');
        confirmBtn.disabled = false;
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onCancel);
        resolve(result);
        requestAnimationFrame(() => {
          if (opener && document.contains(opener) && typeof opener.focus === 'function') {
            opener.focus();
          }
        });
      };

      const onConfirm = () => {
        const typed = typedInput ? typedInput.value : '';
        if (SAT.canSubmitForceDeleteConfirm
          ? !SAT.canSubmitForceDeleteConfirm(typed, requiredText)
          : String(typed) !== String(requiredText)) {
          return;
        }
        cleanup(true);
      };
      const onCancel = () => cleanup(false);
      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        cleanup(false);
      };

      typedInput?.addEventListener('input', syncConfirm);
      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey, true);

      overlay.classList.remove('hidden');
      modal.classList.remove('hidden');
      requestAnimationFrame(() => {
        typedInput?.focus();
      });
    });
  };

  SAT.choiceDialog = function choiceDialog(message, { title = '선택', choices = [] } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-overlay');
      const modal = document.getElementById('confirm-modal');
      if (!overlay || !modal) {
        resolve(null);
        return;
      }
      const opener = SAT.resolveDialogReturnFocus
        ? SAT.resolveDialogReturnFocus(document.activeElement)
        : document.activeElement;

      modal.querySelector('.modal-title').textContent = title;
      modal.querySelector('.modal-body').textContent = message;
      const footer = modal.querySelector('.modal-footer');
      const originalFooterHtml = footer.innerHTML;

      footer.innerHTML = [
        ...choices.map((c) => {
          const cls = c.primary ? 'btn btn-primary' : 'btn btn-secondary';
          const disabled = c.disabled ? ' disabled' : '';
          return `<button type="button" class="${cls}" data-choice="${SAT.escapeHtml(c.id)}"${disabled}>${SAT.escapeHtml(c.label)}</button>`;
        }),
        '<button type="button" class="btn btn-secondary" data-choice="__cancel">닫기</button>',
      ].join('');

      let settled = false;
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey, true);
        overlay.classList.add('hidden');
        modal.classList.add('hidden');
        footer.innerHTML = originalFooterHtml;
        overlay.removeEventListener('click', onCancel);
        resolve(result);
        requestAnimationFrame(() => {
          if (opener && document.contains(opener) && typeof opener.focus === 'function') {
            opener.focus();
          }
        });
      };

      const onChoice = (e) => {
        const id = e.currentTarget.dataset.choice;
        if (id === '__cancel' || e.currentTarget.disabled) {
          cleanup(null);
          return;
        }
        cleanup(id);
      };

      const onCancel = () => cleanup(null);
      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        cleanup(null);
      };

      footer.querySelectorAll('[data-choice]').forEach((btn) => {
        btn.addEventListener('click', onChoice);
      });
      overlay.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey, true);

      overlay.classList.remove('hidden');
      modal.classList.remove('hidden');
      requestAnimationFrame(() => {
        footer.querySelector('[data-choice="__cancel"]')?.focus();
      });
    });
  };
})(window.SAT = window.SAT || {});
