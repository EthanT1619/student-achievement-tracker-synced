/**
 * In-memory Cloud academic session for P5A (Term/Class/Student/Enrollment).
 * P5B/P5C exam/result data is never loaded here.
 * Does not read or write studentAchievementTrackerData.
 */
(function (SAT) {
  const STATES = SAT.CLOUD_UI_STATES;

  class CloudAcademicStore {
    constructor(cloudRepo, authManager) {
      this.cloud = cloudRepo || null;
      this.auth = authManager || null;
      this.runtime = 'cloud';
      this.status = STATES.LOADING;
      this.error = null;
      this.terms = [];
      this.currentTerm = null;
      this.classes = [];
      this.enrollments = [];
      this.studentsRaw = [];
      this.legacyNotice = SAT.inspectLegacyLocalAcademicData();
      this._generation = 0;
    }

    _repo() {
      return this.cloud || SAT.createCloudRepository();
    }

    currentUserId() {
      return this.auth?.getState?.().user?.id
        || SAT.getAuthManager?.().getState?.().user?.id
        || null;
    }

    currentProfile() {
      return this.auth?.getState?.().profile
        || SAT.getAuthManager?.().getState?.().profile
        || null;
    }

    clear() {
      this._generation += 1;
      this.status = STATES.LOADING;
      this.error = null;
      this.terms = [];
      this.currentTerm = null;
      this.classes = [];
      this.enrollments = [];
      this.studentsRaw = [];
    }

    getViewStudents() {
      return SAT.composeStudentsWithEnrollment(this.studentsRaw, this.enrollments);
    }

    loadAll() {
      return {
        schemaVersion: 'cloud-p5a',
        runtime: 'cloud',
        storeStatus: this.status,
        storeError: this.error,
        terms: this.terms,
        currentTerm: this.currentTerm,
        classes: this.classes.slice(),
        students: this.getViewStudents(),
        enrollments: this.enrollments.slice(),
        exams: [],
        questions: [],
        results: [],
        assessmentTemplates: [],
        settings: { lastBackupAt: null, ignoreCase: true, uiPrefs: null },
        legacyLocalDataPresent: Boolean(this.legacyNotice.present),
      };
    }

    isStorageRecoveryRequired() {
      return false;
    }

    getStructureWarnings() {
      return [];
    }

    updateUiPrefs() {
      return { ok: true };
    }

    getClass(id) {
      return this.classes.find((c) => c.id === id) || null;
    }

    getStudent(id) {
      return this.getViewStudents().find((s) => s.id === id) || null;
    }

    getStudents({ classId, activeOnly = false } = {}) {
      let list = this.getViewStudents();
      if (classId) list = list.filter((s) => s.classId === classId);
      if (activeOnly) list = list.filter((s) => s.active !== false);
      return list;
    }

    getResults() {
      return [];
    }

    getExams() {
      return [];
    }

    getExam() {
      return null;
    }

    getQuestionsByExam() {
      return [];
    }

    getAssessmentTemplates() {
      return [];
    }

    async refresh() {
      const gen = this._generation + 1;
      this._generation = gen;
      this.status = STATES.LOADING;
      this.error = null;
      try {
        const repo = this._repo();
        const terms = await repo.listTerms();
        if (gen !== this._generation) return this;
        const currentTerm = terms.find((t) => t.isCurrent) || null;
        let classes = [];
        let enrollments = [];
        let studentsRaw = [];
        if (currentTerm) {
          classes = await repo.listClasses({ termId: currentTerm.id, includeArchived: true });
          enrollments = await repo.listEnrollments();
          studentsRaw = await repo.listStudents({ includeInactive: true });
        }
        if (gen !== this._generation) return this;
        this.terms = terms;
        this.currentTerm = currentTerm;
        this.classes = classes;
        this.enrollments = enrollments;
        this.studentsRaw = studentsRaw;
        this.status = terms.length ? STATES.READY : STATES.EMPTY;
        this.error = null;
      } catch (err) {
        if (gen !== this._generation) return this;
        this.status = STATES.ERROR;
        this.error = err;
      }
      return this;
    }

    async createTerm(data) {
      const term = await this._repo().createTerm(data);
      await this.refresh();
      return term;
    }

    async setCurrentTerm(id) {
      const term = await this._repo().setCurrentTerm(id);
      await this.refresh();
      return term;
    }

    async updateTerm(id, patch) {
      const term = await this._repo().updateTerm(id, patch);
      await this.refresh();
      return term;
    }

    async createClass({ name, level }) {
      const termId = this.currentTerm?.id;
      const ownerId = this.currentUserId();
      if (!termId) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '현재 학기가 없습니다. 먼저 학기를 만들고 현재 학기로 지정하세요.',
        }, 'classes.create');
      }
      if (!ownerId) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '로그인 정보를 확인할 수 없습니다.',
        }, 'classes.create');
      }
      const row = await this._repo().createClass({
        termId,
        ownerId,
        name,
        level: SAT.normalizeLevel(level),
        archived: false,
      });
      await this.refresh();
      return row;
    }

    async updateClassName(id, name) {
      const row = await this._repo().updateClass(id, { name });
      await this.refresh();
      return row;
    }

    async archiveClass(id, archived = true) {
      const row = await this._repo().updateClass(id, { archived });
      await this.refresh();
      return row;
    }

    async deleteClass(id) {
      const linked = this.enrollments.filter((e) => e.classId === id);
      if (linked.length) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이 반에 등록 기록이 있어 삭제할 수 없습니다. 보관을 사용하세요.',
        }, 'classes.delete');
      }
      await this._repo().deleteClass(id);
      await this.refresh();
    }

    /**
     * Two browser calls, not a DB transaction.
     * If Enrollment fails we try to delete the Student.
     * Residual risk: Student remains if cleanup delete is also rejected.
     */
    async createStudentInClass({ name, englishName, classId }) {
      const ownerId = this.currentUserId();
      if (!ownerId) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '로그인 정보를 확인할 수 없습니다.',
        }, 'students.createWithEnrollment');
      }
      const repo = this._repo();
      // Membership is Enrollment. Never send students.current_class_id.
      const student = await repo.createStudent({
        ownerId,
        name,
        englishName: englishName || '',
        active: true,
      });
      try {
        const enrollment = await repo.createEnrollment({
          studentId: student.id,
          classId,
          startDate: SAT.isoDateLocal(),
          endDate: null,
        });
        await this.refresh();
        return { student, enrollment, partial: false, cleaned: false };
      } catch (enrollErr) {
        let cleaned = false;
        try {
          await repo.deleteStudent(student.id);
          cleaned = true;
        } catch {
          cleaned = false;
        }
        await this.refresh();
        const err = SAT.createRepositoryError({
          code: 'VALIDATION',
          message: cleaned
            ? '반 배정에 실패하여 학생 생성을 취소했습니다. 다시 시도해주세요.'
            : '학생은 만들어졌지만 반 배정에 실패했습니다. 학생은 명단에 없을 수 있습니다.',
        }, 'students.createWithEnrollment');
        err.partial = !cleaned;
        err.cleaned = cleaned;
        err.studentId = student.id;
        err.cause = enrollErr;
        throw err;
      }
    }

    async listProfiles() {
      return this._repo().listProfiles();
    }

    async transferStudentToClass({ studentId, newClassId, newStartDate }) {
      const row = await this._repo().transferStudentToClass({
        studentId,
        newClassId,
        newStartDate,
      });
      await this.refresh();
      return row;
    }

    async updateStudentProfile(id, { name, englishName }) {
      const row = await this._repo().updateStudent(id, { name, englishName });
      await this.refresh();
      return row;
    }

    async setStudentActive(id, active) {
      const row = await this._repo().updateStudent(id, { active });
      await this.refresh();
      return row;
    }

    async deleteStudent(id) {
      const linked = this.enrollments.filter((e) => e.studentId === id);
      if (linked.length) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이 학생의 반 등록 기록이 있어 삭제할 수 없습니다. 비활성화를 사용하세요.',
        }, 'students.delete');
      }
      await this._repo().deleteStudent(id);
      await this.refresh();
    }
  }

  SAT.CloudAcademicStore = CloudAcademicStore;

  SAT.getCloudAcademicStore = function getCloudAcademicStore() {
    if (!SAT._cloudAcademicStore) {
      SAT._cloudAcademicStore = new CloudAcademicStore(
        SAT.createCloudRepository(),
        SAT.getAuthManager()
      );
    }
    return SAT._cloudAcademicStore;
  };

  SAT.clearCloudAcademicStore = function clearCloudAcademicStore() {
    if (SAT._cloudAcademicStore) SAT._cloudAcademicStore.clear();
  };
})(window.SAT = window.SAT || {});
