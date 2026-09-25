/**
 * In-memory Cloud Result session for P5C-1.
 * Does not read legacy localStorage results/exams/questions/categoryStats.
 */
(function (SAT) {
  const STATES = SAT.CLOUD_UI_STATES;

  class CloudResultStore {
    constructor(cloudRepo, authManager) {
      this.cloud = cloudRepo || null;
      this.auth = authManager || null;
      this.runtime = 'cloud-result';
      this.status = STATES.LOADING;
      this.error = null;
      this.results = [];
      this._generation = 0;
    }

    _repo() {
      return this.cloud || SAT.createCloudRepository();
    }

    clear() {
      this._generation += 1;
      this.status = STATES.LOADING;
      this.error = null;
      this.results = [];
    }

    async refresh() {
      const gen = this._generation + 1;
      this._generation = gen;
      this.status = STATES.LOADING;
      this.error = null;
      try {
        const rows = await this._repo().listResults();
        if (gen !== this._generation) return this;
        this.results = rows || [];
        this.status = STATES.READY;
        this.error = null;
      } catch (err) {
        if (gen !== this._generation) return this;
        this.status = STATES.ERROR;
        this.error = err;
      }
      return this;
    }

    resultsForInstance(examInstanceId) {
      return (this.results || []).filter((row) => row.examInstanceId === examInstanceId);
    }

    resultsForStudent(studentId) {
      return (this.results || []).filter((row) => row.studentId === studentId);
    }

    getResultForStudentInstance(studentId, examInstanceId) {
      return SAT.findResultForStudentInstance(this.results, studentId, examInstanceId);
    }

    _replaceResult(row) {
      if (!row?.id) return;
      const next = (this.results || []).filter((item) => (
        item.id !== row.id
        && !(item.examInstanceId === row.examInstanceId && item.studentId === row.studentId)
      ));
      next.push(row);
      this.results = next;
    }

    async reloadOneResult({ studentId, examInstanceId, resultId } = {}) {
      const repo = this._repo();
      let remote = null;
      if (resultId && typeof repo.getResult === 'function') {
        remote = await repo.getResult(resultId);
      }
      if (!remote && studentId && examInstanceId && typeof repo.getResultForStudentInstance === 'function') {
        remote = await repo.getResultForStudentInstance(studentId, examInstanceId);
      }
      if (!remote) {
        throw SAT.createRepositoryError({
          code: SAT.RepositoryErrorCodes.NOT_FOUND,
          message: '최신 저장본을 찾지 못했습니다. 작성 중인 답안은 그대로 둡니다.',
        }, 'results.reloadOne');
      }
      this._replaceResult(remote);
      return remote;
    }

    async saveStudentAnswers({
      examInstanceId,
      studentId,
      answers,
      teacherComment,
      questions,
      draftBaseUpdatedAt,
    } = {}) {
      SAT.assertAnswersUseQuestionIds(answers, questions);
      const payload = {
        answers: SAT.buildCloudResultAnswers(questions, answers),
        teacherComment: String(teacherComment || ''),
        submittedAt: SAT.nowIso(),
      };
      const existing = this.getResultForStudentInstance(studentId, examInstanceId);
      const repo = this._repo();
      const hasPinnedBase = Object.prototype.hasOwnProperty.call(arguments[0] || {}, 'draftBaseUpdatedAt');
      const baseUpdatedAt = hasPinnedBase
        ? (draftBaseUpdatedAt || null)
        : (existing?.updatedAt || null);
      let remote = null;
      if (existing?.id && typeof repo.getResult === 'function') {
        remote = await repo.getResult(existing.id);
      } else if (typeof repo.getResultForStudentInstance === 'function') {
        remote = await repo.getResultForStudentInstance(studentId, examInstanceId);
      } else {
        remote = existing || null;
      }
      const staleConflict = () => (
        SAT.createResultStaleConflictError
          ? SAT.createResultStaleConflictError()
          : SAT.createRepositoryError({
            code: 'STALE',
            message: SAT.RESULT_STALE_MESSAGE || '다른 화면에서 이미 저장된 답이 있습니다. 다시 불러온 뒤 저장하세요.',
          }, 'results.update')
      );
      if (hasPinnedBase && !baseUpdatedAt) {
        if (existing || remote) throw staleConflict();
        const created = await repo.createResult({
          examInstanceId,
          studentId,
          ...payload,
        });
        this._replaceResult(created);
        return created;
      }
      if (!existing && remote) throw staleConflict();
      if (existing && !remote) throw staleConflict();
      if (SAT.isDraftBaseStaleAgainstRemote?.(baseUpdatedAt, remote || existing)) {
        throw staleConflict();
      }
      const target = remote || existing;
      const row = target
        ? await repo.updateResult(target.id, payload, {
          expectedUpdatedAt: baseUpdatedAt || undefined,
        })
        : await repo.createResult({
          examInstanceId,
          studentId,
          ...payload,
        });
      this._replaceResult(row);
      return row;
    }
  }

  SAT.CloudResultStore = CloudResultStore;

  SAT.getCloudResultStore = function getCloudResultStore() {
    if (!SAT._cloudResultStore) {
      SAT._cloudResultStore = new CloudResultStore(
        SAT.createCloudRepository(),
        SAT.getAuthManager()
      );
    }
    return SAT._cloudResultStore;
  };

  SAT.clearCloudResultStore = function clearCloudResultStore() {
    if (SAT._cloudResultStore) SAT._cloudResultStore.clear();
  };
})(window.SAT = window.SAT || {});
