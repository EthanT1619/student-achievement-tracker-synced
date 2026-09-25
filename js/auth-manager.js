/**
 * Production AuthManager (P4B).
 * P4B authenticates against Supabase, but P5 will switch academic UI
 * operations from LocalStorageRepository to CloudRepository.
 */
(function (SAT) {
  SAT.AUTH_STATES = {
    LOADING: 'loading',
    SIGNED_OUT: 'signed_out',
    AUTHENTICATED_INACTIVE: 'authenticated_inactive',
    AUTHENTICATED_ACTIVE: 'authenticated_active',
    ERROR: 'error',
  };

  SAT.isActiveUser = function isActiveUser(profile) {
    return Boolean(profile && profile.active === true);
  };

  SAT.isAdminRole = function isAdminRole(role) {
    return role === 'admin' || role === 'system_admin';
  };

  SAT.isSystemAdminRole = function isSystemAdminRole(role) {
    return role === 'system_admin';
  };

  SAT.isAdmin = function isAdmin(profile) {
    return Boolean(profile && SAT.isAdminRole(profile.role));
  };

  SAT.isSystemAdmin = function isSystemAdmin(profile) {
    return Boolean(profile && profile.active === true && SAT.isSystemAdminRole(profile.role));
  };

  SAT.canEditCurriculum = function canEditCurriculum(profile) {
    return Boolean(
      profile
      && profile.active === true
      && SAT.isAdminRole(profile.role)
    );
  };

  function snapshotOf(manager) {
    return {
      state: manager.state,
      user: manager.user,
      profile: manager.profile,
      error: manager.error,
    };
  }

  class AuthManager {
    constructor(client) {
      this.client = client || null;
      this.state = SAT.AUTH_STATES.LOADING;
      this.user = null;
      this.profile = null;
      this.error = null;
      this._listeners = [];
      this._initPromise = null;
      this._subscribed = false;
    }

    _db() {
      return this.client || SAT.getSupabaseClient();
    }

    subscribe(listener) {
      this._listeners.push(listener);
      return () => {
        this._listeners = this._listeners.filter((fn) => fn !== listener);
      };
    }

    getState() {
      return snapshotOf(this);
    }

    _emit() {
      const snap = snapshotOf(this);
      this._listeners.forEach((fn) => {
        try {
          fn(snap);
        } catch (err) {
          console.error(err);
        }
      });
    }

    async _loadProfile(userId) {
      const { data, error } = await this._db()
        .from('profiles')
        .select('id, email, role, active, can_edit_curriculum, display_name')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data ? SAT.mapDbRowToApp(data) : null;
    }

    async _applySession(session) {
      const user = session?.user || null;
      this.user = user
        ? { id: user.id, email: user.email || null }
        : null;
      this.profile = null;
      this.error = null;

      if (!user) {
        this.state = SAT.AUTH_STATES.SIGNED_OUT;
        return;
      }

      try {
        const profile = await this._loadProfile(user.id);
        this.profile = profile;
        if (!profile || profile.active !== true) {
          this.state = SAT.AUTH_STATES.AUTHENTICATED_INACTIVE;
          return;
        }
        this.state = SAT.AUTH_STATES.AUTHENTICATED_ACTIVE;
      } catch (err) {
        this.state = SAT.AUTH_STATES.ERROR;
        this.error = err;
      }
    }

    async initialize() {
      if (this._initPromise) return this._initPromise;
      this._initPromise = this._doInitialize();
      return this._initPromise;
    }

    async _doInitialize() {
      this.state = SAT.AUTH_STATES.LOADING;
      this._emit();
      try {
        const db = this._db();
        if (!this._subscribed) {
          this._subscribed = true;
          db.auth.onAuthStateChange(async (_event, session) => {
            await this._applySession(session);
            this._emit();
          });
        }
        const { data, error } = await db.auth.getSession();
        if (error) throw error;
        await this._applySession(data.session);
      } catch (err) {
        this.state = SAT.AUTH_STATES.ERROR;
        this.error = err;
      }
      this._emit();
      return this.getState();
    }

    async signInWithGoogle() {
      const { error } = await this._db().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: SAT.authRedirectTo() },
      });
      if (error) throw error;
    }

    async signOut() {
      const { error } = await this._db().auth.signOut();
      if (error) throw error;
      this.user = null;
      this.profile = null;
      this.state = SAT.AUTH_STATES.SIGNED_OUT;
      this.error = null;
      this._emit();
    }
  }

  SAT.AuthManager = AuthManager;
  SAT.getAuthManager = function getAuthManager() {
    if (!SAT._authManager) SAT._authManager = new AuthManager();
    return SAT._authManager;
  };
})(window.SAT = window.SAT || {});
