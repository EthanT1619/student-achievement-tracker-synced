/**
 * In-memory Cloud Assessment session for P5B.
 * Assessments / Versions / Questions / ExamInstances.
 * Does not load Results or legacy local exams.
 */
(function (SAT) {
  const STATES = SAT.CLOUD_UI_STATES;

  class CloudAssessmentStore {
    constructor(cloudRepo, authManager) {
      this.cloud = cloudRepo || null;
      this.auth = authManager || null;
      this.runtime = 'cloud-assessment';
      this.status = STATES.LOADING;
      this.error = null;
      this.assessments = [];
      this.versions = [];
      this.questionsByVersionId = Object.create(null);
      this.examInstances = [];
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

    canAuthor() {
      return SAT.canEditCurriculum(this.currentProfile());
    }

    canForceDelete() {
      return SAT.canShowForceDeleteAssessment(this.currentProfile());
    }

    clear() {
      this._generation += 1;
      this.status = STATES.LOADING;
      this.error = null;
      this.assessments = [];
      this.versions = [];
      this.questionsByVersionId = Object.create(null);
      this.examInstances = [];
    }

    libraryRows() {
      return SAT.composeLibraryRows(this.assessments, this.versions);
    }

    versionsFor(assessmentId) {
      return this.versions
        .filter((v) => v.assessmentId === assessmentId)
        .slice()
        .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
    }

    getAssessment(id) {
      return this.assessments.find((a) => a.id === id) || null;
    }

    getVersion(id) {
      return this.versions.find((v) => v.id === id) || null;
    }

    questionsFor(versionId) {
      return this.questionsByVersionId[versionId] || [];
    }

    async _ensureQuestions(versionId) {
      if (this.hasLoadedQuestions(versionId)) return this.questionsFor(versionId);
      return this.loadVersionQuestions(versionId);
    }

    hasLoadedQuestions(versionId) {
      return Object.prototype.hasOwnProperty.call(this.questionsByVersionId, versionId);
    }

    examInstancesForClass(classId) {
      return this.examInstances
        .filter((row) => row.classId === classId)
        .map((row) => SAT.composeExamInstanceView(row, this.versions, this.assessments));
    }

    async refresh() {
      const gen = this._generation + 1;
      this._generation = gen;
      this.status = STATES.LOADING;
      this.error = null;
      try {
        const repo = this._repo();
        const [assessments, versions, examInstances] = await Promise.all([
          repo.listAssessments(),
          repo.listAllAssessmentVersions(),
          repo.listExamInstances(),
        ]);
        if (gen !== this._generation) return this;
        this.assessments = assessments;
        this.versions = versions;
        this.examInstances = examInstances;
        this.status = assessments.length ? STATES.READY : STATES.EMPTY;
        this.error = null;
      } catch (err) {
        if (gen !== this._generation) return this;
        this.status = STATES.ERROR;
        this.error = err;
      }
      return this;
    }

    async loadVersionQuestions(versionId) {
      if (!versionId) return [];
      const rows = await this._repo().listAssessmentQuestions(versionId);
      this.questionsByVersionId[versionId] = rows.map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
      return this.questionsByVersionId[versionId];
    }

    async ensureQuestionsForVersions(versionIds) {
      const ids = [...new Set((versionIds || []).filter(Boolean))];
      const missing = ids.filter((id) => !this.hasLoadedQuestions(id));
      if (!missing.length) return this.questionsByVersionId;
      const rows = await this._repo().listQuestionsForVersions(missing);
      const grouped = Object.create(null);
      missing.forEach((id) => {
        grouped[id] = [];
      });
      (rows || []).forEach((row) => {
        const id = row.assessmentVersionId;
        if (!id) return;
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push(row);
      });
      Object.keys(grouped).forEach((id) => {
        this.questionsByVersionId[id] = grouped[id]
          .slice()
          .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
          .map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
      });
      return this.questionsByVersionId;
    }

    async createAssessment({ title, assessmentType, level, lessonStart, lessonEnd, applyCqBlueprint, choiceCount }) {
      const createdBy = this.currentUserId();
      if (!createdBy) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '로그인 정보를 확인할 수 없습니다.',
        }, 'assessments.create');
      }
      const type = String(assessmentType || '').trim() || SAT.ASSESSMENT_TYPE_CQ;
      const lvl = SAT.normalizeLevel(level);
      const assessment = await this._repo().createAssessment({
        title: String(title || '').trim(),
        assessmentType: type,
        level: lvl,
        lessonStart: lessonStart === '' || lessonStart == null ? null : Number(lessonStart),
        lessonEnd: lessonEnd === '' || lessonEnd == null ? null : Number(lessonEnd),
        active: true,
        createdBy,
      });
      let version = null;
      let questions = [];
      let partial = false;
      const blueprintQs = applyCqBlueprint && type === SAT.ASSESSMENT_TYPE_CQ
        ? SAT.cloudQuestionsFromCqBlueprint(lvl)
        : null;
      const versionChoiceCount = blueprintQs
        ? SAT.DEFAULT_CHOICE_COUNT
        : SAT.normalizeChoiceCount(choiceCount);
      try {
        version = await this._repo().createDraftAssessmentVersion({
          assessmentId: assessment.id,
          createdBy,
          choiceCount: versionChoiceCount,
        });
      } catch (err) {
        await this.refresh();
        const wrapped = SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '초안 버전을 생성하지 못했습니다. 문제집은 남아 있을 수 있습니다.',
        }, 'assessmentVersions.createDraft');
        wrapped.partial = true;
        wrapped.cause = err;
        throw wrapped;
      }
      if (blueprintQs) {
        try {
          questions = await this._repo().createAssessmentQuestions(version.id, blueprintQs);
          this.questionsByVersionId[version.id] = questions.map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
        } catch (err) {
          let cleaned = false;
          try {
            await this._repo().deleteDraftAssessmentVersion(version.id);
            cleaned = true;
          } catch {
            cleaned = false;
          }
          await this.refresh();
          const wrapped = SAT.createRepositoryError({
            code: 'VALIDATION',
            message: cleaned
              ? '문항 생성에 실패하여 초안 버전을 취소했습니다. 문제집은 남아 있습니다.'
              : '문항 생성에 실패했고 초안 버전도 남아 있을 수 있습니다.',
          }, 'assessmentQuestions.createBatch');
          wrapped.partial = !cleaned;
          wrapped.cleaned = cleaned;
          wrapped.cause = err;
          throw wrapped;
        }
      } else {
        this.questionsByVersionId[version.id] = [];
      }
      await this.refresh();
      return {
        assessment,
        version,
        questions,
        partial,
        usedStandardBlueprint: Boolean(blueprintQs),
      };
    }

    async updateAssessmentTitle(id, title) {
      const row = await this._repo().updateAssessment(id, { title: String(title || '').trim() });
      await this.refresh();
      return row;
    }

    async setAssessmentActive(id, active) {
      const row = await this._repo().updateAssessment(id, { active: Boolean(active) });
      await this.refresh();
      return row;
    }

    async createDraftVersion(assessmentId) {
      const createdBy = this.currentUserId();
      const existing = this.versionsFor(assessmentId);
      const versionNumber = SAT.nextAssessmentVersionNumber(existing);
      const row = await this._repo().createDraftAssessmentVersion({
        assessmentId,
        versionNumber,
        createdBy,
      });
      await this.refresh();
      return row;
    }

    async createDraftFromPublished(sourceVersionId) {
      const source = this.getVersion(sourceVersionId);
      if (!source || source.status !== 'published') {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '공개된 버전에서만 새 초안을 복사할 수 있습니다.',
        }, 'assessmentVersions.copy');
      }
      const sourceQuestions = await this._ensureQuestions(sourceVersionId);
      const copies = SAT.copyQuestionsForNewDraft(sourceQuestions);
      const createdBy = this.currentUserId();
      const draft = await this._repo().createDraftAssessmentVersion({
        assessmentId: source.assessmentId,
        createdBy,
        choiceCount: SAT.resolveChoiceCount({
          version: source,
          assessment: this.getAssessment(source.assessmentId),
          questions: sourceQuestions,
        }),
      });
      try {
        if (copies.length) {
          const created = await this._repo().createAssessmentQuestions(draft.id, copies);
          this.questionsByVersionId[draft.id] = created.map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
        }
      } catch (err) {
        try {
          await this._repo().deleteDraftAssessmentVersion(draft.id);
        } catch {
          /* keep draft leftover */
        }
        await this.refresh();
        const wrapped = SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '문항 복사에 실패했습니다. 원본 공개 문항은 변경되지 않았습니다.',
        }, 'assessmentVersions.copy');
        wrapped.cause = err;
        throw wrapped;
      }
      await this.refresh();
      return draft;
    }

    async applyCqBlueprint(versionId) {
      const version = this.getVersion(versionId);
      if (!SAT.canEditAssessmentVersion(version)) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이미 공개된 버전은 수정할 수 없습니다.',
        }, 'assessmentQuestions.blueprint');
      }
      const assessment = this.getAssessment(version.assessmentId);
      const questions = SAT.cloudQuestionsFromCqBlueprint(assessment?.level);
      if (!questions) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이 레벨에는 불러올 표준 문항 구성이 없습니다.',
        }, 'assessmentQuestions.blueprint');
      }
      const existing = await this._ensureQuestions(versionId);
      if (existing.length) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이미 문항이 있는 초안에는 표준 구성을 덮어쓰지 않습니다. 빈 초안에서만 불러오세요.',
        }, 'assessmentQuestions.blueprint');
      }
      const created = await this._repo().createAssessmentQuestions(versionId, questions);
      this.questionsByVersionId[versionId] = created.map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
      if (typeof this._repo().updateDraftAssessmentVersion === 'function') {
        try {
          const updated = await this._repo().updateDraftAssessmentVersion(versionId, {
            choiceCount: SAT.DEFAULT_CHOICE_COUNT,
          });
          this._replaceVersion(updated);
        } catch {
          /* unpatched remote keeps default 4 */
        }
      }
      return this.questionsByVersionId[versionId];
    }

    _replaceVersion(row) {
      if (!row?.id) return;
      const idx = this.versions.findIndex((v) => v.id === row.id);
      if (idx >= 0) this.versions[idx] = row;
      else this.versions.push(row);
    }

    async setDraftChoiceCount(versionId, choiceCount) {
      const version = this.getVersion(versionId);
      if (!SAT.canEditAssessmentVersion(version)) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이미 공개된 버전은 수정할 수 없습니다.',
        }, 'assessmentVersions.choiceCount');
      }
      const next = SAT.normalizeChoiceCount(choiceCount);
      if (next === 4) {
        const questions = await this._ensureQuestions(versionId);
        const lower = SAT.canLowerChoiceCountToFour(questions);
        if (!lower.ok) {
          throw SAT.createRepositoryError({
            code: 'VALIDATION',
            message: lower.error,
          }, 'assessmentVersions.choiceCount');
        }
      }
      const updated = await this._repo().updateDraftAssessmentVersion(versionId, { choiceCount: next });
      this._replaceVersion(updated);
      return updated;
    }

    async createBlankQuestions(versionId, count, { choiceCount } = {}) {
      const version = this.getVersion(versionId);
      if (!SAT.canEditAssessmentVersion(version)) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이미 공개된 버전은 수정할 수 없습니다.',
        }, 'assessmentQuestions.createBlank');
      }
      const assessment = this.getAssessment(version.assessmentId);
      if (!SAT.canMutateDraftQuestionCount(assessment, version)) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '표준 CQ 문항 수는 바꿀 수 없습니다.',
        }, 'assessmentQuestions.createBlank');
      }
      const existing = await this._ensureQuestions(versionId);
      if (existing.length) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이미 문항이 있는 초안입니다. 문항을 하나씩 추가하세요.',
        }, 'assessmentQuestions.createBlank');
      }
      const countCheck = SAT.validateManualQuestionCount(count);
      if (!countCheck.ok) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: countCheck.error,
        }, 'assessmentQuestions.createBlank');
      }
      const nextChoice = SAT.normalizeChoiceCount(choiceCount ?? version.choiceCount);
      if (nextChoice !== SAT.normalizeChoiceCount(version.choiceCount)) {
        await this.setDraftChoiceCount(versionId, nextChoice);
      }
      const blanks = SAT.buildBlankCloudQuestions(countCheck.count);
      const created = await this._repo().createAssessmentQuestions(versionId, blanks);
      this.questionsByVersionId[versionId] = created.map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
      return this.questionsByVersionId[versionId];
    }

    async addBlankDraftQuestion(versionId) {
      const version = this.getVersion(versionId);
      if (!SAT.canEditAssessmentVersion(version)) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이미 공개된 버전은 수정할 수 없습니다.',
        }, 'assessmentQuestions.addOne');
      }
      const assessment = this.getAssessment(version.assessmentId);
      if (!SAT.canMutateDraftQuestionCount(assessment, version)) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '표준 CQ 문항 수는 바꿀 수 없습니다.',
        }, 'assessmentQuestions.addOne');
      }
      const existing = await this._ensureQuestions(versionId);
      if (existing.length >= SAT.MAX_MANUAL_QUESTIONS) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '문항 수는 1–100 사이여야 합니다.',
        }, 'assessmentQuestions.addOne');
      }
      const nextNumber = existing.reduce((max, q) => Math.max(max, Number(q.number) || 0), 0) + 1;
      const blank = SAT.normalizeCloudQuestion({
        number: nextNumber,
        gradingType: SAT.GRADING_TYPE_CHOICE,
        correctAnswer: '',
        points: 1,
        majorCategory: '',
        middleCategory: '',
        note: '',
      }, nextNumber);
      const created = await this._repo().createAssessmentQuestion({
        ...blank,
        assessmentVersionId: versionId,
      });
      const rows = [...existing, created]
        .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
        .map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
      this.questionsByVersionId[versionId] = rows;
      return rows;
    }

    async deleteDraftQuestion(versionId, questionId) {
      const version = this.getVersion(versionId);
      if (!SAT.canEditAssessmentVersion(version)) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이미 공개된 버전은 수정할 수 없습니다.',
        }, 'assessmentQuestions.delete');
      }
      const assessment = this.getAssessment(version.assessmentId);
      if (!SAT.canMutateDraftQuestionCount(assessment, version)) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '표준 CQ 문항은 삭제할 수 없습니다.',
        }, 'assessmentQuestions.delete');
      }
      const existing = await this._ensureQuestions(versionId);
      const remaining = existing.filter((q) => q.id !== questionId);
      if (remaining.length === existing.length) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '삭제할 문항을 찾을 수 없습니다.',
        }, 'assessmentQuestions.delete');
      }
      await this._repo().deleteAssessmentQuestion(questionId);
      const renumbered = SAT.renumberCloudQuestions(remaining);
      const saved = [];
      for (const q of renumbered) {
        if (q.id && Number(existing.find((row) => row.id === q.id)?.number) !== q.number) {
          saved.push(await this._repo().updateAssessmentQuestion(q.id, q));
        } else {
          saved.push(q);
        }
      }
      this.questionsByVersionId[versionId] = saved.map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
      return this.questionsByVersionId[versionId];
    }

    async saveDraftQuestions(versionId, questions) {
      const version = this.getVersion(versionId);
      if (!SAT.canEditAssessmentVersion(version)) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '이미 공개된 버전은 수정할 수 없습니다.',
        }, 'assessmentQuestions.saveDraft');
      }
      const dups = SAT.duplicateNumbers(questions);
      if (dups.length) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: `문항 번호가 중복됩니다: ${dups.join(', ')}`,
        }, 'assessmentQuestions.saveDraft');
      }
      const choiceCount = SAT.resolveChoiceCount({ version, questions });
      const check = SAT.validateChoiceAnswers(questions, { choiceCount, requireFilled: false });
      if (!check.ok) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: check.errors[0] || `정답은 1–${choiceCount}만 저장할 수 있습니다.`,
        }, 'assessmentQuestions.saveDraft');
      }
      const repo = this._repo();
      const saved = [];
      for (const raw of questions || []) {
        const q = SAT.normalizeCloudQuestion(raw, raw.number);
        if (q.id) {
          saved.push(await repo.updateAssessmentQuestion(q.id, q));
        } else {
          saved.push(await repo.createAssessmentQuestion({
            ...q,
            assessmentVersionId: versionId,
          }));
        }
      }
      this.questionsByVersionId[versionId] = saved.map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
      return this.questionsByVersionId[versionId];
    }

    async publishVersion(versionId) {
      const version = this.getVersion(versionId);
      const assessment = this.getAssessment(version?.assessmentId);
      const questions = await this._ensureQuestions(versionId);
      const choiceCount = SAT.resolveChoiceCount({ version, questions });
      const check = SAT.validateManualPublish(questions, { choiceCount });
      if (!check.ok) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: check.errors[0] || '공개하려면 정답·배점을 확인해주세요.',
        }, 'assessmentVersions.publish');
      }
      const row = await this._repo().publishAssessmentVersion(versionId);
      await this.refresh();
      await this.loadVersionQuestions(versionId);
      return row;
    }

    async deleteUnusedAssessment(assessmentId) {
      if (!this.canAuthor()) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '문제집 삭제는 관리자만 할 수 있습니다.',
        }, 'assessments.deleteUnused');
      }
      const assessment = this.getAssessment(assessmentId);
      const versions = this.versionsFor(assessmentId);
      const reason = SAT.unusedAssessmentDeleteReason(assessment, versions, this.examInstances);
      if (reason) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: reason,
        }, 'assessments.deleteUnused');
      }
      await this._repo().deleteUnusedAssessment(assessmentId);
      delete this.questionsByVersionId[assessmentId];
      versions.forEach((v) => {
        delete this.questionsByVersionId[v.id];
      });
      await this.refresh();
    }

    async forceDeleteAssessment(assessmentId) {
      if (!this.canForceDelete()) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '강제 삭제는 시스템 관리자만 할 수 있습니다.',
        }, 'assessments.forceDelete');
      }
      const assessment = this.getAssessment(assessmentId);
      if (!assessment?.id) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '문제집을 찾을 수 없습니다.',
        }, 'assessments.forceDelete');
      }
      const versions = this.versionsFor(assessmentId);
      const summary = await this._repo().forceDeleteAssessment(assessmentId);
      versions.forEach((v) => {
        delete this.questionsByVersionId[v.id];
      });
      await this.refresh();
      return summary;
    }

    async archiveVersion(versionId) {
      const row = await this._repo().archiveAssessmentVersion(versionId);
      await this.refresh();
      return row;
    }

    async assignToClass({ classId, assessmentVersionId, administeredDate, classes }) {
      const createdBy = this.currentUserId();
      const version = this.getVersion(assessmentVersionId);
      const assessment = this.getAssessment(version?.assessmentId);
      const cls = (classes || []).find((c) => c.id === classId);
      const pre = SAT.canAssignVersionToClass(assessment, version, cls);
      if (!pre.ok) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: pre.reason,
        }, 'examInstances.assign');
      }
      const row = await this._repo().createExamInstance({
        classId,
        assessmentVersionId,
        administeredDate,
        createdBy,
      });
      await this.refresh();
      return row;
    }

    async updateInstanceDate(id, administeredDate) {
      const patch = SAT.examInstanceWritablePatch({ administeredDate, classId: 'ignored', assessmentVersionId: 'ignored' });
      const row = await this._repo().updateAdministeredDate(id, patch.administeredDate);
      await this.refresh();
      return row;
    }

    async deleteInstance(id) {
      await this._repo().deleteExamInstance(id);
      await this.refresh();
    }
  }

  SAT.CloudAssessmentStore = CloudAssessmentStore;

  SAT.getCloudAssessmentStore = function getCloudAssessmentStore() {
    if (!SAT._cloudAssessmentStore) {
      SAT._cloudAssessmentStore = new CloudAssessmentStore(
        SAT.createCloudRepository(),
        SAT.getAuthManager()
      );
    }
    return SAT._cloudAssessmentStore;
  };

  SAT.clearCloudAssessmentStore = function clearCloudAssessmentStore() {
    if (SAT._cloudAssessmentStore) SAT._cloudAssessmentStore.clear();
  };
})(window.SAT = window.SAT || {});
