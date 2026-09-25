/**
 * Async CloudRepository — P4 domain only.
 * P4B authenticates against Supabase, but P5 will switch academic UI
 * operations from LocalStorageRepository to CloudRepository.
 *
 * Keep snake_case inside this file. Callers receive camelCase rows.
 * Never write Result derived scalars (correct_count / points / percentage).
 */
(function (SAT) {
  function mutationRow(data) {
    if (Array.isArray(data)) return data[0] || null;
    return data || null;
  }

  class CloudRepository {
    constructor(client) {
      this.client = client || null;
    }

    _db() {
      return this.client || SAT.getSupabaseClient();
    }

    _throw(error, context) {
      throw SAT.createRepositoryError(error, context);
    }

    async _rows(query, context) {
      const { data, error } = await query;
      if (error) this._throw(error, context);
      return (data || []).map(SAT.mapDbRowToApp);
    }

    async _maybe(query, context) {
      const { data, error } = await query;
      if (error) this._throw(error, context);
      return data ? SAT.mapDbRowToApp(data) : null;
    }

    async _one(query, context) {
      const row = await this._maybe(query, context);
      if (!row) {
        this._throw({
          code: 'NOT_FOUND',
          message: 'Row not found or not visible under current RLS.',
        }, context);
      }
      return row;
    }

    async _write(query, context) {
      const { data, error } = await query;
      if (error) this._throw(error, context);
      const row = mutationRow(data);
      if (!row) {
        this._throw({
          code: 'MUTATION_EMPTY',
          message: 'No visible row was changed (not found, RLS, or no-op).',
        }, context);
      }
      return SAT.mapDbRowToApp(row);
    }

    async _rpc(name, args, context) {
      const { data, error } = await this._db().rpc(name, args);
      if (error) this._throw(error, context);
      if (data == null) {
        this._throw({
          code: 'NOT_FOUND',
          message: `${name} returned no row.`,
        }, context);
      }
      return SAT.mapDbRowToApp(Array.isArray(data) ? data[0] : data);
    }

    // ----- profiles -----

    async listProfiles() {
      return this._rows(
        this._db()
          .from('profiles')
          .select('id, display_name, email, role, active')
          .order('display_name'),
        'profiles.list'
      );
    }

    async transferStudentToClass({ studentId, newClassId, newStartDate }) {
      return this._rpc('transfer_student_to_class', {
        p_student_id: studentId,
        p_new_class_id: newClassId,
        p_new_start_date: newStartDate,
      }, 'students.transfer');
    }

    async getCurrentProfile() {
      const { data: sessionData, error: sessionError } = await this._db().auth.getSession();
      if (sessionError) this._throw(sessionError, 'profiles.getCurrent');
      const userId = sessionData.session?.user?.id;
      if (!userId) return null;
      return this.getProfileById(userId);
    }

    async getProfileById(id) {
      return this._maybe(
        this._db()
          .from('profiles')
          .select('id, email, role, active, can_edit_curriculum, display_name')
          .eq('id', id)
          .maybeSingle(),
        'profiles.getById'
      );
    }

    // ----- terms -----

    async listTerms() {
      return this._rows(
        this._db().from('terms').select('*').order('start_date', { ascending: false }),
        'terms.list'
      );
    }

    async getCurrentTerm() {
      return this._maybe(
        this._db().from('terms').select('*').eq('is_current', true).maybeSingle(),
        'terms.getCurrent'
      );
    }

    async createTerm(data) {
      const payload = SAT.mapAppPatchToDb(data, ['name', 'startDate', 'endDate', 'isCurrent']);
      return this._write(
        this._db().from('terms').insert(payload).select(),
        'terms.create'
      );
    }

    async updateTerm(id, patch) {
      const payload = SAT.mapAppPatchToDb(patch, ['name', 'startDate', 'endDate']);
      return this._write(
        this._db().from('terms').update(payload).eq('id', id).select(),
        'terms.update'
      );
    }

    async setCurrentTerm(id) {
      return this._rpc('set_current_term', { p_term_id: id }, 'terms.setCurrent');
    }

    // ----- classes -----

    async listClasses({ termId, includeArchived } = {}) {
      let q = this._db().from('classes').select('*');
      if (termId) q = q.eq('term_id', termId);
      if (!includeArchived) q = q.eq('archived', false);
      return this._rows(q.order('name'), 'classes.list');
    }

    async getClass(id) {
      return this._one(
        this._db().from('classes').select('*').eq('id', id).maybeSingle(),
        'classes.get'
      );
    }

    async createClass(data) {
      const payload = SAT.mapAppPatchToDb(data, [
        'termId',
        'ownerId',
        'name',
        'level',
        'archived',
      ]);
      return this._write(
        this._db().from('classes').insert(payload).select(),
        'classes.create'
      );
    }

    async updateClass(id, patch) {
      const payload = SAT.mapAppPatchToDb(patch, ['name', 'archived']);
      return this._write(
        this._db().from('classes').update(payload).eq('id', id).select(),
        'classes.update'
      );
    }

    async deleteClass(id) {
      return this._write(
        this._db().from('classes').delete().eq('id', id).select('id, name, owner_id'),
        'classes.delete'
      );
    }

    // ----- students -----

    async listStudents({ includeInactive } = {}) {
      let q = this._db().from('students').select('*');
      if (!includeInactive) q = q.eq('active', true);
      return this._rows(q.order('name'), 'students.list');
    }

    async getStudent(id) {
      return this._one(
        this._db().from('students').select('*').eq('id', id).maybeSingle(),
        'students.get'
      );
    }

    async createStudent(data) {
      const payload = SAT.mapAppPatchToDb(data, [
        'ownerId',
        'name',
        'englishName',
        'active',
      ]);
      delete payload.current_class_id;
      return this._write(
        this._db().from('students').insert(payload).select(),
        'students.create'
      );
    }

    async updateStudent(id, patch) {
      const payload = SAT.mapAppPatchToDb(patch, ['name', 'englishName', 'active']);
      return this._write(
        this._db().from('students').update(payload).eq('id', id).select(),
        'students.update'
      );
    }

    async deleteStudent(id) {
      return this._write(
        this._db().from('students').delete().eq('id', id).select('id, name, owner_id'),
        'students.delete'
      );
    }

    // ----- enrollments -----

    async listEnrollments({ studentId, classId, openOnly } = {}) {
      let q = this._db().from('enrollments').select('*');
      if (studentId) q = q.eq('student_id', studentId);
      if (classId) q = q.eq('class_id', classId);
      if (openOnly) q = q.is('end_date', null);
      return this._rows(q.order('start_date', { ascending: false }), 'enrollments.list');
    }

    async getOpenEnrollment(studentId) {
      return this._maybe(
        this._db()
          .from('enrollments')
          .select('*')
          .eq('student_id', studentId)
          .is('end_date', null)
          .maybeSingle(),
        'enrollments.getOpen'
      );
    }

    async createEnrollment(data) {
      const payload = SAT.mapAppPatchToDb(data, [
        'studentId',
        'classId',
        'startDate',
        'endDate',
      ]);
      return this._write(
        this._db().from('enrollments').insert(payload).select(),
        'enrollments.create'
      );
    }

    async updateEnrollmentDates(id, patch) {
      const payload = SAT.mapAppPatchToDb(patch, ['startDate', 'endDate']);
      return this._write(
        this._db().from('enrollments').update(payload).eq('id', id).select(),
        'enrollments.updateDates'
      );
    }

    async deleteEnrollment(id) {
      return this._write(
        this._db().from('enrollments').delete().eq('id', id).select('id, student_id, class_id'),
        'enrollments.delete'
      );
    }

    // ----- assessments -----

    async listAssessments({ activeOnly } = {}) {
      let q = this._db().from('assessments').select('*');
      if (activeOnly) q = q.eq('active', true);
      return this._rows(q.order('title'), 'assessments.list');
    }

    async getAssessment(id) {
      return this._one(
        this._db().from('assessments').select('*').eq('id', id).maybeSingle(),
        'assessments.get'
      );
    }

    async createAssessment(data) {
      const payload = SAT.mapAppPatchToDb(data, [
        'title',
        'assessmentType',
        'level',
        'lessonStart',
        'lessonEnd',
        'active',
        'createdBy',
      ]);
      return this._write(
        this._db().from('assessments').insert(payload).select(),
        'assessments.create'
      );
    }

    async updateAssessment(id, patch) {
      const payload = SAT.mapAppPatchToDb(patch, [
        'title',
        'assessmentType',
        'level',
        'lessonStart',
        'lessonEnd',
        'active',
      ]);
      return this._write(
        this._db().from('assessments').update(payload).eq('id', id).select(),
        'assessments.update'
      );
    }

    async archiveAssessment(id) {
      return this.updateAssessment(id, { active: false });
    }

    // ----- assessment versions -----

    async listAssessmentVersions(assessmentId) {
      return this._rows(
        this._db()
          .from('assessment_versions')
          .select('*')
          .eq('assessment_id', assessmentId)
          .order('version_number', { ascending: false }),
        'assessmentVersions.list'
      );
    }

    async getAssessmentVersion(id) {
      return this._one(
        this._db().from('assessment_versions').select('*').eq('id', id).maybeSingle(),
        'assessmentVersions.get'
      );
    }

    async createDraftAssessmentVersion(data) {
      let versionNumber = data?.versionNumber;
      if (versionNumber == null && data?.assessmentId) {
        const existing = await this.listAssessmentVersions(data.assessmentId);
        versionNumber = existing.reduce((max, row) => Math.max(max, row.versionNumber || 0), 0) + 1;
      }
      const allowed = ['assessmentId', 'versionNumber', 'status', 'createdBy'];
      if (data?.choiceCount != null) allowed.push('choiceCount');
      const payload = SAT.mapAppPatchToDb(
        { ...data, versionNumber, status: 'draft' },
        allowed
      );
      try {
        return await this._write(
          this._db().from('assessment_versions').insert(payload).select(),
          'assessmentVersions.createDraft'
        );
      } catch (err) {
        if (payload.choice_count != null && /choice_count/i.test(String(err?.message || err?.details || ''))) {
          if (Number(payload.choice_count) === 5) {
            this._throw({
              code: 'VALIDATION',
              message: '5지선다를 저장하려면 운영자가 P9.95 SQL PATCH를 적용해야 합니다.',
            }, 'assessmentVersions.createDraft');
          }
          delete payload.choice_count;
          return this._write(
            this._db().from('assessment_versions').insert(payload).select(),
            'assessmentVersions.createDraft'
          );
        }
        throw err;
      }
    }

    async updateDraftAssessmentVersion(id, patch) {
      const payload = SAT.mapAppPatchToDb(patch, ['choiceCount']);
      return this._write(
        this._db()
          .from('assessment_versions')
          .update(payload)
          .eq('id', id)
          .eq('status', 'draft')
          .select(),
        'assessmentVersions.updateDraft'
      );
    }

    async deleteUnusedAssessment(id) {
      return this._rpc(
        'delete_unused_assessment',
        { p_assessment_id: id },
        'assessments.deleteUnused'
      );
    }

    async forceDeleteAssessment(id) {
      return this._rpc(
        'force_delete_assessment',
        { p_assessment_id: id },
        'assessments.forceDelete'
      );
    }

    async publishAssessmentVersion(id) {
      return this._rpc(
        'publish_assessment_version',
        { p_version_id: id },
        'assessmentVersions.publish'
      );
    }

    async archiveAssessmentVersion(id) {
      return this._write(
        this._db()
          .from('assessment_versions')
          .update({ status: 'archived' })
          .eq('id', id)
          .select(),
        'assessmentVersions.archive'
      );
    }

    // ----- questions -----

    async listAssessmentQuestions(versionId) {
      return this._rows(
        this._db()
          .from('assessment_questions')
          .select('*')
          .eq('assessment_version_id', versionId)
          .order('number'),
        'assessmentQuestions.list'
      );
    }

    async listQuestionsForVersions(versionIds) {
      const ids = [...new Set((versionIds || []).filter(Boolean))];
      if (!ids.length) return [];
      const out = [];
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const rows = await this._rows(
          this._db()
            .from('assessment_questions')
            .select('*')
            .in('assessment_version_id', chunk)
            .order('number'),
          'assessmentQuestions.listForVersions'
        );
        out.push(...rows);
      }
      return out;
    }

    async listExamInstancesByIds(ids) {
      const list = [...new Set((ids || []).filter(Boolean))];
      if (!list.length) return [];
      const out = [];
      for (let i = 0; i < list.length; i += 50) {
        const chunk = list.slice(i, i + 50);
        const rows = await this._rows(
          this._db().from('exam_instances').select('*').in('id', chunk).order('administered_date', { ascending: false }),
          'examInstances.listByIds'
        );
        out.push(...rows);
      }
      return out;
    }

    _questionWritePayload(data, versionId) {
      const gradingType = data?.gradingType === 'manual_binary' ? 'manual_binary' : 'choice';
      return SAT.mapAppPatchToDb({
        assessmentVersionId: versionId || data?.assessmentVersionId,
        number: data?.number,
        gradingType,
        correctAnswer: gradingType === 'manual_binary' ? '1' : data?.correctAnswer,
        points: data?.points,
        majorCategory: data?.majorCategory,
        middleCategory: data?.middleCategory,
        note: data?.note,
      }, [
        'assessmentVersionId',
        'number',
        'gradingType',
        'correctAnswer',
        'points',
        'majorCategory',
        'middleCategory',
        'note',
      ]);
    }

    async createAssessmentQuestion(data) {
      const payload = this._questionWritePayload(data);
      return this._write(
        this._db().from('assessment_questions').insert(payload).select(),
        'assessmentQuestions.create'
      );
    }

    async createAssessmentQuestions(versionId, questions) {
      const rows = (questions || []).map((q, i) => this._questionWritePayload({
        ...q,
        number: q.number || i + 1,
      }, versionId));
      if (!rows.length) {
        this._throw({
          code: 'VALIDATION',
          message: '생성할 문항이 없습니다.',
        }, 'assessmentQuestions.createBatch');
      }
      const { data, error } = await this._db().from('assessment_questions').insert(rows).select();
      if (error) this._throw(error, 'assessmentQuestions.createBatch');
      return (data || []).map(SAT.mapDbRowToApp);
    }

    async listAllAssessmentVersions() {
      return this._rows(
        this._db()
          .from('assessment_versions')
          .select('*')
          .order('version_number', { ascending: false }),
        'assessmentVersions.listAll'
      );
    }

    async deleteDraftAssessmentVersion(id) {
      return this._write(
        this._db().from('assessment_versions').delete().eq('id', id).select('id, status'),
        'assessmentVersions.deleteDraft'
      );
    }

    async updateAssessmentQuestion(id, patch) {
      const merged = { ...patch };
      if (merged.gradingType === 'manual_binary') {
        merged.correctAnswer = '1';
      }
      const payload = SAT.mapAppPatchToDb(merged, [
        'number',
        'gradingType',
        'correctAnswer',
        'points',
        'majorCategory',
        'middleCategory',
        'note',
      ]);
      return this._write(
        this._db().from('assessment_questions').update(payload).eq('id', id).select(),
        'assessmentQuestions.update'
      );
    }

    async deleteAssessmentQuestion(id) {
      return this._write(
        this._db().from('assessment_questions').delete().eq('id', id).select('id, number'),
        'assessmentQuestions.delete'
      );
    }

    // ----- exam instances -----

    async listExamInstances({ classId, assessmentVersionId } = {}) {
      let q = this._db().from('exam_instances').select('*');
      if (classId) q = q.eq('class_id', classId);
      if (assessmentVersionId) q = q.eq('assessment_version_id', assessmentVersionId);
      return this._rows(q.order('administered_date', { ascending: false }), 'examInstances.list');
    }

    async getExamInstance(id) {
      return this._one(
        this._db().from('exam_instances').select('*').eq('id', id).maybeSingle(),
        'examInstances.get'
      );
    }

    async createExamInstance(data) {
      const payload = SAT.mapAppPatchToDb(data, [
        'classId',
        'assessmentVersionId',
        'administeredDate',
        'createdBy',
      ]);
      return this._write(
        this._db().from('exam_instances').insert(payload).select(),
        'examInstances.create'
      );
    }

    async updateAdministeredDate(id, date) {
      return this._write(
        this._db()
          .from('exam_instances')
          .update({ administered_date: date })
          .eq('id', id)
          .select(),
        'examInstances.updateDate'
      );
    }

    async deleteExamInstance(id) {
      return this._write(
        this._db().from('exam_instances').delete().eq('id', id).select('id, class_id'),
        'examInstances.delete'
      );
    }

    // ----- results -----

    async listResults({ examInstanceId, studentId } = {}) {
      let q = this._db().from('results').select('*');
      if (examInstanceId) q = q.eq('exam_instance_id', examInstanceId);
      if (studentId) q = q.eq('student_id', studentId);
      return this._rows(q.order('submitted_at', { ascending: false }), 'results.list');
    }

    async getResult(id) {
      return this._one(
        this._db().from('results').select('*').eq('id', id).maybeSingle(),
        'results.get'
      );
    }

    async getResultForStudentInstance(studentId, examInstanceId) {
      return this._maybe(
        this._db()
          .from('results')
          .select('*')
          .eq('student_id', studentId)
          .eq('exam_instance_id', examInstanceId)
          .maybeSingle(),
        'results.getForStudentInstance'
      );
    }

    async createResult(data) {
      const payload = SAT.assertNoResultScalarWrites(SAT.pickResultInsertPayload(data));
      return this._write(
        this._db().from('results').insert(payload).select(),
        'results.create'
      );
    }

    async updateResult(id, patch, options = {}) {
      const payload = SAT.assertNoResultScalarWrites(SAT.pickResultUpdatePayload(patch));
      let query = this._db().from('results').update(payload).eq('id', id);
      if (options.expectedUpdatedAt) {
        query = query.eq('updated_at', options.expectedUpdatedAt);
      }
      try {
        return await this._write(query.select(), 'results.update');
      } catch (err) {
        if (options.expectedUpdatedAt && err?.code === SAT.RepositoryErrorCodes.MUTATION_EMPTY) {
          throw await this._classifyEmptyResultUpdate(id, options.expectedUpdatedAt);
        }
        throw err;
      }
    }

    async _classifyEmptyResultUpdate(id, baseUpdatedAt) {
      try {
        const remote = await this.getResult(id);
        const kind = SAT.classifyEmptyResultUpdate
          ? SAT.classifyEmptyResultUpdate({ baseUpdatedAt, remote })
          : SAT.RepositoryErrorCodes.STALE;
        if (kind === SAT.RepositoryErrorCodes.WRITE_FORBIDDEN && SAT.createResultWriteForbiddenError) {
          throw SAT.createResultWriteForbiddenError();
        }
        if (kind === SAT.RepositoryErrorCodes.NOT_FOUND) {
          this._throw({
            code: 'NOT_FOUND',
            message: 'Row not found or not visible under current RLS.',
          }, 'results.get');
        }
        throw SAT.createResultStaleConflictError();
      } catch (inner) {
        if (
          inner?.code === SAT.RepositoryErrorCodes.STALE
          || inner?.code === SAT.RepositoryErrorCodes.WRITE_FORBIDDEN
          || inner?.code === SAT.RepositoryErrorCodes.NOT_FOUND
        ) {
          throw inner;
        }
        throw SAT.createResultStaleConflictError();
      }
    }

    async deleteResult(id) {
      return this._write(
        this._db().from('results').delete().eq('id', id).select('id, exam_instance_id, student_id'),
        'results.delete'
      );
    }
  }

  SAT.CloudRepository = CloudRepository;
  SAT.createCloudRepository = function createCloudRepository(client) {
    return new CloudRepository(client);
  };
})(window.SAT = window.SAT || {});
