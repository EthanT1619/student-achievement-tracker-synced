/**
 * Production auth gate.
 * After AUTHENTICATED_ACTIVE, P5A boots CloudAcademicStore.
 * Logout clears in-memory cloud academic state only — not localStorage.
 */
(function (SAT) {
  const { AUTH_STATES } = SAT;

  function el(id) {
    return document.getElementById(id);
  }

  function setHidden(node, hidden) {
    if (!node) return;
    node.classList.toggle('hidden', hidden);
  }

  function renderGate(snapshot) {
    const gate = el('auth-gate');
    const academic = el('academic-app');
    const status = el('auth-gate-status');
    const googleBtn = el('auth-google');
    const logoutBtn = el('auth-gate-logout');
    const sessionLabel = el('app-session-label');
    const state = snapshot.state;

    if (state === AUTH_STATES.AUTHENTICATED_ACTIVE) {
      setHidden(gate, true);
      setHidden(academic, false);
      if (sessionLabel) {
        const name = snapshot.profile?.displayName || snapshot.user?.email || '';
        sessionLabel.textContent = SAT.formatSessionLabel(name, snapshot.profile?.role);
      }
      return;
    }

    setHidden(academic, true);
    setHidden(gate, false);
    setHidden(googleBtn, state !== AUTH_STATES.SIGNED_OUT && state !== AUTH_STATES.ERROR);
    setHidden(logoutBtn, state === AUTH_STATES.SIGNED_OUT || state === AUTH_STATES.LOADING);

    if (state === AUTH_STATES.LOADING) {
      status.textContent = '불러오는 중…';
    } else if (state === AUTH_STATES.SIGNED_OUT) {
      status.textContent = 'Google 계정으로 로그인해 주세요.';
    } else if (state === AUTH_STATES.AUTHENTICATED_INACTIVE) {
      status.textContent = '이 계정은 아직 사용 승인이 되지 않았습니다.';
    } else if (state === AUTH_STATES.ERROR) {
      status.textContent = snapshot.error?.message || '로그인 상태를 확인하지 못했습니다.';
    }
  }

  SAT.startAuthGatedApp = async function startAuthGatedApp() {
    const googleBtn = el('auth-google');
    const gateLogout = el('auth-gate-logout');
    const headerLogout = el('app-session-logout');

    if (!SAT.isSupabaseConfigured()) {
      renderGate({
        state: AUTH_STATES.ERROR,
        error: { message: '서버 연결 설정이 없습니다. 관리자에게 문의하세요.' },
      });
      return;
    }

    const auth = SAT.getAuthManager();
    let lastBootKey = null;

    function isolateCloudSession() {
      SAT.clearCloudAcademicStore?.();
      SAT.clearCloudAssessmentStore?.();
      SAT.clearCloudResultStore?.();
      if (SAT._legacyAppInstance?.resetCloudSession) {
        SAT._legacyAppInstance.resetCloudSession();
      }
      const main = el('main-content');
      if (main) main.innerHTML = '<div class="empty-state"><p>로딩 중…</p></div>';
    }

    auth.subscribe((snapshot) => {
      renderGate(snapshot);
      if (snapshot.state === AUTH_STATES.AUTHENTICATED_ACTIVE) {
        const bootKey = snapshot.user?.id || 'active';
        if (SAT.shouldResetCloudSessionOnBootKeyChange(lastBootKey, bootKey)) {
          isolateCloudSession();
          lastBootKey = bootKey;
          void SAT.startLegacyTrackerApp();
        }
      } else if (
        snapshot.state === AUTH_STATES.SIGNED_OUT
        || snapshot.state === AUTH_STATES.AUTHENTICATED_INACTIVE
      ) {
        lastBootKey = null;
        isolateCloudSession();
      }
    });

    async function onGoogle() {
      try {
        await auth.signInWithGoogle();
      } catch (err) {
        renderGate({
          state: AUTH_STATES.ERROR,
          error: err,
        });
      }
    }

    async function onLogout() {
      try {
        await auth.signOut();
      } catch (err) {
        renderGate({
          state: AUTH_STATES.ERROR,
          error: err,
        });
      }
    }

    googleBtn?.addEventListener('click', onGoogle);
    gateLogout?.addEventListener('click', onLogout);
    headerLogout?.addEventListener('click', onLogout);

    await auth.initialize();
  };

  document.addEventListener('DOMContentLoaded', () => {
    SAT.startAuthGatedApp();
  });
})(window.SAT = window.SAT || {});
