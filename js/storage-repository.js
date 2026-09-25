(function (SAT) {

  const { STORAGE_KEY, SCHEMA_VERSION, StorageErrorCodes, STORAGE_RECOVERY_MESSAGE } = SAT;

  const { generateId, nowIso } = SAT;



  function createEmptyData() {

    return {

      schemaVersion: SCHEMA_VERSION,

      updatedAt: nowIso(),

      settings: {

        lastBackupAt: null,

        ignoreCase: true,

      },

      classes: [],

      students: [],

      exams: [],

      questions: [],

      results: [],

      assessmentTemplates: [],

    };

  }



  function cloneData(data) {

    if (typeof structuredClone === 'function') return structuredClone(data);

    return JSON.parse(JSON.stringify(data));

  }



  function isSaveFailure(result) {

    return Boolean(result && typeof result === 'object' && result.ok === false);

  }



  class LocalStorageRepository {

    constructor(storageKey = STORAGE_KEY, adapter = null) {

      this.storageKey = storageKey;

      this._adapter =

        adapter ||

        (typeof localStorage !== 'undefined' ? SAT.createLocalStorageAdapter(localStorage) : null);

      this._cache = null;

      this._structureWarnings = [];

      this._storageRecoveryRequired = false;

      this._corruptBackupKey = null;

      this._corruptRaw = null;

      this._workingData = null;

      this._loaded = false;

    }



    isStorageRecoveryRequired() {

      return this._storageRecoveryRequired;

    }



    getStorageRecoveryInfo() {

      return {

        required: this._storageRecoveryRequired,

        corruptBackupKey: this._corruptBackupKey,

        corruptRaw: this._corruptRaw,

        message: STORAGE_RECOVERY_MESSAGE,

        corruptBackupKeys: this._adapter?.listCorruptBackupKeys?.() || [],

      };

    }



    getCorruptRaw() {

      return this._corruptRaw;

    }



    _ensureAdapter() {

      if (!this._adapter) {

        throw new Error('localStorage adapter is not available');

      }

    }



    _enterRecoveryState(raw, backupKey) {

      this._storageRecoveryRequired = true;

      this._corruptRaw = raw;

      this._corruptBackupKey = backupKey;

      this._workingData = createEmptyData();

      this._cache = null;

      this._structureWarnings = [];

    }



    loadAll() {

      if (this._cache) return cloneData(this._cache);

      if (this._storageRecoveryRequired) {

        return cloneData(this._workingData || createEmptyData());

      }



      this._ensureAdapter();

      if (this._loaded && !this._cache && !this._storageRecoveryRequired) {

        this._cache = createEmptyData();

        return cloneData(this._cache);

      }



      const read = this._adapter.readJson(this.storageKey);

      this._loaded = true;



      if (read.ok) {

        if (read.value == null) {

          this._cache = createEmptyData();

          return cloneData(this._cache);

        }

        this._cache = this._normalize(read.value);

        return cloneData(this._cache);

      }



      if (read.code === StorageErrorCodes.PARSE_ERROR) {

        const backup = this._adapter.preserveCorruptBackup(this.storageKey, read.raw);

        this._enterRecoveryState(read.raw, backup.ok ? backup.backupKey : null);

        return cloneData(this._workingData);

      }



      console.error('Failed to load data:', read.error || read.message);

      this._enterRecoveryState('', null);

      return cloneData(this._workingData);

    }



    saveAll(data, { allowDuringRecovery = false } = {}) {

      if (this._storageRecoveryRequired && !allowDuringRecovery) {

        return {

          ok: false,

          code: StorageErrorCodes.RECOVERY_REQUIRED,

          message: STORAGE_RECOVERY_MESSAGE,

        };

      }



      this._ensureAdapter();

      const previousCache = this._cache ? cloneData(this._cache) : null;

      const normalized = this._normalize(data);

      normalized.updatedAt = nowIso();

      this._cache = normalized;



      const write = this._adapter.writeJson(this.storageKey, normalized);

      if (!write.ok) {

        this._cache = previousCache;

        return write;

      }



      if (allowDuringRecovery) {

        this._storageRecoveryRequired = false;

        this._corruptRaw = null;

        this._corruptBackupKey = null;

        this._workingData = null;

      }



      return { ok: true, data: cloneData(normalized), bytes: write.bytes };

    }



    _normalize(data) {

      const base = createEmptyData();

      if (!data || typeof data !== 'object') return base;

      const normalized = {

        schemaVersion: data.schemaVersion ?? SCHEMA_VERSION,

        updatedAt: data.updatedAt ?? nowIso(),

        settings: { ...base.settings, ...(data.settings || {}) },

        classes: Array.isArray(data.classes)

          ? data.classes.map((c) => ({

              ...c,

              level: SAT.normalizeLevel(c.level),

            }))

          : [],

        students: Array.isArray(data.students) ? data.students : [],

        exams: Array.isArray(data.exams)

          ? data.exams.map((e) => SAT.normalizeExamTemplateFields(e))

          : [],

        questions: Array.isArray(data.questions) ? data.questions : [],

        results: Array.isArray(data.results) ? data.results : [],

        assessmentTemplates: Array.isArray(data.assessmentTemplates)

          ? data.assessmentTemplates.map((t) => SAT.normalizeAssessmentTemplate(t)).filter(Boolean)

          : [],

      };

      if (normalized.schemaVersion < SCHEMA_VERSION) {

        normalized.schemaVersion = SCHEMA_VERSION;

      }

      normalized.settings.uiPrefs = SAT.normalizeUiPrefs(normalized.settings.uiPrefs);



      const structured = SAT.applyStoredQuestionStructure(normalized);

      const idResult = SAT.ensureExamQuestionIds(structured.data.questions, {

        createId: generateId,

      });

      structured.data.questions = idResult.questions;

      this._structureWarnings = [...(structured.warnings || []), ...idResult.repairs];

      return structured.data;

    }



    getStructureWarnings() {

      return [...(this._structureWarnings || [])];

    }



    _normalizeTemplateRecord(template, existing) {

      const now = nowIso();

      const normalized = SAT.normalizeAssessmentTemplate(template);

      if (!normalized) return null;

      const questions = (normalized.questions || []).map((q, i) =>

        SAT.normalizeTemplateQuestion(q, i + 1)

      );

      return {

        id: normalized.id || generateId(),

        name: normalized.name?.trim() || '',

        level: SAT.normalizeLevel(normalized.level),

        examType: normalized.examType?.trim() || '',

        questionCount: questions.length,

        questions,

        createdAt: normalized.createdAt || existing?.createdAt || now,

        updatedAt: now,

      };

    }



    _mutate(mutator) {

      const data = this.loadAll();

      mutator(data);

      return this.saveAll(data);

    }



    getClasses() {

      return this.loadAll().classes;

    }

    getClass(id) {

      return this.getClasses().find((c) => c.id === id) || null;

    }



    saveClass(classData) {

      return this._mutate((data) => {

        const now = nowIso();

        const existing = data.classes.findIndex((c) => c.id === classData.id);

        const record = {

          id: classData.id || generateId(),

          name: classData.name?.trim() || '',

          level: SAT.normalizeLevel(classData.level),

          createdAt: classData.createdAt || now,

          updatedAt: now,

        };

        if (existing >= 0) data.classes[existing] = record;

        else data.classes.push(record);

      });

    }



    deleteClass(id) {

      return this._mutate((data) => {

        data.classes = data.classes.filter((c) => c.id !== id);

        const studentIds = data.students.filter((s) => s.classId === id).map((s) => s.id);

        data.students = data.students.filter((s) => s.classId !== id);

        const examIds = data.exams.filter((e) => e.classId === id).map((e) => e.id);

        data.exams = data.exams.filter((e) => e.classId !== id);

        data.questions = data.questions.filter((q) => !examIds.includes(q.examId));

        data.results = data.results.filter(

          (r) => !examIds.includes(r.examId) && !studentIds.includes(r.studentId)

        );

      });

    }



    getStudents({ classId, activeOnly = false } = {}) {

      let list = this.loadAll().students;

      if (classId) list = list.filter((s) => s.classId === classId);

      if (activeOnly) list = list.filter((s) => s.active !== false);

      return list;

    }



    getStudent(id) {

      return this.getStudents().find((s) => s.id === id) || null;

    }



    saveStudent(student) {

      return this._mutate((data) => {

        const now = nowIso();

        const existing = data.students.findIndex((s) => s.id === student.id);

        const record = {

          id: student.id || generateId(),

          classId: student.classId,

          name: student.name?.trim() || '',

          englishName: student.englishName?.trim() || '',

          active: student.active !== false,

          createdAt: student.createdAt || now,

          updatedAt: now,

        };

        if (existing >= 0) data.students[existing] = record;

        else data.students.push(record);

      });

    }



    archiveStudent(id) {

      const student = this.getStudent(id);

      if (!student) return this.loadAll();

      return this.saveStudent({ ...student, active: false });

    }



    deleteStudent(id) {

      return this._mutate((data) => {

        data.students = data.students.filter((s) => s.id !== id);

        data.results = data.results.filter((r) => r.studentId !== id);

      });

    }



    getExams({ classId } = {}) {

      let list = this.loadAll().exams;

      if (classId) list = list.filter((e) => e.classId === classId);

      return list.sort((a, b) => new Date(b.date) - new Date(a.date));

    }



    getExam(id) {

      return this.getExams().find((e) => e.id === id) || null;

    }



    saveExam(exam) {

      return this._mutate((data) => {

        const now = nowIso();

        const existing = data.exams.findIndex((e) => e.id === exam.id);

        const record = {

          id: exam.id || generateId(),

          classId: exam.classId,

          title: exam.title?.trim() || '',

          examType: exam.examType?.trim() || '',

          date: exam.date || now.slice(0, 10),

          questionCount: Number(exam.questionCount) || 0,

          createdAt: exam.createdAt || now,

          updatedAt: now,

        };

        const prev = existing >= 0 ? data.exams[existing] : null;

        if (exam.templateId !== undefined) {

          if (exam.templateId) record.templateId = String(exam.templateId);

        } else if (prev?.templateId) {

          record.templateId = prev.templateId;

        }

        if (exam.templateNameSnapshot !== undefined) {

          record.templateNameSnapshot = String(exam.templateNameSnapshot ?? '').trim();

        } else if (prev?.templateNameSnapshot !== undefined) {

          record.templateNameSnapshot = String(prev.templateNameSnapshot ?? '').trim();

        } else {

          record.templateNameSnapshot = '';

        }

        if (exam.templateLevelSnapshot !== undefined) {

          record.templateLevelSnapshot = SAT.normalizeLevel(exam.templateLevelSnapshot);

        } else if (prev?.templateLevelSnapshot !== undefined) {

          record.templateLevelSnapshot = String(prev.templateLevelSnapshot ?? '').trim();

        } else {

          record.templateLevelSnapshot = '';

        }

        const finalRecord = SAT.normalizeExamTemplateFields(record);

        if (existing >= 0) data.exams[existing] = finalRecord;

        else data.exams.push(finalRecord);

      });

    }



    deleteExam(id) {

      return this._mutate((data) => {

        data.exams = data.exams.filter((e) => e.id !== id);

        data.questions = data.questions.filter((q) => q.examId !== id);

        data.results = data.results.filter((r) => r.examId !== id);

      });

    }



    getQuestionsByExam(examId) {

      return this.loadAll()

        .questions.filter((q) => q.examId === examId)

        .sort((a, b) => a.number - b.number);

    }



    saveQuestions(examId, questions) {

      return this._mutate((data) => {

        data.questions = data.questions.filter((q) => q.examId !== examId);

        const now = nowIso();

        const ensured = SAT.ensureExamQuestionIds((questions || []).map((q) => ({ ...q, examId })), {

          createId: generateId,

        });

        ensured.questions.forEach((q) => {

          data.questions.push({

            id: q.id,

            examId,

            number: Number(q.number),

            correctAnswer: String(q.correctAnswer ?? '').trim(),

            points: Number(q.points) || 1,

            majorCategory: SAT.normalizeCategory(q.majorCategory),

            middleCategory: SAT.normalizeCategory(q.middleCategory),

            note: q.note?.trim() || '',

            createdAt: q.createdAt || now,

            updatedAt: now,

          });

        });

        const exam = data.exams.find((e) => e.id === examId);

        if (exam) {

          exam.questionCount = ensured.questions.length;

          exam.updatedAt = now;

        }

      });

    }



    getResults({ examId, studentId, classId } = {}) {

      let list = this.loadAll().results;

      if (examId) list = list.filter((r) => r.examId === examId);

      if (studentId) list = list.filter((r) => r.studentId === studentId);

      if (classId) {

        const examIds = new Set(this.getExams({ classId }).map((e) => e.id));

        list = list.filter((r) => examIds.has(r.examId));

      }

      return list;

    }



    getResult(id) {

      return this.getResults().find((r) => r.id === id) || null;

    }



    getResultByExamStudent(examId, studentId) {

      return this.getResults({ examId, studentId })[0] || null;

    }



    saveResult(result) {

      return this._mutate((data) => {

        const now = nowIso();

        const existing = data.results.findIndex((r) => r.id === result.id);

        const byPair = data.results.findIndex(

          (r) => r.examId === result.examId && r.studentId === result.studentId

        );

        const prev = existing >= 0 ? data.results[existing] : byPair >= 0 ? data.results[byPair] : null;

        const record = {

          id: result.id || generateId(),

          examId: result.examId,

          studentId: result.studentId,

          answers: result.answers || {},

          correctCount: result.correctCount ?? 0,

          earnedPoints: result.earnedPoints ?? 0,

          totalPoints: result.totalPoints ?? 0,

          percentage: result.percentage ?? 0,

          categoryStats: result.categoryStats || {},

          teacherComment:

            result.teacherComment !== undefined

              ? String(result.teacherComment ?? '').trim()

              : (prev?.teacherComment ?? ''),

          submittedAt: result.submittedAt || now,

          updatedAt: now,

        };

        if (existing >= 0) data.results[existing] = record;

        else if (byPair >= 0) data.results[byPair] = { ...record, id: data.results[byPair].id };

        else data.results.push(record);

      });

    }



    deleteResult(id) {

      return this._mutate((data) => {

        data.results = data.results.filter((r) => r.id !== id);

      });

    }



    updateResultTeacherComment(resultId, comment) {

      return this._mutate((data) => {

        const result = data.results.find((r) => r.id === resultId);

        if (!result) return;

        result.teacherComment = String(comment ?? '').trim();

        result.updatedAt = nowIso();

      });

    }



    exportData() {

      const data = this.loadAll();

      return { ...cloneData(data), exportedAt: nowIso() };

    }



    importData(payload) {

      const readiness = SAT.validateImportReadiness(payload);

      if (readiness.status === 'blockingError') {

        return {

          ok: false,

          code: 'INTEGRITY_BLOCKED',

          message: SAT.formatIntegrityBlockingSummary(readiness),

        };

      }

      if (readiness.status === 'repairable') {

        return {

          ok: false,

          code: 'INTEGRITY_REPAIR_REQUIRED',

          message: SAT.formatIntegrityRepairSummary(readiness),

        };

      }



      const normalized = this._normalize(readiness.payload);

      const finalReadiness = SAT.validateImportReadiness(normalized);

      if (finalReadiness.status === 'blockingError') {

        return {

          ok: false,

          code: 'INTEGRITY_BLOCKED',

          message: SAT.formatIntegrityBlockingSummary(finalReadiness),

        };

      }

      if (finalReadiness.status === 'repairable') {

        return {

          ok: false,

          code: 'INTEGRITY_REPAIR_REQUIRED',

          message: SAT.formatIntegrityRepairSummary(finalReadiness),

        };

      }



      return this.saveAll(normalized, { allowDuringRecovery: true });

    }



    setLastBackupAt(iso) {

      return this._mutate((data) => {

        data.settings.lastBackupAt = iso;

      });

    }



    updateUiPrefs(prefs) {

      return this._mutate((data) => {

        data.settings.uiPrefs = SAT.normalizeUiPrefs({

          ...SAT.normalizeUiPrefs(data.settings.uiPrefs),

          ...prefs,

          examsListFilters: {

            ...SAT.normalizeUiPrefs(data.settings.uiPrefs).examsListFilters,

            ...(prefs?.examsListFilters || {}),

          },

          examOverviewFilters: {

            ...SAT.normalizeUiPrefs(data.settings.uiPrefs).examOverviewFilters,

            ...(prefs?.examOverviewFilters || {}),

          },

          answerEntry: {

            ...SAT.normalizeUiPrefs(data.settings.uiPrefs).answerEntry,

            ...(prefs?.answerEntry || {}),

          },

        });

      });

    }



    getAssessmentTemplates() {

      return this.loadAll().assessmentTemplates.slice().sort((a, b) => {

        const lc = a.level.localeCompare(b.level, 'ko');

        if (lc !== 0) return lc;

        return a.name.localeCompare(b.name, 'ko');

      });

    }



    getAssessmentTemplate(id) {

      return this.getAssessmentTemplates().find((t) => t.id === id) || null;

    }



    saveAssessmentTemplate(template) {

      return this._mutate((data) => {

        const existingIdx = data.assessmentTemplates.findIndex((t) => t.id === template.id);

        const existing = existingIdx >= 0 ? data.assessmentTemplates[existingIdx] : null;

        const record = this._normalizeTemplateRecord(template, existing);

        if (!record) return;

        if (existingIdx >= 0) data.assessmentTemplates[existingIdx] = record;

        else data.assessmentTemplates.push(record);

      });

    }



    deleteAssessmentTemplate(id) {

      return this._mutate((data) => {

        data.assessmentTemplates = data.assessmentTemplates.filter((t) => t.id !== id);

      });

    }



    duplicateAssessmentTemplate(id) {

      const source = this.getAssessmentTemplate(id);

      if (!source) return this.loadAll();

      const copy = this._normalizeTemplateRecord(

        {

          ...source,

          id: generateId(),

          name: `${source.name} (복제)`,

          questions: source.questions.map((q) => ({ ...q })),

          createdAt: undefined,

        },

        null

      );

      return this._mutate((data) => {

        data.assessmentTemplates.push(copy);

      });

    }



    resetAllData() {

      return this.saveAll(createEmptyData(), { allowDuringRecovery: true });

    }



    startFreshAfterRecovery() {

      const empty = createEmptyData();

      const result = this.saveAll(empty, { allowDuringRecovery: true });

      if (!result.ok) return result;

      this._storageRecoveryRequired = false;

      this._corruptRaw = null;

      this._corruptBackupKey = null;

      this._workingData = null;

      this._cache = cloneData(empty);

      return { ok: true, data: cloneData(this._cache) };

    }



    invalidateCache() {

      this._cache = null;

      this._loaded = false;

    }

  }



  SAT.LocalStorageRepository = LocalStorageRepository;

  SAT.createRepository = function createRepository(options = {}) {

    return new LocalStorageRepository(options.storageKey, options.adapter);

  };

  SAT.isSaveFailure = isSaveFailure;

})(window.SAT = window.SAT || {});

