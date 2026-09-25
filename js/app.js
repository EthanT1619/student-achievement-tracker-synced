(function (SAT) {
  const {
    APP_NAME,
    createRepository, Renderer, ImportExportManager,
    buildResultRecord, confirmDialog, choiceDialog, typedConfirmDialog, showToast, generateId, escapeHtml,
    normalizeCategory, collectMiddleSuggestions,
    detectAnswerMode, keyToAnswerOption,
    parseBulkAnswerInput, validateBulkAnswers, tokensToAnswersMap,
    renderBulkValidationHtml,
    setPageGuideOpen, isPageGuideOpen, setChecklistOpen,
    renderHelpModalShell,
    normalizeStudentResultDisplay,
    getStudentResultDisplayPreset, normalizeStudentResultView,
    STUDENT_RESULT_VIEW_COUNSELING, STUDENT_RESULT_VIEW_TEACHER,
    DEFAULT_UI_PREFS, normalizeUiPrefs,
    filterExams, sortExamsByDateDesc, formatExamOptionLabel,
    collectDistinctClassLevels, collectDistinctExamTypes, ensureValidExamSelection,
    filterTemplatesByLevel, templateQuestionsToExamQuestions, hasDuplicateTemplateName,
    buildPresetAssessmentTemplate, examQuestionsToTemplateQuestions, PRESET_ASSESSMENT_TEMPLATES,
    buildDuplicatedExamRecords,
    getCqBlueprintForLevel,
    parseCqQuickAnswers, validateCqQuickAnswers,
    CQ_BLUEPRINT_QUESTION_COUNT, EXAM_SETUP_CQ_QUICK, EXAM_SETUP_CQ_UNSUPPORTED,
    resizeQuestions, getRemovedQuestions, hasMeaningfulQuestionData,
    buildQuestionCountReductionMessage, needsQuestionCountReductionConfirm,
    mergeQuestionsForReductionCheck,
    prepareQuestionRangePatch, applyQuestionRangePatch,
    isSaveFailure, STORAGE_RECOVERY_MESSAGE, STORAGE_RECOVERY_START_FRESH_MESSAGE,
  } = SAT;

  class StudentAchievementApp {
  constructor() {
    // P5A: authenticated runtime uses CloudAcademicStore (Term/Class/Student/Enrollment).
    // LocalStorageRepository is not used for academic reads/writes.
    this.store = null;
    this.repository = null;
    this.importExport = null;
    this.renderer = new Renderer(this);
    this._eventsBound = false;
    this._commentSaveTimer = null;
    this._commentDirtyResultId = null;
    this._examSearchTimer = null;
    this.state = {
      currentView: 'dashboard',
      selectedClassId: null,
      editingExamId: null,
      answerEntry: { classId: '', examId: '', studentId: '', overrideStudentIds: [] },
      answerEntryMode: 'fast',
      bulkInputDraft: '',
      answerIssueQuestions: [],
      currentAnswers: null,
      draftBaseUpdatedAt: null,
      resultRemoteChangedNotice: false,
      teacherCommentDraft: '',
      teacherCommentOpen: false,
      savedResultPreview: null,
      currentQuestion: 1,
      studentResults: { classId: '', studentId: '' },
      selectedResultId: null,
      studentResultView: STUDENT_RESULT_VIEW_COUNSELING,
      examOverviewView: STUDENT_RESULT_VIEW_TEACHER,
      studentResultDisplay: getStudentResultDisplayPreset(STUDENT_RESULT_VIEW_COUNSELING),
      studentAnalytics: { termId: '', level: '', majorCategory: '' },
      srDisplayModalOpen: false,
      examOverviewId: null,
      examOverviewMode: 'single',
      examsListFilters: { ...DEFAULT_UI_PREFS.examsListFilters },
      examOverviewFilters: { ...DEFAULT_UI_PREFS.examOverviewFilters },
      examSetup: { classId: '', templateId: '', cqDraftAnswers: {}, cqBulkDraft: '' },
      editingTemplateId: null,
      library: {
        level: '',
        assessmentType: '',
        active: 'all',
        selectedAssessmentId: null,
        selectedVersionId: null,
        assignClassId: '',
        assignVersionId: '',
        assignDate: '',
      },
      transfer: null,
      classWorkspace: SAT.normalizeClassWorkspace
        ? SAT.normalizeClassWorkspace()
        : { showAddClass: false, showClassManage: false, showAddStudent: false, managingStudentId: null },
    };
  }

  canEditCurriculum() {
    return SAT.canEditCurriculum(this.store?.currentProfile?.());
  }

  isCloudRuntime() {
    return this.store?.runtime === 'cloud';
  }

  isCloudAdmin() {
    return SAT.isAdmin(this.store?.currentProfile?.());
  }

  resetCloudSession() {
    SAT.clearCloudAcademicStore();
    SAT.clearCloudAssessmentStore?.();
    SAT.clearCloudResultStore?.();
    this.state.selectedClassId = null;
    this.state.answerEntry = { classId: '', examId: '', studentId: '', overrideStudentIds: [] };
    this.state.currentAnswers = null;
    this.state.draftBaseUpdatedAt = null;
    this.state.resultRemoteChangedNotice = false;
    this.state.teacherCommentDraft = '';
    this.state.teacherCommentOpen = false;
    this.state.savedResultPreview = null;
    this.state.studentResults = { classId: '', studentId: '' };
    this.state.studentResultView = STUDENT_RESULT_VIEW_COUNSELING;
    this.state.examOverviewView = STUDENT_RESULT_VIEW_TEACHER;
    this.state.studentAnalytics = { termId: '', level: '', majorCategory: '' };
    this.state.examOverviewFilters = { ...DEFAULT_UI_PREFS.examOverviewFilters };
    this.state.examOverviewId = null;
    this.state.examSetup = { classId: '', templateId: '', cqDraftAnswers: {}, cqBulkDraft: '' };
    this.state.transfer = null;
    this.state.classWorkspace = SAT.classWorkspaceAfterSessionReset
      ? SAT.classWorkspaceAfterSessionReset()
      : { showAddClass: false, showClassManage: false, showAddStudent: false, managingStudentId: null };
    this.state.library = {
      level: '',
      assessmentType: '',
      active: 'all',
      selectedAssessmentId: null,
      selectedVersionId: null,
      assignClassId: '',
      assignVersionId: '',
      assignDate: '',
    };
  }

  async initCloud() {
    this.store = SAT.getCloudAcademicStore();
    this.assessmentStore = SAT.getCloudAssessmentStore();
    this.resultStore = SAT.getCloudResultStore();
    this.repository = this.store;
    if (!this._eventsBound) {
      this.bindEvents();
      this._eventsBound = true;
    }
    await Promise.all([
      this.store.refresh(),
      this.assessmentStore.refresh(),
      this.resultStore.refresh(),
    ]);
    if (this.store.classes.length) {
      const workClasses = SAT.dashboardWorkClasses?.(this.store.classes) || this.store.classes.filter((c) => !c.archived);
      const stillThere = SAT.isAccessibleSharedClass?.(this.state.selectedClassId, this.store.classes)
        ?? this.store.classes.some((c) => c.id === this.state.selectedClassId && !c.archived);
      if (!stillThere) this.state.selectedClassId = workClasses[0]?.id || null;
      if (!this.state.library.assignClassId) this.state.library.assignClassId = this.state.selectedClassId;
    } else {
      this.state.selectedClassId = null;
    }
    this.navigate(this.state.currentView || 'dashboard');
  }

  init() {
    return this.initCloud();
  }

  cloudErrorToast(err) {
    showToast(SAT.formatRepositoryUserMessage(err), 'error');
    if (err) console.error(err);
  }

  revealAnswerEntryStaleConflict(err) {
    if (!SAT.isResultStaleConflictError?.(err)) return;
    this.state.resultRemoteChangedNotice = true;
    if (this.state.currentView === 'answer-entry') {
      this.renderer.render('answer-entry');
    }
  }

  blockDeferredAcademicWrite() {
    showToast(SAT.DEFERRED_CLOUD_EXAM_MESSAGE, 'error');
    return false;
  }

  blockDeferredResultWrite() {
    showToast(SAT.DEFERRED_CLOUD_RESULT_MESSAGE || SAT.DEFERRED_CLOUD_EXAM_MESSAGE, 'error');
    return false;
  }

  blockLegacyLocalWrite() {
    showToast('클라우드 모드에서는 로컬 JSON을 가져오거나 학업 데이터를 초기화하지 않습니다.', 'error');
    return false;
  }

  navigate(view, extras = {}) {
    if (this.state.currentView === 'student-results' && view !== 'student-results') {
      this.flushTeacherCommentSave();
    }
    if (view !== 'student-results') this.closeSrDisplayModal();
    this.state.currentView = view;
    if (extras.classId) this.rememberSharedClass(extras.classId);
    this.applySharedClassContext(view);
    if (extras.examId) {
      this.state.examOverviewId = extras.examId;
      const examData = this.repository.loadAll();
      const pickedExam = examData.exams.find((e) => e.id === extras.examId);
      if (pickedExam) {
        this.state.examOverviewFilters.classId = pickedExam.classId;
        this.rememberSharedClass(pickedExam.classId);
      }
      this.saveUiPrefs();
    }
    if (extras.editingExamId !== undefined) {
      this.state.editingExamId = extras.editingExamId;
      this.state.editingTemplateId = null;
    } else if (view === 'exams') {
      this.state.editingExamId = null;
      if (!extras.editingExamId && extras.editingTemplateId === undefined) {
        this.state.editingTemplateId = null;
      }
      if (!this.state.examSetup.classId && this.state.examsListFilters.classId) {
        this.state.examSetup.classId = this.state.examsListFilters.classId;
      }
    }
    this.renderer.render(view);
    if (view === 'exams') void this.ensureLibraryQuestions();
    if (view === 'student-results' && this.state.studentResults.studentId) {
      void this.ensureStudentAnalyticsLoaded(this.state.studentResults.studentId);
    }
    if (view === 'exam-overview') {
      this.syncExamOverviewInstanceForClass();
      void this.ensureExamOverviewAnalyticsLoaded(this.state.examOverviewId);
    }
  }

  rememberSharedClass(classId) {
    this.state.selectedClassId = SAT.rememberSharedClassId
      ? SAT.rememberSharedClassId(classId, this.store?.classes || [])
      : (classId || null);
  }

  applySharedClassContext(view) {
    if (!SAT.applySharedClassToScreenState) return;
    const next = SAT.applySharedClassToScreenState({
      view,
      sharedClassId: this.state.selectedClassId,
      classes: this.store?.classes || [],
      answerEntry: this.state.answerEntry,
      studentResults: this.state.studentResults,
      examOverviewFilters: this.state.examOverviewFilters,
      draft: {
        currentAnswers: this.state.currentAnswers,
        draftBaseUpdatedAt: this.state.draftBaseUpdatedAt,
        studentId: this.state.answerEntry?.studentId,
      },
    });
    this.state.selectedClassId = next.selectedClassId;
    this.state.answerEntry = next.answerEntry;
    this.state.studentResults = next.studentResults;
    this.state.examOverviewFilters = next.examOverviewFilters;
    if (next.examOverviewClassChanged) this.syncExamOverviewInstanceForClass();
  }

  syncExamOverviewInstanceForClass() {
    const classId = this.state.examOverviewFilters?.classId;
    const instances = classId && this.assessmentStore
      ? this.assessmentStore.examInstancesForClass(classId)
      : [];
    if (!instances.some((row) => row.id === this.state.examOverviewId)) {
      this.state.examOverviewId = instances[0]?.id || null;
    }
  }

  openDashboardClass(classId) {
    this.rememberSharedClass(classId);
    this.navigate('classes');
  }

  openDashboardAnswerEntry(classId) {
    this.rememberSharedClass(classId);
    this.navigate('answer-entry');
  }

  async ensureLibraryQuestions() {
    const id = this.state.library?.selectedVersionId;
    if (!id || !this.assessmentStore) return;
    if (this.assessmentStore.hasLoadedQuestions(id)) return;
    try {
      await this.assessmentStore.loadVersionQuestions(id);
      if (this.state.currentView === 'exams') this.renderer.render('exams');
    } catch (err) {
      this.cloudErrorToast(err);
    }
  }

  studentAnalyticsVersionIds(studentId) {
    const results = this.resultStore?.resultsForStudent(studentId) || [];
    return SAT.collectVersionIdsForResults(results, this.assessmentStore?.examInstances || []);
  }

  hasStudentAnalyticsQuestions(studentId) {
    if (!studentId || !this.assessmentStore) return false;
    const ids = this.studentAnalyticsVersionIds(studentId);
    if (!ids.length) return true;
    return ids.every((id) => this.assessmentStore.hasLoadedQuestions(id));
  }

  async ensureStudentAnalyticsLoaded(studentId) {
    if (!studentId || !this.assessmentStore) {
      this.renderer.render('student-results');
      return;
    }
    const key = `student:${studentId}`;
    if (this._analyticsLoadKey === key && this._analyticsLoadPromise) return this._analyticsLoadPromise;
    this._analyticsLoadKey = key;
    this._analyticsLoadPromise = this._loadStudentAnalytics(studentId).finally(() => {
      if (this._analyticsLoadKey === key) this._analyticsLoadPromise = null;
    });
    return this._analyticsLoadPromise;
  }

  async _loadStudentAnalytics(studentId) {
    try {
      await this.assessmentStore.ensureQuestionsForVersions(this.studentAnalyticsVersionIds(studentId));
      if (this.state.currentView === 'student-results') this.renderer.render('student-results');
    } catch (err) {
      this.cloudErrorToast(err);
    }
  }

  async ensureExamOverviewAnalyticsLoaded(instanceId) {
    const instance = (this.assessmentStore?.examInstances || []).find((row) => row.id === instanceId)
      || (this.assessmentStore?.examInstances || []).find((row) => row.classId === (this.state.examOverviewFilters?.classId || this.state.selectedClassId));
    const versionId = instance?.assessmentVersionId;
    if (!versionId) {
      this.renderer.render('exam-overview');
      return;
    }
    const key = `overview:${instance.id}`;
    if (this._analyticsLoadKey === key && this._analyticsLoadPromise) return this._analyticsLoadPromise;
    this._analyticsLoadKey = key;
    this._analyticsLoadPromise = this._loadExamOverviewAnalytics(instance).finally(() => {
      if (this._analyticsLoadKey === key) this._analyticsLoadPromise = null;
    });
    return this._analyticsLoadPromise;
  }

  async _loadExamOverviewAnalytics(instance) {
    try {
      await this.assessmentStore.ensureQuestionsForVersions([instance.assessmentVersionId]);
      if (this.state.currentView === 'exam-overview') this.renderer.render('exam-overview');
    } catch (err) {
      this.cloudErrorToast(err);
    }
  }

  hydrateUiPrefs(data) {
    const prefs = normalizeUiPrefs(data.settings?.uiPrefs);
    this.state.examsListFilters = { ...prefs.examsListFilters };
    this.state.examOverviewFilters = { ...prefs.examOverviewFilters };
    if (prefs.answerEntry.classId) {
      this.state.answerEntry.classId = prefs.answerEntry.classId;
    }
    if (prefs.answerEntry.examId) {
      this.state.answerEntry.examId = prefs.answerEntry.examId;
    }
    if (prefs.examOverviewId) {
      this.state.examOverviewId = prefs.examOverviewId;
    }
    this.validatePersistedExamSelections(data);
  }

  validatePersistedExamSelections(data) {
    const { classes, exams } = data;
    if (this.state.answerEntry.classId) {
      const classExams = sortExamsByDateDesc(
        exams.filter((e) => e.classId === this.state.answerEntry.classId)
      );
      this.state.answerEntry.examId = ensureValidExamSelection(
        this.state.answerEntry.examId,
        classExams
      );
    } else {
      this.state.answerEntry.examId = '';
    }

    const overviewExams = filterExams(exams, {
      classes,
      ...this.state.examOverviewFilters,
    });
    this.state.examOverviewId = ensureValidExamSelection(
      this.state.examOverviewId,
      overviewExams
    );
  }

  saveUiPrefs() {
    return true;
  }

  showStorageError(result) {
    showToast(result?.message || '데이터 저장에 실패했습니다.', 'error');
  }

  applySaveResult(result, { successMessage, onSuccess } = {}) {
    if (isSaveFailure(result)) {
      this.showStorageError(result);
      return false;
    }
    if (successMessage) showToast(successMessage);
    if (onSuccess) onSuccess(result?.data);
    return true;
  }

  downloadCorruptJson() {
    this.blockLegacyLocalWrite();
  }

  async recoveryStartFresh() {
    this.blockLegacyLocalWrite();
  }

  async importJsonFile() {
    this.blockLegacyLocalWrite();
    return false;
  }

  bindEvents() {
    document.addEventListener('click', (e) => this.handleClick(e));
    document.addEventListener('change', (e) => this.handleChange(e));
    document.addEventListener('submit', (e) => this.handleSubmit(e));
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    document.addEventListener('input', (e) => {
      if (e.target.matches('[data-field="teacher-comment"]')) {
        this.onTeacherCommentInput(e.target);
      }
      if (e.target.matches('[data-filter="exams-filter-search"]')) {
        this.state.examsListFilters.search = e.target.value;
        if (this._examSearchTimer) clearTimeout(this._examSearchTimer);
        this._examSearchTimer = setTimeout(() => {
          this._examSearchTimer = null;
          this.saveUiPrefs();
          if (this.state.currentView === 'exams') this.renderer.render('exams');
        }, 300);
      }
    });
    document.addEventListener(
      'blur',
      (e) => {
        if (e.target.matches('[data-field="teacher-comment"]')) {
          this.flushTeacherCommentSave();
        }
      },
      true
    );
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.refreshCloudStores({ reason: 'visibility' });
      }
    });
  }

  async refreshCloudStores({ reason = 'manual' } = {}) {
    if (!this.store || !this.assessmentStore || !this.resultStore) return;
    if (this._refreshingCloud) return;
    this._refreshingCloud = true;
    try {
      await Promise.all([
        this.store.refresh(),
        this.assessmentStore.refresh(),
        this.resultStore.refresh(),
      ]);
      if (this.store.classes.length) {
        const stillThere = this.store.classes.some((c) => c.id === this.state.selectedClassId);
        if (!stillThere) {
          const workClasses = SAT.dashboardWorkClasses?.(this.store.classes) || this.store.classes.filter((c) => !c.archived);
          this.state.selectedClassId = workClasses[0]?.id || null;
        }
      } else {
        this.state.selectedClassId = null;
      }
      if (this.state.transfer?.studentId) {
        const visible = (this.store.getViewStudents?.() || []).some((s) => s.id === this.state.transfer.studentId);
        if (!visible) this.state.transfer = null;
      }
      if (this.state.currentView === 'answer-entry') {
        this.detectAnswerEntryRemoteChange();
      }
      if (SAT.shouldRerenderAfterBackgroundRefresh(this.state.currentView, reason)) {
        this.renderer.render(this.state.currentView);
      } else {
        this.syncAnswerEntryRemoteNotice();
      }
    } catch (err) {
      this.cloudErrorToast(err);
    } finally {
      this._refreshingCloud = false;
    }
  }

  handleClick(e) {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      const view = nav.dataset.nav;
      const extras = {};
      if (nav.dataset.examId) extras.examId = nav.dataset.examId;
      this.navigate(view, extras);
      return;
    }

    const gotoTarget = e.target.closest('[data-goto]');
    if (gotoTarget?.closest('#answer-entry-card')) {
      e.preventDefault();
      this.goToQuestion(Number(gotoTarget.dataset.goto));
      return;
    }

    const action = e.target.closest('[data-action]');
    if (!action) return;

    const act = action.dataset.action;
    const handlers = {
      'export-json': () => this.exportJson(),
      'export-csv': () => this.exportCsv(action.dataset.examId),
      'reset-all': () => this.resetAll(),
      'download-corrupt-json': () => this.downloadCorruptJson(),
      'recovery-start-fresh': () => void this.recoveryStartFresh(),
      'retry-cloud-load': () => void this.initCloud(),
      'refresh-cloud': () => void this.refreshCloudStores({ reason: 'manual' }),
      'restart-answer-from-remote': () => void this.restartAnswerDraftFromRemote(),
      'set-current-term': () => void this.setCurrentTerm(action.dataset.id),
      'edit-term': () => void this.editTerm(action.dataset.id),
      'select-class': () => this.selectClass(action.dataset.id),
      'toggle-add-class': () => this.toggleClassWorkspacePanel('showAddClass'),
      'toggle-class-manage': () => this.toggleClassWorkspacePanel('showClassManage'),
      'toggle-add-student': () => this.toggleClassWorkspacePanel('showAddStudent'),
      'toggle-student-manage': () => this.toggleStudentManage(action.dataset.id),
      'cancel-add-class': () => this.setClassWorkspacePanel({ showAddClass: false }),
      'cancel-add-student': () => this.setClassWorkspacePanel({ showAddStudent: false }),
      'open-dashboard-class': () => this.openDashboardClass(action.dataset.id),
      'open-dashboard-answer-entry': () => this.openDashboardAnswerEntry(action.dataset.id),
      'archive-class': () => void this.archiveClass(action.dataset.id),
      'edit-class': () => this.editClass(action.dataset.id),
      'delete-class': () => this.deleteClass(action.dataset.id),
      'edit-student': () => this.editStudent(action.dataset.id),
      'archive-student': () => this.archiveStudent(action.dataset.id),
      'activate-student': () => this.activateStudent(action.dataset.id),
      'delete-student': () => this.deleteStudent(action.dataset.id),
      'transfer-student': () => void this.openTransferStudent(action.dataset.id),
      'cancel-transfer': () => this.cancelTransfer(),
      'select-assessment': () => void this.selectAssessment(action.dataset.id),
      'select-version': () => void this.selectAssessmentVersion(action.dataset.id),
      'create-draft-version': () => void this.createDraftVersion(action.dataset.assessmentId),
      'publish-version': () => void this.publishAssessmentVersion(action.dataset.id),
      'archive-version': () => void this.archiveAssessmentVersion(action.dataset.id),
      'copy-to-new-version': () => void this.copyPublishedToDraft(action.dataset.id),
      'apply-cq-blueprint': () => void this.applyCqBlueprint(action.dataset.versionId),
      'cloud-cq-correct-answer': () => this.setCloudCqCorrectAnswer(Number(action.dataset.number), action.dataset.answer),
      'apply-authoring-bulk': () => this.applyAuthoringBulkAnswers(),
      'add-draft-question': () => void this.addDraftQuestion(action.dataset.versionId),
      'delete-draft-question': () => void this.deleteDraftQuestion(action.dataset.questionId),
      'edit-assessment-title': () => void this.editAssessmentTitle(action.dataset.id),
      'archive-assessment': () => void this.setAssessmentActive(action.dataset.id, false),
      'activate-assessment': () => void this.setAssessmentActive(action.dataset.id, true),
      'delete-unused-assessment': () => void this.deleteUnusedAssessment(action.dataset.id),
      'show-unused-delete-reason': () => this.showUnusedAssessmentDeleteReason(action.dataset.id),
      'force-delete-assessment': () => void this.forceDeleteAssessment(action.dataset.id),
      'edit-instance-date': () => void this.editExamInstanceDate(action.dataset.id),
      'delete-exam-instance': () => void this.deleteExamInstance(action.dataset.id),
      'open-answer-entry': () => void this.openAnswerEntry(action.dataset.id),
      'add-override-student': () => void this.addAnswerOverrideStudent(),
      'edit-exam': () => this.navigate('exams', { editingExamId: action.dataset.id }),
      'cancel-edit-exam': () => {
        this.state.editingExamId = null;
        this.navigate('exams');
      },
      'duplicate-exam': () => this.duplicateExam(action.dataset.id),
      'create-template-from-exam': () => this.createTemplateFromExam(action.dataset.id),
      'edit-template': () => {
        this.state.editingTemplateId = action.dataset.id;
        this.state.editingExamId = null;
        this.renderer.render('exams');
      },
      'duplicate-template': () => this.duplicateAssessmentTemplate(action.dataset.id),
      'delete-template': () => this.deleteAssessmentTemplate(action.dataset.id),
      'cancel-edit-template': () => {
        this.state.editingTemplateId = null;
        this.renderer.render('exams');
      },
      'add-preset-template': () => this.addPresetTemplate(action.dataset.preset),
      'new-template': () => {
        this.state.editingTemplateId = '__new__';
        this.state.editingExamId = null;
        this.renderer.render('exams');
      },
      'select-exam-template': () => {
        this.state.examSetup.templateId = action.dataset.id;
        this.state.examSetup.cqDraftAnswers = {};
        this.state.examSetup.cqBulkDraft = '';
        this.renderer.render('exams');
      },
      'select-cq-quick': () => this.selectCqQuickCreate(),
      'apply-cq-quick-answers': () => this.applyCqQuickAnswers(),
      'delete-exam': () => this.deleteExam(action.dataset.id, Number(action.dataset.results)),
      'prev-question': () => this.moveQuestion(-1),
      'next-question': () => this.moveQuestion(1),
      'save-answers': () => this.saveAnswers(),
      'save-and-next-student': () => this.saveAnswers({ andNextStudent: true }),
      'toggle-teacher-comment': () => this.toggleTeacherCommentPanel(),
      'answer-mode-fast': () => this.setAnswerEntryMode('fast'),
      'answer-mode-bulk': () => this.setAnswerEntryMode('bulk'),
      'apply-bulk': () => this.applyBulkAnswers(),
      'select-result': () => {
        this.flushTeacherCommentSave();
        this.state.selectedResultId = action.dataset.id;
        this.renderer.render('student-results');
      },
      'print-results': () => {
        this.flushTeacherCommentSave();
        SAT.printStudentResults();
      },
      'print-exam-overview': () => SAT.printExamOverview(),
      'toggle-sr-display': () => this.toggleStudentResultDisplay(action.dataset.displayKey),
      'sr-display-all-on': () => this.setStudentResultDisplayAll(true),
      'sr-display-all-off': () => this.setStudentResultDisplayAll(false),
      'open-sr-display': () => this.openSrDisplayModal(),
      'close-sr-display': () => this.closeSrDisplayModal(),
      'student-result-view-counseling': () => this.setStudentResultView(STUDENT_RESULT_VIEW_COUNSELING),
      'student-result-view-teacher': () => this.setStudentResultView(STUDENT_RESULT_VIEW_TEACHER),
      'exam-overview-mode-single': () => this.setExamOverviewMode('single'),
      'exam-overview-mode-all': () => this.setExamOverviewMode('all'),
      'copy-prev-categories': () => this.copyPrevCategories(Number(action.dataset.num)),
      'apply-question-range-patch': () => {
        void this.applyQuestionRangePatch();
      },
      'range-patch-preset': () => this.handleRangePatchPreset(action.dataset.preset),
      'toggle-page-guide': () => this.togglePageGuide(action.dataset.guideView),
      'toggle-checklist': () => this.toggleChecklist(),
      'open-help': () => this.openHelp(action.dataset.helpSection),
      'close-help': () => this.closeHelp(),
    };

    if (act === 'help-scroll') {
      e.preventDefault();
      const el = document.getElementById(`help-${action.dataset.helpId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.focus({ preventScroll: true });
      return;
    }

    if (act === 'goto') {
      this.goToQuestion(Number(action.dataset.goto));
      return;
    }

    if (act === 'cq-quick-answer') {
      this.setCqQuickAnswer(Number(action.dataset.number), action.dataset.answer);
      return;
    }

    if (act === 'cloud-cq-correct-answer') {
      this.setCloudCqCorrectAnswer(Number(action.dataset.number), action.dataset.answer);
      return;
    }

    if (action.classList.contains('answer-btn')) {
      this.setAnswer(action.dataset.answer, true);
      return;
    }

    if (handlers[act]) handlers[act]();
  }

  handleChange(e) {
    const filter = e.target.dataset.filter;
    if (!filter) {
      if (e.target.matches('[data-question-major]')) {
        this.refreshMiddleDatalist(e.target);
      }
      if (e.target.matches('[data-authoring-grading]')) {
        this.syncAuthoringGradingRow(e.target);
      }
      if (e.target.matches('[data-create-assessment-field]')) {
        this.syncCreateAssessmentGeneratorUi();
      }
      if (e.target.matches('[data-action-change="draft-choice-count"]')) {
        void this.changeDraftChoiceCount(e.target.dataset.versionId, e.target.value);
      }
      if (e.target.name === 'questionCount') {
        this.handleQuestionCountChange(e.target);
      }
      return;
    }

    const filters = {
      classId: () => {
        this.state.answerEntry.classId = e.target.value;
        this.rememberSharedClass(e.target.value);
        this.state.answerEntry.examId = '';
        this.state.answerEntry.studentId = '';
        this.state.answerEntry.overrideStudentIds = [];
        this.state.currentAnswers = null;
        this.state.draftBaseUpdatedAt = null;
        this.state.resultRemoteChangedNotice = false;
        this.state.teacherCommentDraft = '';
        this.state.teacherCommentOpen = false;
        this.state.savedResultPreview = null;
        this.state.bulkInputDraft = '';
        this.state.answerIssueQuestions = [];
        this.saveUiPrefs();
        this.renderer.render('answer-entry');
      },
      examId: () => {
        this.state.answerEntry.examId = e.target.value;
        this.state.answerEntry.studentId = '';
        this.state.answerEntry.overrideStudentIds = [];
        this.state.currentAnswers = null;
        this.state.draftBaseUpdatedAt = null;
        this.state.resultRemoteChangedNotice = false;
        this.state.teacherCommentDraft = '';
        this.state.teacherCommentOpen = false;
        this.state.savedResultPreview = null;
        this.state.currentQuestion = 1;
        this.state.bulkInputDraft = '';
        this.state.answerIssueQuestions = [];
        this.saveUiPrefs();
        void this.ensureAnswerEntryLoaded();
      },
      studentId: () => {
        this.state.answerEntry.studentId = e.target.value;
        this.state.currentAnswers = null;
        this.state.draftBaseUpdatedAt = null;
        this.state.resultRemoteChangedNotice = false;
        this.state.teacherCommentDraft = '';
        this.state.teacherCommentOpen = false;
        this.state.savedResultPreview = null;
        this.state.currentQuestion = 1;
        this.state.bulkInputDraft = '';
        this.state.answerIssueQuestions = [];
        this.hydrateAnswerDraftFromExisting();
        this.renderer.render('answer-entry');
      },
      'sr-classId': () => {
        this.flushTeacherCommentSave();
        this.state.studentResults.classId = e.target.value;
        this.rememberSharedClass(e.target.value);
        this.state.studentResults.studentId = '';
        this.state.selectedResultId = null;
        this.state.studentAnalytics = { termId: '', level: '', majorCategory: '' };
        this.renderer.render('student-results');
      },
      'sr-studentId': () => {
        this.flushTeacherCommentSave();
        this.state.studentResults.studentId = e.target.value;
        this.state.selectedResultId = null;
        this.state.studentAnalytics = { termId: '', level: '', majorCategory: '' };
        void this.ensureStudentAnalyticsLoaded(e.target.value);
      },
      'sr-termId': () => {
        this.state.studentAnalytics.termId = e.target.value;
        this.renderer.render('student-results');
      },
      'sr-level': () => {
        this.state.studentAnalytics.level = e.target.value;
        this.renderer.render('student-results');
      },
      'sr-major': () => {
        this.state.studentAnalytics.majorCategory = e.target.value;
        this.renderer.render('student-results');
      },
      'overview-examId': () => {
        this.state.examOverviewId = e.target.value;
        this.saveUiPrefs();
        void this.ensureExamOverviewAnalyticsLoaded(e.target.value);
      },
      'exams-filter-classId': () => {
        this.state.examsListFilters.classId = e.target.value;
        this.saveUiPrefs();
        this.renderer.render('exams');
      },
      'exams-filter-level': () => {
        this.state.examsListFilters.level = e.target.value;
        this.saveUiPrefs();
        this.renderer.render('exams');
      },
      'exams-filter-examType': () => {
        this.state.examsListFilters.examType = e.target.value;
        this.saveUiPrefs();
        this.renderer.render('exams');
      },
      'overview-filter-classId': () => {
        this.state.examOverviewFilters.classId = e.target.value;
        this.rememberSharedClass(e.target.value);
        this.applyExamOverviewFilterChange();
      },
      'overview-filter-level': () => {
        this.state.examOverviewFilters.level = e.target.value;
        this.applyExamOverviewFilterChange();
      },
      'exam-setup-classId': () => {
        this.state.examSetup.classId = e.target.value;
        this.state.examSetup.templateId = '';
        this.state.examSetup.cqDraftAnswers = {};
        this.state.examSetup.cqBulkDraft = '';
        this.renderer.render('exams');
      },
      'library-level': () => {
        this.state.library.level = e.target.value;
        this.renderer.render('exams');
      },
      'library-type': () => {
        this.state.library.assessmentType = e.target.value;
        this.renderer.render('exams');
      },
      'library-active': () => {
        this.state.library.active = e.target.value;
        this.renderer.render('exams');
      },
      'assign-classId': () => {
        this.state.library.assignClassId = e.target.value;
        this.state.library.assignVersionId = '';
        this.renderer.render('exams');
      },
      'assign-versionId': () => {
        this.state.library.assignVersionId = e.target.value;
        this.renderer.render('exams');
      },
      'transfer-destClassId': () => {
        if (!this.state.transfer) return;
        this.state.transfer.destClassId = e.target.value;
        this.renderer.render('classes');
      },
      'transfer-startDate': () => {
        if (!this.state.transfer) return;
        this.state.transfer.startDate = e.target.value;
        this.renderer.render('classes');
      },
    };

    if (filters[filter]) filters[filter]();
  }

  handleSubmit(e) {
    e.preventDefault();
    const form = e.target;

    if (form.dataset.form === 'add-term') {
      void this.submitAddTerm(form);
      return;
    }

    if (form.dataset.form === 'add-class') {
      void this.submitAddClass(form);
      return;
    }

    if (form.dataset.form === 'add-student') {
      void this.submitAddStudent(form);
      return;
    }

    if (form.dataset.form === 'transfer-student') {
      void this.submitTransferStudent(form);
      return;
    }

    if (form.dataset.form === 'add-assessment') {
      void this.submitAddAssessment(form);
      return;
    }

    if (form.dataset.form === 'save-draft-questions') {
      void this.submitSaveDraftQuestions(form);
      return;
    }

    if (form.dataset.form === 'create-blank-questions') {
      void this.submitCreateBlankQuestions(form);
      return;
    }

    if (form.dataset.form === 'assign-exam-instance') {
      void this.submitAssignExamInstance(form);
      return;
    }

    if (form.dataset.form === 'exam-setup') {
      void this.saveExamSetup(form);
      return;
    }

    if (form.dataset.form === 'template-setup') {
      void this.saveTemplateSetup(form);
    }
  }

  handleKeydown(e) {
    if (e.key === 'Escape') {
      const confirmModal = document.getElementById('confirm-modal');
      if (confirmModal && !confirmModal.classList.contains('hidden')) return;
      const srModal = document.getElementById('sr-display-modal');
      if (srModal && !srModal.classList.contains('hidden')) {
        this.closeSrDisplayModal();
        return;
      }
      const helpModal = document.getElementById('help-modal');
      if (helpModal && !helpModal.classList.contains('hidden')) {
        this.closeHelp();
      }
    }
  }

  togglePageGuide(view) {
    if (!view) return;
    const open = !isPageGuideOpen(view);
    setPageGuideOpen(view, open);
    const panel = document.querySelector(`[data-page-guide="${view}"]`);
    if (!panel) return;
    const body = panel.querySelector('.page-guide__body');
    const btn = panel.querySelector('[data-action="toggle-page-guide"]');
    const icon = panel.querySelector('.page-guide__toggle-icon');
    if (body) body.classList.toggle('page-guide__body--collapsed', !open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (icon) icon.textContent = open ? '▼' : '▶';
  }

  toggleChecklist() {
    const data = this.repository.loadAll();
    const open = !isChecklistOpen(data);
    setChecklistOpen(open);
    const panel = document.querySelector('.onboard-checklist');
    if (!panel) return;
    const body = panel.querySelector('.onboard-checklist__body');
    const btn = panel.querySelector('[data-action="toggle-checklist"]');
    const icon = panel.querySelector('.page-guide__toggle-icon');
    if (body) body.classList.toggle('page-guide__body--collapsed', !open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (icon) icon.textContent = open ? '▼' : '▶';
  }

  openHelp(scrollToSection) {
    this.closeSrDisplayModal();
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('help-modal');
    const content = document.getElementById('help-modal-content');
    if (!overlay || !modal || !content) return;

    content.innerHTML = renderHelpModalShell();
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    if (this._helpOverlayHandler) {
      overlay.removeEventListener('click', this._helpOverlayHandler);
    }
    this._helpOverlayHandler = (ev) => {
      if (ev.target === overlay) this.closeHelp();
    };
    overlay.addEventListener('click', this._helpOverlayHandler);
    requestAnimationFrame(() => {
      modal.querySelector('[data-action="close-help"]')?.focus();
    });

    if (scrollToSection) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`help-${scrollToSection}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  closeHelp() {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('help-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (overlay && document.getElementById('sr-display-modal')?.classList.contains('hidden')) {
      overlay.classList.add('hidden');
    }
    if (this._helpOverlayHandler && overlay) {
      overlay.removeEventListener('click', this._helpOverlayHandler);
      this._helpOverlayHandler = null;
    }
  }

  openSrDisplayModal() {
    if (this.state.currentView !== 'student-results') return;
    this.closeHelp();
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('sr-display-modal');
    const content = document.getElementById('sr-display-modal-content');
    if (!overlay || !modal || !content) return;

    this.state.srDisplayModalOpen = true;
    this.syncSrDisplayModal();
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    if (this._srDisplayOverlayHandler) {
      overlay.removeEventListener('click', this._srDisplayOverlayHandler);
    }
    this._srDisplayOverlayHandler = (ev) => {
      if (ev.target === overlay) this.closeSrDisplayModal();
    };
    overlay.addEventListener('click', this._srDisplayOverlayHandler);
  }

  closeSrDisplayModal() {
    this.state.srDisplayModalOpen = false;
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('sr-display-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (overlay && document.getElementById('help-modal')?.classList.contains('hidden')) {
      overlay.classList.add('hidden');
    }
    if (this._srDisplayOverlayHandler && overlay) {
      overlay.removeEventListener('click', this._srDisplayOverlayHandler);
      this._srDisplayOverlayHandler = null;
    }
  }

  syncSrDisplayModal() {
    if (!this.state.srDisplayModalOpen) return;
    const content = document.getElementById('sr-display-modal-content');
    if (!content) return;
    content.innerHTML = this.renderer.renderStudentResultDisplayPanel(
      normalizeStudentResultDisplay(this.state.studentResultDisplay)
    );
  }

  flushTeacherCommentSave() {
    this._commentDirtyResultId = null;
    if (this._commentSaveTimer) {
      clearTimeout(this._commentSaveTimer);
      this._commentSaveTimer = null;
    }
  }

  onTeacherCommentInput(textarea) {
    return;
  }

  updateCommentSaveStatus(state) {
    const el = document.getElementById('teacher-comment-status');
    if (!el) return;
    if (state === 'pending') {
      el.textContent = '저장 중';
      el.className = 'teacher-comment__save-status teacher-comment__save-status--pending';
    } else if (state === 'saved') {
      el.textContent = '저장됨';
      el.className = 'teacher-comment__save-status teacher-comment__save-status--saved';
    } else if (state === 'error') {
      el.textContent = '저장 실패';
      el.className = 'teacher-comment__save-status teacher-comment__save-status--error';
    } else {
      el.textContent = '';
      el.className = 'teacher-comment__save-status';
    }
  }

  refreshTeacherCommentPrintBlock(resultId, text) {
    const display = normalizeStudentResultDisplay(this.state.studentResultDisplay);
    if (!display.showTeacherComment) return;
    const wrap = document.querySelector('.teacher-comment-wrap');
    if (!wrap) return;
    const trimmed = String(text ?? '').trim();
    let printEl = wrap.querySelector('.teacher-comment--print');
    if (!trimmed) {
      printEl?.remove();
      return;
    }
    const escaped = SAT.escapeHtml(trimmed).replace(/\n/g, '<br>');
    if (!printEl) {
      printEl = document.createElement('div');
      printEl.className = 'teacher-comment teacher-comment--print';
      wrap.appendChild(printEl);
    }
    printEl.innerHTML = `<h3>선생님 코멘트</h3><div class="teacher-comment__text">${escaped}</div>`;
  }

  setStudentResultView(view) {
    const next = normalizeStudentResultView(view);
    if (this.state.currentView === 'exam-overview') {
      this.state.examOverviewView = next;
      this.renderer.render('exam-overview');
      return;
    }
    this.state.studentResultView = next;
    this.state.studentResultDisplay = getStudentResultDisplayPreset(next);
    this.renderer.render('student-results');
  }

  toggleStudentResultDisplay(key) {
    if (!key) return;
    const display = normalizeStudentResultDisplay(this.state.studentResultDisplay);
    if (!Object.prototype.hasOwnProperty.call(display, key)) return;
    display[key] = !display[key];
    this.state.studentResultDisplay = display;
    this.renderer.render('student-results');
  }

  setStudentResultDisplayAll(on) {
    const display = getStudentResultDisplayPreset(this.state.studentResultView);
    Object.keys(display).forEach((k) => {
      display[k] = !!on;
    });
    this.state.studentResultDisplay = display;
    this.renderer.render('student-results');
  }

  setExamOverviewMode(mode) {
    this.state.examOverviewMode = mode;
    this.renderer.render('exam-overview');
  }

  applyExamOverviewFilterChange() {
    const classId = this.state.examOverviewFilters.classId;
    const instances = classId && this.assessmentStore
      ? this.assessmentStore.examInstancesForClass(classId)
      : [];
    if (!instances.some((row) => row.id === this.state.examOverviewId)) {
      this.state.examOverviewId = instances[0]?.id || null;
    }
    this.saveUiPrefs();
    void this.ensureExamOverviewAnalyticsLoaded(this.state.examOverviewId);
  }

  getSelectedExamInstance() {
    const instanceId = this.state.answerEntry.examId;
    if (!instanceId || !this.assessmentStore) return null;
    const raw = this.assessmentStore.examInstances.find((row) => row.id === instanceId);
    if (!raw) return null;
    return SAT.composeExamInstanceView(
      raw,
      this.assessmentStore.versions,
      this.assessmentStore.assessments
    );
  }

  getAnswerEntryQuestions() {
    const instance = this.getSelectedExamInstance();
    if (!instance?.assessmentVersionId || !this.assessmentStore) return [];
    return this.assessmentStore.questionsFor(instance.assessmentVersionId);
  }

  getAnswerEntryChoiceCount() {
    const instance = this.getSelectedExamInstance();
    return SAT.resolveChoiceCount({
      version: this.assessmentStore?.getVersion?.(instance?.assessmentVersionId) || { choiceCount: instance?.choiceCount },
      assessment: this.assessmentStore?.getAssessment?.(instance?.assessmentId),
      questions: this.getAnswerEntryQuestions(),
    });
  }

  getCurrentAnswerQuestion() {
    return this.getAnswerEntryQuestions().find((q) => q.number === this.state.currentQuestion) || null;
  }

  getAnswerEntryStudents() {
    const instance = this.getSelectedExamInstance();
    if (!instance) return [];
    const eligible = SAT.eligibleStudentsForExamInstance(
      this.store.getViewStudents(),
      this.store.enrollments,
      instance
    );
    const overrideIds = new Set(this.state.answerEntry.overrideStudentIds || []);
    const extras = this.store.getViewStudents().filter((s) => overrideIds.has(s.id));
    const seen = new Set();
    return [...eligible, ...extras].filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }

  getAnswerEntryOverrideCandidates() {
    const rosterIds = new Set(this.getAnswerEntryStudents().map((s) => s.id));
    return this.store.getViewStudents().filter((s) => !rosterIds.has(s.id));
  }

  hasNextAnswerStudent() {
    return !!this.getNextStudentId();
  }

  getNextStudentId() {
    const { studentId } = this.state.answerEntry;
    const students = this.getAnswerEntryStudents();
    const idx = students.findIndex((s) => s.id === studentId);
    if (idx < 0 || idx >= students.length - 1) return null;
    return students[idx + 1].id;
  }

  isAnswerShortcutBlocked(target) {
    if (!target) return true;
    if (target.matches('select')) return true;
    if (target.matches('#answer-text-input, #bulk-answer-input, select, textarea, input')) return true;
    const modal = document.getElementById('confirm-modal');
    if (modal && !modal.classList.contains('hidden')) return true;
    return false;
  }

  initAnswerEntryPanel() {
    const panel = document.getElementById('answer-capture-panel');
    if (!panel) return;

    if (this._answerPanelKeyHandler) {
      panel.removeEventListener('keydown', this._answerPanelKeyHandler);
    }
    this._answerPanelKeyHandler = (e) => this.handleAnswerPanelKeydown(e);
    panel.addEventListener('keydown', this._answerPanelKeyHandler);

    const textInput = document.getElementById('answer-text-input');
    if (textInput) {
      if (this._answerTextKeyHandler) {
        textInput.removeEventListener('keydown', this._answerTextKeyHandler);
      }
      this._answerTextKeyHandler = (e) => this.handleAnswerTextKeydown(e);
      textInput.addEventListener('keydown', this._answerTextKeyHandler);
    }

    if (this.state.answerEntryMode === 'fast') {
      requestAnimationFrame(() => this.focusAnswerPanel());
    }
  }

  focusAnswerPanel() {
    const panel = document.getElementById('answer-capture-panel');
    if (panel && this.state.answerEntryMode === 'fast') {
      panel.focus({ preventScroll: true });
    }
  }

  handleAnswerPanelKeydown(e) {
    if (this.state.currentView !== 'answer-entry' || this.state.answerEntryMode !== 'fast') return;
    if (this.isAnswerShortcutBlocked(e.target)) return;

    const questions = this.getAnswerEntryQuestions();
    if (!questions.length) return;
    const question = this.getCurrentAnswerQuestion();
    const grading = SAT.normalizeGradingType(question?.gradingType);
    if (grading === SAT.GRADING_TYPE_MANUAL_BINARY) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.moveQuestion(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.moveQuestion(-1);
      }
      return;
    }

    const choiceCount = this.getAnswerEntryChoiceCount();
    if (grading === SAT.GRADING_TYPE_CHOICE && SAT.isValidChoiceAnswer(e.key, choiceCount)) {
      e.preventDefault();
      this.setAnswer(e.key, true);
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.moveQuestion(1);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.moveQuestion(-1);
    }
  }

  handleAnswerTextKeydown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = e.target.value.trim();
    if (!value) return;
    const question = this.getCurrentAnswerQuestion();
    if (SAT.normalizeGradingType(question?.gradingType) === SAT.GRADING_TYPE_MANUAL_BINARY) return;
    const normalized = /^\d+$/.test(value) ? String(parseInt(value, 10)) : value;
    const choiceCount = this.getAnswerEntryChoiceCount();
    if (!SAT.isValidChoiceAnswer(normalized, choiceCount)) return;
    this.setAnswer(normalized, true);
  }

  toggleTeacherCommentPanel() {
    this.state.teacherCommentOpen = !this.state.teacherCommentOpen;
    const comment = this.state.teacherCommentDraft
      || document.getElementById('result-teacher-comment')?.value
      || '';
    const open = this.state.teacherCommentOpen;
    const panel = document.getElementById('answer-comment-panel');
    const btn = document.getElementById('btn-toggle-teacher-comment');
    if (panel) panel.hidden = !open;
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = SAT.teacherCommentToggleLabel({
        hasComment: SAT.hasTeacherCommentText(comment),
        open,
      });
    }
    if (open) document.getElementById('result-teacher-comment')?.focus();
  }

  setAnswerEntryMode(mode) {
    this.state.answerEntryMode = mode;
    const bulk = document.getElementById('bulk-answer-input');
    if (bulk) this.state.bulkInputDraft = bulk.value;
    const fastPanel = document.getElementById('answer-fast-panel');
    const bulkPanel = document.getElementById('answer-bulk-panel');
    document.querySelectorAll('.answer-mode-tab').forEach((tab) => {
      tab.classList.toggle('answer-mode-tab--active', tab.dataset.action === `answer-mode-${mode}`);
    });
    if (fastPanel) fastPanel.classList.toggle('hidden', mode !== 'fast');
    if (bulkPanel) bulkPanel.classList.toggle('hidden', mode !== 'bulk');
    if (mode === 'fast') this.focusAnswerPanel();
  }

  patchAnswerEntryUI() {
    const card = document.getElementById('answer-entry-card');
    if (!card) {
      this.renderer.render('answer-entry');
      return;
    }

    const questions = this.getAnswerEntryQuestions();
    const answers = this.getCurrentAnswers();
    const currentQ = this.state.currentQuestion;
    const question = questions.find((x) => x.number === currentQ);
    const instance = this.getSelectedExamInstance();

    const numEl = document.getElementById('answer-current-num');
    if (numEl) numEl.textContent = String(currentQ);

    const metaEl = document.getElementById('answer-current-meta');
    if (metaEl && question) {
      metaEl.textContent = SAT.cloudQuestionMetaLine(question);
    }

    const grid = document.getElementById('answer-grid');
    if (grid) {
      grid.innerHTML = this.renderer.renderAnswerGridHtml(
        questions,
        answers,
        currentQ,
        this.state.answerIssueQuestions || []
      );
    }

    const opts = document.getElementById('answer-options');
    if (opts) {
      opts.classList.remove('hidden');
      opts.innerHTML = this.renderer.renderCloudAnswerOptionsHtml(
        question,
        answers,
        instance?.assessmentType,
        { disabled: !this.canWriteSelectedResult(), choiceCount: instance?.choiceCount }
      );
    }

    const grading = SAT.normalizeGradingType(question?.gradingType);
    const directWrap = document.getElementById('answer-direct-wrap');
    if (directWrap) {
      directWrap.classList.toggle(
        'answer-direct-wrap--collapsed',
        grading !== SAT.GRADING_TYPE_CHOICE || instance?.assessmentType === SAT.ASSESSMENT_TYPE_CQ
      );
    }

    const canWrite = this.canWriteSelectedResult();
    const textInput = document.getElementById('answer-text-input');
    if (textInput && question) {
      textInput.value = SAT.cloudAnswerValue(answers, question);
      textInput.disabled = !canWrite;
    }

    const prevBtn = document.getElementById('btn-prev-question');
    const nextBtn = document.getElementById('btn-next-question');
    if (prevBtn) prevBtn.disabled = currentQ <= 1;
    if (nextBtn) nextBtn.disabled = currentQ >= questions.length;

    const nextStudentBtn = document.getElementById('btn-save-next-student');
    if (nextStudentBtn) {
      nextStudentBtn.disabled = !canWrite || !this.hasNextAnswerStudent();
      nextStudentBtn.title = !canWrite
        ? SAT.RESULT_READONLY_HINT
        : (this.hasNextAnswerStudent() ? '' : '마지막 학생입니다.');
    }

    const panel = document.getElementById('answer-capture-panel');
    if (panel) panel.classList.add('answer-panel--pulse');
    requestAnimationFrame(() => {
      panel?.classList.remove('answer-panel--pulse');
    });
  }

  goToQuestion(num) {
    const questions = this.getAnswerEntryQuestions();
    if (num < 1 || num > questions.length) return;
    this.syncCurrentTextInput();
    if (this.state.answerEntryMode === 'bulk') {
      this.setAnswerEntryMode('fast');
    }
    this.state.currentQuestion = num;
    this.patchAnswerEntryUI();
    requestAnimationFrame(() => {
      document.querySelector(`.answer-grid-item[data-goto="${num}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      this.focusAnswerPanel();
    });
  }

  focusQuestionIssues(questionNumbers) {
    const nums = (questionNumbers || []).filter((n) => n >= 1);
    if (!nums.length) return;
    this.state.answerIssueQuestions = [...new Set(nums)];
    this.goToQuestion(nums[0]);
  }

  syncCurrentTextInput() {
    const textInput = document.getElementById('answer-text-input');
    if (!textInput || !textInput.value.trim()) return;
    const questions = this.getAnswerEntryQuestions();
    const q = questions.find((x) => x.number === this.state.currentQuestion);
    if (!q) return;
    const answers = this.getCurrentAnswers();
    answers[q.id] = textInput.value.trim();
    this.state.currentAnswers = answers;
  }

  parseQuestionsFromForm(form, upTo) {
    const fd = new FormData(form);
    const questions = [];
    for (let i = 1; i <= upTo; i += 1) {
      questions.push({
        number: i,
        id: fd.get(`q_${i}_id`) || undefined,
        correctAnswer: String(fd.get(`q_${i}_answer`) ?? '').trim(),
        points: fd.get(`q_${i}_points`),
        majorCategory: normalizeCategory(fd.get(`q_${i}_major`)),
        middleCategory: normalizeCategory(fd.get(`q_${i}_middle`)),
        note: String(fd.get(`q_${i}_note`) ?? '').trim(),
      });
    }
    return questions;
  }

  isTemplateSetupForm(form) {
    return form?.dataset?.form === 'template-setup';
  }

  rerenderQuestionRows(form, questions, count) {
    const isTemplate = this.isTemplateSetupForm(form);
    const container = isTemplate
      ? document.getElementById('template-questions-container')
      : document.getElementById('questions-container');
    if (!container) return;
    const allQuestions = this.repository.loadAll().questions;
    container.innerHTML = isTemplate
      ? this.renderer.renderTemplateQuestionRows(questions, count, allQuestions)
      : this.renderer.renderQuestionRows(questions, count, allQuestions);
  }

  restoreQuestionRowsAfterCancel(form, originalCount, persistedQuestions) {
    const visibleCount = form.querySelectorAll('.question-row').length;
    const fromForm = this.parseQuestionsFromForm(form, visibleCount);
    const byNumber = new Map((persistedQuestions || []).map((q) => [Number(q.number), { ...q }]));
    fromForm.forEach((q) => {
      if (q.number <= originalCount) {
        byNumber.set(q.number, { ...byNumber.get(q.number), ...q, number: q.number });
      }
    });
    const merged = [];
    for (let i = 1; i <= originalCount; i += 1) {
      merged.push(
        byNumber.get(i) || {
          number: i,
          correctAnswer: '',
          points: 1,
          majorCategory: '',
          middleCategory: '',
          note: '',
        }
      );
    }
    this.rerenderQuestionRows(form, resizeQuestions(merged, originalCount), originalCount);
  }

  async confirmQuestionCountReductionBeforeSave(form, { originalCount, isNewRecord, persistedQuestions }) {
    const fd = new FormData(form);
    const newCount = Number(fd.get('questionCount'));
    if (!needsQuestionCountReductionConfirm(originalCount, newCount, isNewRecord)) {
      return true;
    }

    const domCount = form.querySelectorAll('.question-row').length;
    const parseUpTo = Math.max(originalCount, domCount);
    const formQuestions = this.parseQuestionsFromForm(form, parseUpTo);
    const removedQuestions = mergeQuestionsForReductionCheck(
      persistedQuestions,
      formQuestions,
      newCount,
      originalCount
    );
    const message = buildQuestionCountReductionMessage(originalCount, newCount, removedQuestions);
    const hasData = removedQuestions.some((q) => hasMeaningfulQuestionData(q));
    const ok = await confirmDialog(message, {
      title: '문항 수 줄이기',
      danger: hasData,
      confirmLabel: '계속',
    });
    if (!ok) {
      const countInput = form.querySelector('[name="questionCount"]');
      if (countInput) countInput.value = String(originalCount);
      this.restoreQuestionRowsAfterCancel(form, originalCount, persistedQuestions);
      return false;
    }
    return true;
  }

  handleQuestionCountChange(input) {
    const form = input.closest('form');
    if (!form) return;
    const newCount = Math.max(1, Number(input.value) || 1);
    const oldCount = form.querySelectorAll('.question-row').length;
    if (newCount === oldCount) return;

    const existing = this.parseQuestionsFromForm(form, oldCount);
    const resized = resizeQuestions(existing, newCount);
    this.rerenderQuestionRows(form, resized, newCount);
    input.value = String(newCount);

    const panel = form.querySelector('[data-question-range-patch]');
    if (panel) {
      const rangeEnd = panel.querySelector('[name="range_end"]');
      const rangeStart = panel.querySelector('[name="range_start"]');
      if (rangeEnd) {
        rangeEnd.max = String(newCount);
        if (Number(rangeEnd.value) > newCount) rangeEnd.value = String(newCount);
      }
      if (rangeStart) {
        rangeStart.max = String(newCount);
        if (Number(rangeStart.value) > newCount) rangeStart.value = String(newCount);
      }
    }
  }

  readQuestionRangePatchInput(form) {
    const fd = new FormData(form);
    return {
      startNumber: fd.get('range_start'),
      endNumber: fd.get('range_end'),
      applyMajorCategory: fd.get('range_apply_major') === 'on',
      applyMiddleCategory: fd.get('range_apply_middle') === 'on',
      applyPoints: fd.get('range_apply_points') === 'on',
      applyNote: fd.get('range_apply_note') === 'on',
      majorCategory: fd.get('range_major'),
      middleCategory: fd.get('range_middle'),
      points: fd.get('range_points'),
      note: fd.get('range_note'),
    };
  }

  async applyQuestionRangePatch() {
    const form = document.querySelector('[data-form="exam-setup"], [data-form="template-setup"]');
    if (!form) return;

    const questionCount = Number(new FormData(form).get('questionCount'));
    const prepared = prepareQuestionRangePatch(this.readQuestionRangePatchInput(form), questionCount);
    if (!prepared.valid) {
      showToast(prepared.error, 'error');
      return;
    }

    const ok = await confirmDialog(prepared.summary, {
      title: '범위 일괄 적용',
      confirmLabel: '적용',
    });
    if (!ok) return;

    const currentCount = form.querySelectorAll('.question-row').length;
    const questions = this.parseQuestionsFromForm(form, currentCount);
    const patched = applyQuestionRangePatch(questions, {
      startNumber: prepared.startNumber,
      endNumber: prepared.endNumber,
      fields: prepared.fields,
    });
    this.rerenderQuestionRows(form, patched, questionCount);
    showToast(`${prepared.affectedCount}개 문항에 일괄 적용했습니다.`);
  }

  handleRangePatchPreset(preset) {
    const form = document.querySelector('[data-form="exam-setup"], [data-form="template-setup"]');
    if (!form) return;
    const panel = form.querySelector('[data-question-range-patch]');
    if (!panel) return;

    const questionCount =
      Number(new FormData(form).get('questionCount')) || form.querySelectorAll('.question-row').length;
    const start = panel.querySelector('[name="range_start"]');
    const end = panel.querySelector('[name="range_end"]');
    const applyMajor = panel.querySelector('[name="range_apply_major"]');
    const applyMiddle = panel.querySelector('[name="range_apply_middle"]');
    const applyPoints = panel.querySelector('[name="range_apply_points"]');
    const applyNote = panel.querySelector('[name="range_apply_note"]');

    if (preset === 'full-range') {
      if (start) start.value = '1';
      if (end) end.value = String(questionCount);
      return;
    }
    if (preset === 'major-only') {
      if (applyMajor) applyMajor.checked = true;
      if (applyMiddle) applyMiddle.checked = false;
      if (applyPoints) applyPoints.checked = false;
      if (applyNote) applyNote.checked = false;
      return;
    }
    if (preset === 'major-middle') {
      if (applyMajor) applyMajor.checked = true;
      if (applyMiddle) applyMiddle.checked = true;
      if (applyPoints) applyPoints.checked = false;
      if (applyNote) applyNote.checked = false;
    }
  }

  refreshMiddleDatalist(majorInput) {
    const num = majorInput.dataset.questionMajor;
    const list = document.getElementById(`middle-list-${num}`);
    if (!list) return;
    const allQuestions = this.repository.loadAll().questions;
    const suggestions = collectMiddleSuggestions(allQuestions, majorInput.value);
    list.innerHTML = suggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('');
  }

  copyPrevCategories(num) {
    if (num <= 1) return;
    const form = document.querySelector('[data-form="exam-setup"]');
    if (!form) return;
    const prevMajor = form.querySelector(`[name="q_${num - 1}_major"]`);
    const prevMiddle = form.querySelector(`[name="q_${num - 1}_middle"]`);
    const majorInput = form.querySelector(`[name="q_${num}_major"]`);
    const middleInput = form.querySelector(`[name="q_${num}_middle"]`);
    if (majorInput && prevMajor) majorInput.value = prevMajor.value;
    if (middleInput && prevMiddle) middleInput.value = prevMiddle.value;
    if (majorInput) this.refreshMiddleDatalist(majorInput);
    showToast(`${num - 1}번 문항 분류를 복사했습니다.`);
  }

  async submitAddTerm(form) {
    const submit = form.querySelector('[type="submit"]');
    const fd = new FormData(form);
    const result = await SAT.withMutationGuard(this, 'add-term', async () => {
      if (submit) submit.disabled = true;
      try {
        await this.store.createTerm({
          name: String(fd.get('name') || '').trim(),
          startDate: fd.get('startDate'),
          endDate: fd.get('endDate'),
          isCurrent: false,
        });
        showToast('학기가 추가되었습니다.');
        form.reset();
        this.navigate(this.state.currentView || 'dashboard');
      } catch (err) {
        this.cloudErrorToast(err);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    if (result.skipped) return;
  }

  async setCurrentTerm(id) {
    const result = await SAT.withMutationGuard(this, 'set-current-term', async () => {
      try {
        await this.store.setCurrentTerm(id);
        showToast('현재 학기를 변경했습니다.');
        this.navigate(this.state.currentView || 'dashboard');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async submitAddClass(form) {
    const submit = form.querySelector('[type="submit"]');
    const fd = new FormData(form);
    const result = await SAT.withMutationGuard(this, 'add-class', async () => {
      if (submit) submit.disabled = true;
      try {
        const created = await this.store.createClass({
          name: String(fd.get('name') || '').trim(),
          level: fd.get('level'),
        });
        showToast('반이 추가되었습니다.');
        form.reset();
        if (created?.id) this.state.selectedClassId = created.id;
        this.state.classWorkspace = SAT.classWorkspaceAfterSelectClass
          ? SAT.classWorkspaceAfterSelectClass()
          : { showAddClass: false, showClassManage: false, showAddStudent: false, managingStudentId: null };
        this.navigate('classes');
      } catch (err) {
        this.cloudErrorToast(err);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    if (result.skipped) return;
  }

  async submitAddStudent(form) {
    const submit = form.querySelector('[type="submit"]');
    const fd = new FormData(form);
    const result = await SAT.withMutationGuard(this, 'add-student', async () => {
      if (submit) submit.disabled = true;
      try {
        await this.store.createStudentInClass({
          classId: fd.get('classId'),
          name: String(fd.get('name') || '').trim(),
          englishName: String(fd.get('englishName') || '').trim(),
        });
        showToast('학생이 추가되었습니다.');
        form.reset();
        this.setClassWorkspacePanel({ showAddStudent: false }, { render: false });
        this.navigate('classes');
      } catch (err) {
        this.cloudErrorToast(err);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    if (result.skipped) return;
  }

  async selectAssessment(id) {
    this.state.library.selectedAssessmentId = id;
    const versions = this.assessmentStore.versionsFor(id);
    this.state.library.selectedVersionId = versions[0]?.id || null;
    if (this.state.library.selectedVersionId) {
      try {
        await this.assessmentStore.loadVersionQuestions(this.state.library.selectedVersionId);
      } catch (err) {
        this.cloudErrorToast(err);
      }
    }
    this.renderer.render('exams');
  }

  async selectAssessmentVersion(id) {
    this.state.library.selectedVersionId = id;
    try {
      await this.assessmentStore.loadVersionQuestions(id);
    } catch (err) {
      this.cloudErrorToast(err);
    }
    this.renderer.render('exams');
  }

  async submitAddAssessment(form) {
    const submit = form.querySelector('[type="submit"]');
    const fd = new FormData(form);
    const result = await SAT.withMutationGuard(this, 'add-assessment', async () => {
      if (submit) submit.disabled = true;
      try {
        const created = await this.assessmentStore.createAssessment({
          title: String(fd.get('title') || '').trim(),
          assessmentType: fd.get('assessmentType'),
          level: fd.get('level'),
          lessonStart: fd.get('lessonStart'),
          lessonEnd: fd.get('lessonEnd'),
          applyCqBlueprint: fd.get('applyCqBlueprint') === 'on',
          choiceCount: fd.get('choiceCount'),
        });
        showToast(created?.usedStandardBlueprint
          ? '문제집을 만들었습니다.'
          : SAT.EMPTY_MANUAL_AUTHORING_HINT);
        form.reset();
        if (created?.assessment?.id) {
          this.state.library.selectedAssessmentId = created.assessment.id;
          this.state.library.selectedVersionId = created.version?.id || null;
          if (created.version?.id) {
            await this.assessmentStore.loadVersionQuestions(created.version.id);
          }
        }
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
        this.renderer.render('exams');
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    if (result.skipped) return;
  }

  async createDraftVersion(assessmentId) {
    const result = await SAT.withMutationGuard(this, `create-draft-${assessmentId}`, async () => {
      try {
        const row = await this.assessmentStore.createDraftVersion(assessmentId);
        showToast('초안 버전을 만들었습니다.');
        this.state.library.selectedVersionId = row?.id || null;
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async copyPublishedToDraft(versionId) {
    const result = await SAT.withMutationGuard(this, `copy-version-${versionId}`, async () => {
      try {
        const row = await this.assessmentStore.createDraftFromPublished(versionId);
        showToast('새 초안 버전에 문항을 복사했습니다. 원본은 그대로입니다. 표준 CQ면 정답을 1–4로 바꿔 공개하세요.');
        this.state.library.selectedVersionId = row?.id || null;
        if (row?.id) await this.assessmentStore.loadVersionQuestions(row.id);
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async applyCqBlueprint(versionId) {
    const result = await SAT.withMutationGuard(this, `blueprint-${versionId}`, async () => {
      try {
        await this.assessmentStore.applyCqBlueprint(versionId);
        showToast('표준 문항 구성을 불러왔습니다. 초안에서 수정한 뒤 공개하세요.');
        await this.assessmentStore.loadVersionQuestions(versionId);
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async submitSaveDraftQuestions(form) {
    const versionId = form.dataset.versionId;
    const submit = form.querySelector('[type="submit"]');
    const result = await SAT.withMutationGuard(this, `save-questions-${versionId}`, async () => {
      if (submit) submit.disabled = true;
      try {
        const fd = new FormData(form);
        const existing = this.assessmentStore.questionsFor(versionId);
        const questions = existing.map((q) => {
          const gradingType = fd.get(`q_${q.number}_grading`) || q.gradingType;
          return SAT.normalizeCloudQuestion({
            ...q,
            gradingType,
            correctAnswer: fd.get(`q_${q.number}_answer`),
            points: fd.get(`q_${q.number}_points`),
            majorCategory: fd.get(`q_${q.number}_major`),
            middleCategory: fd.get(`q_${q.number}_middle`),
            note: fd.get(`q_${q.number}_note`),
          }, q.number);
        });
        await this.assessmentStore.saveDraftQuestions(versionId, questions);
        showToast('초안 문항을 저장했습니다.');
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    if (result.skipped) return;
  }

  async publishAssessmentVersion(id) {
    const result = await SAT.withMutationGuard(this, `publish-${id}`, async () => {
      try {
        await this.assessmentStore.publishVersion(id);
        showToast('버전을 공개했습니다.');
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async archiveAssessmentVersion(id) {
    const result = await SAT.withMutationGuard(this, `archive-version-${id}`, async () => {
      try {
        await this.assessmentStore.archiveVersion(id);
        showToast('버전을 보관했습니다.');
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async editAssessmentTitle(id) {
    const row = this.assessmentStore.getAssessment(id);
    if (!row) return;
    const title = prompt('표시 이름 (오탈자/표시명만)', row.title);
    if (title === null) return;
    const result = await SAT.withMutationGuard(this, `edit-assessment-${id}`, async () => {
      try {
        await this.assessmentStore.updateAssessmentTitle(id, title);
        showToast('표시 이름을 수정했습니다.');
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  syncCreateAssessmentGeneratorUi() {
    const form = document.querySelector('[data-form="add-assessment"]');
    if (!form) return;
    const type = form.elements.assessmentType?.value;
    const level = form.elements.level?.value;
    const show = SAT.shouldShowCreateBlueprintOption(type, level);
    const wrap = form.querySelector('[data-create-blueprint-option]');
    const summary = form.querySelector('[data-create-blueprint-summary]');
    const manualHint = form.querySelector('[data-create-manual-hint]');
    if (wrap) wrap.hidden = !show;
    if (summary) {
      summary.hidden = !show;
      summary.textContent = show ? SAT.formatCqBlueprintSummary(level) : '';
    }
    if (manualHint) manualHint.hidden = show;
  }

  async changeDraftChoiceCount(versionId, choiceCount) {
    const result = await SAT.withMutationGuard(this, `choice-count-${versionId}`, async () => {
      try {
        await this.assessmentStore.setDraftChoiceCount(versionId, choiceCount);
        showToast(Number(choiceCount) === 5 ? '5지선다로 바꿨습니다.' : '4지선다로 바꿨습니다.');
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
        this.renderer.render('exams');
      }
    });
    if (result.skipped) return;
  }

  showUnusedAssessmentDeleteReason(id) {
    const row = this.assessmentStore.getAssessment(id);
    if (!row) return;
    const reason = SAT.unusedAssessmentDeleteReason(
      row,
      this.assessmentStore.versionsFor(id),
      this.assessmentStore.examInstances,
      this.resultStore?.results,
    );
    showToast(reason || SAT.UNUSED_ASSESSMENT_DELETE_BLOCKED, 'error');
  }

  async deleteUnusedAssessment(id) {
    const row = this.assessmentStore.getAssessment(id);
    if (!row) return;
    const versions = this.assessmentStore.versionsFor(id);
    const reason = SAT.unusedAssessmentDeleteReason(
      row,
      versions,
      this.assessmentStore.examInstances,
      this.resultStore?.results,
    );
    if (reason) {
      showToast(reason, 'error');
      return;
    }
    const ok = await confirmDialog(SAT.formatUnusedAssessmentDeleteConfirm(row.title), {
      title: '문제집 삭제',
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    const result = await SAT.withMutationGuard(this, `delete-assessment-${id}`, async () => {
      try {
        await this.assessmentStore.deleteUnusedAssessment(id);
        if (this.state.library.selectedAssessmentId === id) {
          this.state.library.selectedAssessmentId = null;
          this.state.library.selectedVersionId = null;
        }
        showToast('문제집을 삭제했습니다.');
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
        this.renderer.render('exams');
      }
    });
    if (result.skipped) return;
  }

  async forceDeleteAssessment(id) {
    const row = this.assessmentStore.getAssessment(id);
    if (!row) return;
    if (!SAT.canShowForceDeleteAssessment(this.assessmentStore.currentProfile())) {
      showToast('강제 삭제는 시스템 관리자만 할 수 있습니다.', 'error');
      return;
    }
    const ok = await typedConfirmDialog(SAT.formatForceDeleteConfirm(row.title), {
      title: '강제 삭제',
      confirmLabel: '강제 삭제',
      requiredText: row.title,
      promptLabel: '문제집 이름 입력',
      danger: true,
    });
    if (!ok) return;
    const result = await SAT.withMutationGuard(this, `force-delete-assessment-${id}`, async () => {
      try {
        const summary = await this.assessmentStore.forceDeleteAssessment(id);
        if (this.state.library.selectedAssessmentId === id) {
          this.state.library.selectedAssessmentId = null;
          this.state.library.selectedVersionId = null;
        }
        if (this.resultStore?.refresh) {
          await this.resultStore.refresh();
        }
        showToast(SAT.formatForceDeleteSuccessToast(summary));
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
        this.renderer.render('exams');
      }
    });
    if (result.skipped) return;
  }

  async setAssessmentActive(id, active) {
    const result = await SAT.withMutationGuard(this, `assessment-active-${id}`, async () => {
      try {
        await this.assessmentStore.setAssessmentActive(id, active);
        showToast(active ? '문제집을 다시 표시합니다.' : '문제집을 비활성으로 두었습니다.');
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async submitAssignExamInstance(form) {
    const submit = form.querySelector('[type="submit"]');
    const fd = new FormData(form);
    const classId = fd.get('classId');
    const assessmentVersionId = fd.get('assessmentVersionId');
    const duplicates = SAT.findDuplicateAssignments(
      this.assessmentStore.examInstances,
      classId,
      assessmentVersionId
    );
    if (duplicates.length) {
      const ok = await confirmDialog(
        '이 버전은 이 반에 이미 배정되어 있습니다.\n재시험으로 다시 배정하시겠습니까?',
        { title: '재시험 배정', confirmLabel: '다시 배정' }
      );
      if (!ok) return;
    }
    const result = await SAT.withMutationGuard(this, 'assign-exam', async () => {
      if (submit) submit.disabled = true;
      try {
        await this.assessmentStore.assignToClass({
          classId,
          assessmentVersionId,
          administeredDate: fd.get('administeredDate'),
          classes: this.store.classes,
        });
        showToast('시험을 반에 배정했습니다.');
        this.state.library.assignClassId = classId;
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    if (result.skipped) return;
  }

  async editExamInstanceDate(id) {
    const row = this.assessmentStore.examInstances.find((x) => x.id === id);
    if (!row) return;
    const date = prompt('실시일 (YYYY-MM-DD)', row.administeredDate);
    if (date === null) return;
    const result = await SAT.withMutationGuard(this, `instance-date-${id}`, async () => {
      try {
        await this.assessmentStore.updateInstanceDate(id, date);
        showToast('실시일을 수정했습니다.');
        this.renderer.render(this.state.currentView || 'exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async deleteExamInstance(id) {
    const ok = await confirmDialog(
      '이 배정을 삭제하고 다시 만들 수 있습니다. 학생 답안은 아직 연결되지 않았습니다. 계속하시겠습니까?',
      { title: '배정 삭제', danger: true, confirmLabel: '삭제' }
    );
    if (!ok) return;
    const result = await SAT.withMutationGuard(this, `delete-instance-${id}`, async () => {
      try {
        await this.assessmentStore.deleteInstance(id);
        showToast('배정을 삭제했습니다.');
        this.renderer.render(this.state.currentView || 'exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async editTerm(id) {
    const term = this.store.terms.find((t) => t.id === id);
    if (!term) return;
    const name = prompt('학기 이름', term.name);
    if (name === null) return;
    const startDate = prompt('시작일 (YYYY-MM-DD)', term.startDate || '');
    if (startDate === null) return;
    const endDate = prompt('종료일 (YYYY-MM-DD)', term.endDate || '');
    if (endDate === null) return;
    const result = await SAT.withMutationGuard(this, `edit-term-${id}`, async () => {
      try {
        await this.store.updateTerm(id, {
          name: String(name).trim(),
          startDate,
          endDate,
        });
        showToast('학기가 수정되었습니다.');
        this.navigate(this.state.currentView || 'dashboard');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  classWorkspaceState() {
    return SAT.normalizeClassWorkspace
      ? SAT.normalizeClassWorkspace(this.state.classWorkspace)
      : { showAddClass: false, showClassManage: false, showAddStudent: false, managingStudentId: null };
  }

  setClassWorkspacePanel(patch, { render = true } = {}) {
    this.state.classWorkspace = SAT.normalizeClassWorkspace
      ? SAT.normalizeClassWorkspace({ ...this.classWorkspaceState(), ...patch })
      : { ...this.classWorkspaceState(), ...patch };
    if (render && this.state.currentView === 'classes') this.renderer.render('classes');
  }

  toggleClassWorkspacePanel(key) {
    const current = this.classWorkspaceState();
    this.setClassWorkspacePanel({ [key]: !current[key] });
  }

  toggleStudentManage(studentId) {
    this.setClassWorkspacePanel({
      managingStudentId: SAT.toggleStudentManageId
        ? SAT.toggleStudentManageId(this.state.classWorkspace, studentId)
        : (this.state.classWorkspace?.managingStudentId === studentId ? null : studentId),
    });
  }

  selectClass(id) {
    const changed = this.state.selectedClassId !== id;
    this.state.selectedClassId = id;
    this.state.library.assignClassId = id;
    if (changed) {
      this.state.classWorkspace = SAT.classWorkspaceAfterSelectClass
        ? SAT.classWorkspaceAfterSelectClass()
        : { showAddClass: false, showClassManage: false, showAddStudent: false, managingStudentId: null };
    }
    this.renderer.render('classes');
  }

  async editClass(id) {
    const cls = this.store.getClass(id);
    if (!cls) return;
    const name = prompt('반 이름', cls.name);
    if (name === null) return;
    const result = await SAT.withMutationGuard(this, `edit-class-${id}`, async () => {
      try {
        await this.store.updateClassName(id, String(name).trim());
        showToast('반이 수정되었습니다.');
        this.navigate('classes');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async archiveClass(id) {
    const cls = this.store.getClass(id);
    if (!cls) return;
    const result = await SAT.withMutationGuard(this, `archive-class-${id}`, async () => {
      try {
        await this.store.archiveClass(id, !cls.archived);
        showToast(cls.archived ? '반을 다시 표시했습니다.' : '반을 보관했습니다.');
        this.navigate('classes');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async deleteClass(id) {
    const cls = this.store.getClass(id);
    if (!cls) return;
    const ok = await confirmDialog(
      `"${cls.name}" 반을 삭제합니다. 등록 기록이 있는 반은 삭제할 수 없고 보관만 가능합니다. 계속하시겠습니까?`,
      { title: '반 삭제', danger: true, confirmLabel: '삭제' }
    );
    if (!ok) return;
    const result = await SAT.withMutationGuard(this, `delete-class-${id}`, async () => {
      try {
        await this.store.deleteClass(id);
        showToast('반이 삭제되었습니다.');
        if (this.state.selectedClassId === id) this.state.selectedClassId = null;
        this.navigate('classes');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async editStudent(id) {
    const student = this.store.getStudent(id);
    if (!student) return;
    const name = prompt('학생 이름', student.name);
    if (name === null) return;
    const englishName = prompt('영어 이름', student.englishName || '');
    if (englishName === null) return;
    const result = await SAT.withMutationGuard(this, `edit-student-${id}`, async () => {
      try {
        await this.store.updateStudentProfile(id, {
          name: String(name).trim(),
          englishName: String(englishName).trim(),
        });
        showToast('학생 정보가 수정되었습니다.');
        this.navigate('classes');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async archiveStudent(id) {
    const result = await SAT.withMutationGuard(this, `archive-student-${id}`, async () => {
      try {
        await this.store.setStudentActive(id, false);
        showToast('학생을 비활성화했습니다.');
        this.navigate('classes');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async activateStudent(id) {
    const result = await SAT.withMutationGuard(this, `activate-student-${id}`, async () => {
      try {
        await this.store.setStudentActive(id, true);
        showToast('학생을 활성화했습니다.');
        this.navigate('classes');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async openTransferStudent(id) {
    if (!this.isCloudAdmin()) return;
    const student = this.store.getStudent(id);
    if (!student) return;
    let profiles = [];
    try {
      profiles = await this.store.listProfiles();
    } catch (err) {
      this.cloudErrorToast(err);
      return;
    }
    this.state.transfer = {
      studentId: id,
      destClassId: '',
      startDate: SAT.addIsoDays(SAT.isoDateLocal(), 1),
      profiles,
    };
    this.renderer.render('classes');
  }

  cancelTransfer() {
    this.state.transfer = null;
    this.renderer.render('classes');
  }

  async submitTransferStudent(form) {
    if (!this.isCloudAdmin()) return;
    const studentId = form.studentId?.value || this.state.transfer?.studentId;
    const destClassId = form.destClassId?.value || this.state.transfer?.destClassId;
    const startDate = form.startDate?.value || this.state.transfer?.startDate;
    const student = this.store.getStudent(studentId);
    const destClass = this.store.getClass(destClassId);
    if (!student || !destClass) {
      showToast('학생과 목적지 반을 확인하세요.');
      return;
    }
    const open = SAT.resolveOpenEnrollment(this.store.enrollments, student.id);
    const dates = SAT.computeTransferEnrollmentDates(open?.startDate, startDate);
    if (dates.rejected) {
      showToast(dates.message || '시작일을 확인하세요.');
      return;
    }
    if (open && open.classId === destClass.id) {
      showToast('이미 해당 반에 재원 중입니다.');
      return;
    }
    const profiles = this.state.transfer?.profiles || [];
    const ownerLabel = (ownerId) => {
      const row = profiles.find((p) => p.id === ownerId);
      return row?.displayName || row?.email || String(ownerId || '').slice(0, 8);
    };
    const currentClass = open ? this.store.getClass(open.classId) : null;
    const ok = await confirmDialog(
      `현재: ${ownerLabel(student.ownerId)} / ${currentClass?.name || '재원 반 없음'}\n`
      + `변경: ${ownerLabel(destClass.ownerId)} / ${destClass.name}\n`
      + `기존 재원 종료: ${dates.oldEndDate || '해당 없음'}\n`
      + `새 재원 시작: ${startDate}\n\n`
      + '이관하면 과거 시험·결과는 그대로 두고 현재 담당자만 바뀝니다. 계속할까요?',
      { title: '학생 이관 확인', confirmLabel: '이관' }
    );
    if (!ok) return;
    const result = await SAT.withMutationGuard(this, `transfer-student-${studentId}`, async () => {
      try {
        await this.store.transferStudentToClass({
          studentId,
          newClassId: destClassId,
          newStartDate: startDate,
        });
        this.state.transfer = null;
        this.state.selectedClassId = destClassId;
        showToast('학생을 이관했습니다.');
        this.navigate('classes');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async deleteStudent(id) {
    const student = this.store.getStudent(id);
    if (!student) return;
    const ok = await confirmDialog(
      `"${student.name}" 학생을 삭제합니다. 반 등록 기록이 있으면 삭제할 수 없고 비활성화만 가능합니다. 계속하시겠습니까?`,
      { title: '학생 삭제', danger: true, confirmLabel: '삭제' }
    );
    if (!ok) return;
    const result = await SAT.withMutationGuard(this, `delete-student-${id}`, async () => {
      try {
        await this.store.deleteStudent(id);
        showToast('학생이 삭제되었습니다.');
        this.navigate('classes');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  selectCqQuickCreate() {
    const data = this.repository.loadAll();
    const selectedClass = data.classes.find((c) => c.id === this.state.examSetup.classId);
    const found = getCqBlueprintForLevel(selectedClass?.level);
    this.state.examSetup.templateId = found.supported ? EXAM_SETUP_CQ_QUICK : EXAM_SETUP_CQ_UNSUPPORTED;
    this.state.examSetup.cqDraftAnswers = {};
    this.state.examSetup.cqBulkDraft = '';
    this.renderer.render('exams');
  }

  applyCqQuickAnswers() {
    const textarea = document.getElementById('cq-quick-bulk-input');
    const raw = textarea?.value || '';
    this.state.examSetup.cqBulkDraft = raw;
    const parsed = parseCqQuickAnswers(raw);
    const result = validateCqQuickAnswers(parsed, CQ_BLUEPRINT_QUESTION_COUNT);
    const msg = document.getElementById('cq-quick-bulk-msg');
    if (!result.valid) {
      const text = result.errors.map((err) => err.message).join(' ');
      if (msg) msg.textContent = text;
      showToast(result.errors[0]?.message || '정답을 확인해주세요.', 'error');
      return;
    }
    if (msg) msg.textContent = '';
    const answers = {};
    result.answers.forEach((ans, i) => {
      answers[i + 1] = ans;
    });
    this.state.examSetup.cqDraftAnswers = answers;
    this.syncCqQuickAnswerInputs(answers);
    showToast('정답 20개를 적용했습니다.');
  }

  getAuthoringChoiceCount() {
    const form = document.querySelector('[data-form="save-draft-questions"]');
    return SAT.normalizeChoiceCount(form?.dataset.choiceCount);
  }

  setCloudCqCorrectAnswer(number, answer) {
    const choiceCount = this.getAuthoringChoiceCount();
    if (!number || !SAT.isValidChoiceAnswer(answer, choiceCount)) return;
    document.querySelectorAll(`[name="q_${number}_answer"]`).forEach((input) => {
      input.value = answer;
    });
    document.querySelectorAll(`[data-action="cloud-cq-correct-answer"][data-number="${number}"]`).forEach((btn) => {
      btn.classList.toggle('answer-btn--selected', btn.dataset.answer === answer);
    });
  }

  applyAuthoringBulkAnswers() {
    const form = document.querySelector('[data-form="save-draft-questions"]');
    const textarea = document.getElementById('authoring-bulk-input');
    const msg = document.getElementById('authoring-bulk-msg');
    if (!form || !textarea) return;
    const questions = [...form.querySelectorAll('.authoring-row')];
    const choiceCount = this.getAuthoringChoiceCount();
    const tokens = SAT.parseAuthoringBulkAnswers(textarea.value);
    const result = SAT.validateAuthoringBulkAnswers(tokens, questions.length, choiceCount);
    if (!result.ok) {
      const text = result.errors.map((err) => err.message).join(' ');
      if (msg) msg.textContent = text;
      showToast(result.errors[0]?.message || '정답을 확인해주세요.', 'error');
      return;
    }
    if (msg) msg.textContent = '';
    result.answers.forEach((ans, i) => {
      const number = Number(questions[i]?.dataset.number) || (i + 1);
      this.setCloudCqCorrectAnswer(number, ans);
    });
    showToast(`정답 ${result.answers.length}개를 적용했습니다. 초안 저장으로 저장하세요.`);
  }

  syncAuthoringGradingRow(select) {
    const number = Number(select.dataset.authoringGrading);
    if (!number) return;
    const row = select.closest('.authoring-row');
    const cell = row?.querySelector('.authoring-answer-cell');
    if (!cell) return;
    if (select.value === SAT.GRADING_TYPE_MANUAL_BINARY) {
      cell.innerHTML = `<input type="hidden" name="q_${number}_answer" value="1"><span class="authoring-binary-label">정답</span>`;
      return;
    }
    const choiceCount = this.getAuthoringChoiceCount();
    cell.innerHTML = `<div class="authoring-answer-opts">
      <input type="hidden" name="q_${number}_answer" value="">
      ${SAT.choiceOptionsForCount(choiceCount).map((opt) => (
        `<button type="button" class="answer-btn authoring-answer-btn" data-action="cloud-cq-correct-answer" data-number="${number}" data-answer="${opt}">${opt}</button>`
      )).join('')}
    </div>`;
  }

  async submitCreateBlankQuestions(form) {
    const versionId = form.dataset.versionId;
    const submit = form.querySelector('[type="submit"]');
    const fd = new FormData(form);
    const result = await SAT.withMutationGuard(this, `blank-questions-${versionId}`, async () => {
      if (submit) submit.disabled = true;
      try {
        await this.assessmentStore.createBlankQuestions(versionId, fd.get('questionCount'), {
          choiceCount: fd.get('choiceCount'),
        });
        showToast('빈 문항을 만들었습니다. 정답을 입력한 뒤 저장하세요.');
        await this.assessmentStore.loadVersionQuestions(versionId);
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    if (result.skipped) return;
  }

  async addDraftQuestion(versionId) {
    const result = await SAT.withMutationGuard(this, `add-question-${versionId}`, async () => {
      try {
        await this.assessmentStore.addBlankDraftQuestion(versionId);
        showToast('문항을 추가했습니다.');
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  async deleteDraftQuestion(questionId) {
    const form = document.querySelector('[data-form="save-draft-questions"]');
    const versionId = form?.dataset.versionId;
    if (!versionId || !questionId) return;
    const ok = await confirmDialog('이 문항을 삭제할까요? 번호는 다시 맞춰집니다.', {
      title: '문항 삭제',
      confirmLabel: '삭제',
    });
    if (!ok) return;
    const result = await SAT.withMutationGuard(this, `delete-question-${questionId}`, async () => {
      try {
        await this.assessmentStore.deleteDraftQuestion(versionId, questionId);
        showToast('문항을 삭제했습니다.');
        this.renderer.render('exams');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  setCqQuickAnswer(number, answer) {
    if (!number || !answer) return;
    if (!this.state.examSetup.cqDraftAnswers) this.state.examSetup.cqDraftAnswers = {};
    this.state.examSetup.cqDraftAnswers[number] = answer;
    this.syncCqQuickAnswerInputs({ [number]: answer });
  }

  syncCqQuickAnswerInputs(answers) {
    Object.entries(answers || {}).forEach(([num, ans]) => {
      document.querySelectorAll(`[name="q_${num}_answer"]`).forEach((input) => {
        input.value = ans;
      });
      document.querySelectorAll(`[data-action="cq-quick-answer"][data-number="${num}"]`).forEach((btn) => {
        btn.classList.toggle('answer-btn--selected', btn.dataset.answer === ans);
      });
    });
  }

  async saveExamSetup() {
    return this.blockDeferredAcademicWrite();
  }

  async saveTemplateSetup() {
    return this.blockDeferredAcademicWrite();
  }

  async createTemplateFromExam() {
    return this.blockDeferredAcademicWrite();
  }

  addPresetTemplate() {
    return this.blockDeferredAcademicWrite();
  }

  duplicateAssessmentTemplate() {
    return this.blockDeferredAcademicWrite();
  }

  async deleteAssessmentTemplate() {
    return this.blockDeferredAcademicWrite();
  }

  async duplicateExam() {
    return this.blockDeferredAcademicWrite();
  }

  async deleteExam() {
    return this.blockDeferredAcademicWrite();
  }

  getCurrentAnswers() {
    if (this.state.currentAnswers) return { ...this.state.currentAnswers };
    return {};
  }

  setAnswer(value, autoNext = true) {
    if (!this.canWriteSelectedResult()) return;
    const questions = this.getAnswerEntryQuestions();
    const q = questions.find((x) => x.number === this.state.currentQuestion);
    if (!q) return;
    const grading = SAT.normalizeGradingType(q.gradingType);
    if (grading === SAT.GRADING_TYPE_CHOICE && !SAT.isValidChoiceAnswer(value, this.getAnswerEntryChoiceCount())) {
      return;
    }
    if (grading === SAT.GRADING_TYPE_MANUAL_BINARY
      && value !== SAT.MANUAL_BINARY_CORRECT
      && value !== SAT.MANUAL_BINARY_INCORRECT) {
      return;
    }

    const answers = this.getCurrentAnswers();
    answers[q.id] = value;
    delete answers[String(q.number)];
    this.state.currentAnswers = answers;

    if (this.state.answerIssueQuestions?.length) {
      this.state.answerIssueQuestions = this.state.answerIssueQuestions.filter((n) => n !== q.number);
    }

    if (autoNext && this.state.currentQuestion < questions.length) {
      this.state.currentQuestion += 1;
    }
    this.patchAnswerEntryUI();
    this.focusAnswerPanel();
  }

  moveQuestion(delta) {
    this.syncCurrentTextInput();
    const questions = this.getAnswerEntryQuestions();
    const next = this.state.currentQuestion + delta;
    if (next < 1 || next > questions.length) return;
    this.state.currentQuestion = next;
    this.patchAnswerEntryUI();
    this.focusAnswerPanel();
  }

  async applyBulkAnswers() {
    if (!this.canWriteSelectedResult()) {
      showToast(SAT.RESULT_WRITE_FORBIDDEN_MESSAGE || '시험 당시 기록은 읽기 전용입니다.', 'error');
      return;
    }
    const textarea = document.getElementById('bulk-answer-input');
    const msgEl = document.getElementById('bulk-validation-msg');
    if (!textarea) return;

    this.state.bulkInputDraft = textarea.value;
    const questions = this.getAnswerEntryQuestions();
    if (!SAT.allQuestionsChoice(questions)) {
      showToast('객관식 전용 시험에서만 일괄 입력을 사용할 수 있습니다.', 'error');
      return;
    }
    const mode = 'numeric';
    const tokens = parseBulkAnswerInput(textarea.value, mode);
    const validation = validateBulkAnswers(tokens, questions.length, mode, {
      choiceCount: this.getAnswerEntryChoiceCount(),
    });
    const { valid, errors, warnings, errorQuestionNumbers } = validation;

    if (msgEl) {
      if (errors.length) {
        msgEl.className = 'bulk-validation-msg bulk-validation-msg--error';
        msgEl.innerHTML = renderBulkValidationHtml(errors, warnings);
        this.focusQuestionIssues(errorQuestionNumbers);
        return;
      }
      const lines = [...warnings];
      if (lines.length) msgEl.className = 'bulk-validation-msg bulk-validation-msg--warn';
      else msgEl.className = 'bulk-validation-msg bulk-validation-msg--ok';
      msgEl.innerHTML = lines.length
        ? renderBulkValidationHtml([], warnings)
        : `${Math.min(tokens.length, questions.length)}개 답안을 적용할 수 있습니다.`;
    }

    if (!valid) return;

    const current = this.getCurrentAnswers();
    const hasExisting = questions.some((q) => String(SAT.cloudAnswerValue(current, q)).trim());

    let proceed = true;
    if (warnings.length || hasExisting) {
      const parts = [];
      if (warnings.length) {
        parts.push(
          warnings
            .map((w) => (typeof w === 'string' ? w : [w.message, w.detail].filter(Boolean).join('\n')))
            .join('\n\n')
        );
      }
      if (hasExisting) parts.push('기존에 입력된 답안을 덮어씁니다.');
      parts.push('적용하시겠습니까?');
      proceed = await confirmDialog(parts.join('\n\n'), { title: '일괄 입력 적용', confirmLabel: '적용' });
    }
    if (!proceed) {
      const warnNums = warnings.flatMap((w) => (typeof w === 'object' && w.questionNumbers ? w.questionNumbers : []));
      if (warnNums.length) this.focusQuestionIssues(warnNums);
      return;
    }

    const mapped = tokensToAnswersMap(tokens, questions, mode);
    this.state.currentAnswers = { ...current, ...mapped };
    this.state.currentQuestion = 1;
    this.state.answerIssueQuestions = [];
    if (msgEl) {
      msgEl.className = 'bulk-validation-msg bulk-validation-msg--ok';
      msgEl.textContent = '답안이 적용되었습니다. 빠른 입력에서 개별 수정할 수 있습니다.';
    }
    showToast('일괄 답안이 적용되었습니다.');
    this.setAnswerEntryMode('fast');
    this.patchAnswerEntryUI();
    this.focusAnswerPanel();
  }

  async openAnswerEntry(examInstanceId) {
    const instance = (this.assessmentStore?.examInstances || []).find((row) => row.id === examInstanceId);
    if (!instance) {
      showToast('시험을 찾지 못했습니다.', 'error');
      return;
    }
    this.rememberSharedClass(instance.classId);
    this.state.answerEntry.classId = instance.classId;
    this.state.answerEntry.examId = instance.id;
    this.state.answerEntry.studentId = '';
    this.state.answerEntry.overrideStudentIds = [];
    this.state.currentAnswers = null;
    this.state.draftBaseUpdatedAt = null;
    this.state.resultRemoteChangedNotice = false;
    this.state.teacherCommentDraft = '';
    this.state.teacherCommentOpen = false;
    this.state.savedResultPreview = null;
    this.state.currentQuestion = 1;
    this.state.currentView = 'answer-entry';
    await this.ensureAnswerEntryLoaded();
  }

  hydrateAnswerDraftFromExisting() {
    const instance = this.getSelectedExamInstance();
    const studentId = this.state.answerEntry.studentId;
    if (!instance || !studentId) return;
    const existing = this.resultStore?.getResultForStudentInstance(studentId, instance.id);
    if (SAT.shouldPinAnswerDraftBase(this.state.currentAnswers)) {
      this.state.currentAnswers = existing?.answers ? { ...existing.answers } : {};
      this.state.draftBaseUpdatedAt = SAT.resolveDraftBaseUpdatedAt(existing);
      this.state.resultRemoteChangedNotice = false;
    }
    if (this.state.teacherCommentDraft == null || this.state.teacherCommentDraft === '') {
      this.state.teacherCommentDraft = existing?.teacherComment || '';
    }
    if (existing) this.state.savedResultPreview = existing;
  }

  canWriteSelectedResult() {
    const profile = this.store?.currentProfile?.();
    if (SAT.isAdmin(profile)) return true;
    const instance = this.getSelectedExamInstance();
    const studentId = this.state.answerEntry.studentId;
    if (!instance || !studentId) return false;
    const student = (this.store.getViewStudents?.() || []).find((row) => row.id === studentId) || null;
    const examClass = (this.store.classes || []).find((row) => row.id === instance.classId) || null;
    return SAT.canWriteCloudResult({
      profile,
      actorId: this.store.currentUserId?.() || profile?.id || null,
      student,
      examClass,
    });
  }

  syncAnswerEntryRemoteNotice() {
    const notice = document.getElementById('answer-remote-stale-notice');
    if (!notice) return;
    notice.hidden = !this.state.resultRemoteChangedNotice;
  }

  async restartAnswerDraftFromRemote() {
    if (!this.state.resultRemoteChangedNotice) return;
    if (!this.canWriteSelectedResult()) return;
    const instance = this.getSelectedExamInstance();
    const studentId = this.state.answerEntry.studentId;
    if (!instance || !studentId) return;
    const existing = this.resultStore?.getResultForStudentInstance(studentId, instance.id);
    const ok = await confirmDialog(SAT.RESULT_RESTART_FROM_REMOTE_CONFIRM, {
      title: '저장 충돌',
      confirmLabel: SAT.RESULT_RESTART_FROM_REMOTE_CONFIRM_LABEL,
    });
    if (!ok) return;
    const result = await SAT.withMutationGuard(this, `restart-result-${instance.id}-${studentId}`, async () => {
      try {
        const remote = await this.resultStore.reloadOneResult({
          studentId,
          examInstanceId: instance.id,
          resultId: existing?.id || null,
        });
        this.state.currentAnswers = null;
        this.state.draftBaseUpdatedAt = null;
        this.state.resultRemoteChangedNotice = false;
        this.state.teacherCommentDraft = '';
        this.state.savedResultPreview = null;
        this.state.bulkInputDraft = '';
        this.hydrateAnswerDraftFromExisting();
        if (remote && this.state.savedResultPreview == null) {
          this.state.savedResultPreview = remote;
        }
        showToast('최신 저장본으로 다시 시작했습니다.');
        this.renderer.render('answer-entry');
      } catch (err) {
        this.cloudErrorToast(err);
      }
    });
    if (result.skipped) return;
  }

  detectAnswerEntryRemoteChange() {
    const instance = this.getSelectedExamInstance();
    const studentId = this.state.answerEntry.studentId;
    const base = this.state.draftBaseUpdatedAt;
    if (!instance || !studentId || !base) return;
    const storeRow = this.resultStore?.getResultForStudentInstance(studentId, instance.id);
    if (SAT.isDraftBaseStaleAgainstRemote(base, storeRow)) {
      this.state.resultRemoteChangedNotice = true;
    }
    this.syncAnswerEntryRemoteNotice();
  }

  async ensureAnswerEntryLoaded() {
    if (this._answerEntryLoadPromise) return this._answerEntryLoadPromise;
    this._answerEntryLoadPromise = this._loadAnswerEntryContext().finally(() => {
      this._answerEntryLoadPromise = null;
    });
    return this._answerEntryLoadPromise;
  }

  async _loadAnswerEntryContext() {
    const instance = this.getSelectedExamInstance();
    if (!instance?.assessmentVersionId) {
      this.renderer.render('answer-entry');
      return;
    }
    try {
      await this.assessmentStore.loadVersionQuestions(instance.assessmentVersionId);
      if (this.resultStore?.status !== SAT.CLOUD_UI_STATES.READY) {
        await this.resultStore.refresh();
      }
      this.hydrateAnswerDraftFromExisting();
      this.renderer.render('answer-entry');
    } catch (err) {
      this.cloudErrorToast(err);
    }
  }

  async addAnswerOverrideStudent() {
    const select = document.getElementById('answer-override-student');
    const studentId = select?.value;
    if (!studentId) return;
    const ok = await confirmDialog(
      '이 학생은 시험일 기준 해당 반 재원 기록이 없습니다.\n그래도 결과를 입력하시겠습니까?',
      { title: '재원 기록 없음', confirmLabel: '입력하기' }
    );
    if (!ok) return;
    const ids = new Set(this.state.answerEntry.overrideStudentIds || []);
    ids.add(studentId);
    this.state.answerEntry.overrideStudentIds = [...ids];
    this.state.answerEntry.studentId = studentId;
    this.state.currentAnswers = null;
    this.state.draftBaseUpdatedAt = null;
    this.state.resultRemoteChangedNotice = false;
    this.state.teacherCommentDraft = '';
    this.state.savedResultPreview = null;
    this.hydrateAnswerDraftFromExisting();
    this.renderer.render('answer-entry');
  }

  async saveAnswers({ andNextStudent } = {}) {
    this.syncCurrentTextInput();
    const instance = this.getSelectedExamInstance();
    const studentId = this.state.answerEntry.studentId;
    const questions = this.getAnswerEntryQuestions();
    if (!instance || !studentId || !questions.length) {
      showToast('반, 시험, 학생을 선택해주세요.', 'error');
      return;
    }
    const roster = this.getAnswerEntryStudents();
    if (!roster.some((s) => s.id === studentId)) {
      showToast('시험일 기준 재원 학생이 아닙니다.', 'error');
      return;
    }
    if (!this.canWriteSelectedResult()) {
      showToast(SAT.RESULT_WRITE_FORBIDDEN_MESSAGE || '시험 당시 기록은 읽기 전용입니다.', 'error');
      return;
    }
    const draft = this.getCurrentAnswers();
    const missing = questions.filter((q) => !String(SAT.cloudAnswerValue(draft, q)).trim());
    if (missing.length) {
      const ok = await confirmDialog(
        `미입력 문항이 ${missing.length}개 있습니다. 그대로 저장할까요?`,
        { title: '미입력 문항', confirmLabel: '저장' }
      );
      if (!ok) {
        this.focusQuestionIssues(missing.map((q) => q.number));
        return;
      }
    }
    const commentEl = document.getElementById('result-teacher-comment');
    const teacherComment = commentEl ? commentEl.value : (this.state.teacherCommentDraft || '');
    const submit = document.querySelector('#answer-entry-card [data-action="save-answers"]');
    const nextBtn = document.getElementById('btn-save-next-student');
    const result = await SAT.withMutationGuard(this, `save-result-${instance.id}-${studentId}`, async () => {
      if (submit) submit.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      try {
        const row = await this.resultStore.saveStudentAnswers({
          examInstanceId: instance.id,
          studentId,
          answers: draft,
          teacherComment,
          questions,
          draftBaseUpdatedAt: this.state.draftBaseUpdatedAt,
        });
        this.state.currentAnswers = { ...(row.answers || {}) };
        this.state.draftBaseUpdatedAt = SAT.nextDraftBaseUpdatedAtAfterSave(row);
        this.state.resultRemoteChangedNotice = false;
        this.state.teacherCommentDraft = row.teacherComment || '';
        this.state.savedResultPreview = row;
        showToast('답안을 저장했습니다.');
        if (andNextStudent) {
          const nextId = this.getNextStudentId();
          if (nextId) {
            this.state.answerEntry.studentId = nextId;
            this.state.currentAnswers = null;
            this.state.draftBaseUpdatedAt = null;
            this.state.resultRemoteChangedNotice = false;
            this.state.savedResultPreview = null;
            this.state.teacherCommentDraft = '';
            this.state.teacherCommentOpen = false;
            this.state.currentQuestion = 1;
            this.hydrateAnswerDraftFromExisting();
          }
        }
        this.renderer.render('answer-entry');
      } catch (err) {
        this.revealAnswerEntryStaleConflict(err);
        this.cloudErrorToast(err);
      } finally {
        if (submit) submit.disabled = false;
        if (nextBtn) nextBtn.disabled = false;
      }
    });
    if (result.skipped) return;
  }

  exportJson() {
    this.blockLegacyLocalWrite();
  }

  exportCsv() {
    this.blockDeferredAcademicWrite();
  }

  async resetAll() {
    this.blockLegacyLocalWrite();
  }
}

  SAT.StudentAchievementApp = StudentAchievementApp;

  /**
   * P5A boots CloudAcademicStore after an active profile passes the auth gate.
   * Local academic JSON is not read or written.
   */
  SAT.startLegacyTrackerApp = async function startLegacyTrackerApp() {
    document.title = APP_NAME;
    if (!SAT._legacyAppInstance) {
      const app = new StudentAchievementApp();
      SAT._legacyAppInstance = app;
      document.addEventListener('change', async (e) => {
        if (e.target.matches('[data-action="import-json-input"], [data-action="recovery-import-json-input"]')) {
          const file = e.target.files?.[0];
          if (!file) return;
          await app.importJsonFile(file);
          e.target.value = '';
        }
      });
      document.addEventListener('input', (e) => {
        if (e.target.matches('[data-question-major]')) {
          app.refreshMiddleDatalist(e.target);
        }
        if (e.target.matches('#bulk-answer-input')) {
          app.state.bulkInputDraft = e.target.value;
        }
        if (e.target.matches('#result-teacher-comment')) {
          app.state.teacherCommentDraft = e.target.value;
        }
      });
    }
    SAT._legacyAppStarted = true;
    await SAT._legacyAppInstance.initCloud();
    return SAT._legacyAppInstance;
  };
})(window.SAT = window.SAT || {});
