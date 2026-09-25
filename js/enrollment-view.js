/**
 * P5A view-model helpers.
 * student.classId is derived from the open Enrollment.
 * It is NOT students.current_class_id and must not be persisted.
 */
(function (SAT) {
  SAT.CLOUD_UI_STATES = {
    LOADING: 'loading',
    READY: 'ready',
    EMPTY: 'empty',
    ERROR: 'error',
  };

  SAT.DEFERRED_CLOUD_EXAM_MESSAGE = '시험/성취도 데이터의 클라우드 전환은 다음 단계에서 연결됩니다.';
  SAT.LEGACY_LOCAL_NOTICE = '기존 로컬 데이터는 아직 이관되지 않았습니다.';

  SAT.normalizeCloudUiState = function normalizeCloudUiState(status) {
    const states = SAT.CLOUD_UI_STATES;
    if (status === states.LOADING || status === states.READY || status === states.EMPTY || status === states.ERROR) {
      return status;
    }
    return states.ERROR;
  };

  /**
   * P5A dashboard metrics. Exam/result counts stay 0 so legacy local
   * exams are never mixed into cloud analytics.
   */
  SAT.cloudDashboardCounts = function cloudDashboardCounts(view) {
    const students = view?.students || [];
    return {
      terms: Array.isArray(view?.terms) ? view.terms.length : 0,
      classes: Array.isArray(view?.classes) ? view.classes.length : 0,
      students: students.filter((s) => s.active !== false).length,
      enrollments: Array.isArray(view?.enrollments) ? view.enrollments.length : 0,
      exams: 0,
      results: 0,
    };
  };

  SAT.isoDateLocal = function isoDateLocal(date) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  SAT.addIsoDays = function addIsoDays(iso, days) {
    const parts = String(iso || '').split('-').map(Number);
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return '';
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    dt.setDate(dt.getDate() + Number(days || 0));
    return SAT.isoDateLocal(dt);
  };

  SAT.computeTransferEnrollmentDates = function computeTransferEnrollmentDates(openStartDate, newStartDate) {
    if (!newStartDate) {
      return { rejected: true, reason: 'missing-start', message: '새 반 시작일을 입력하세요.' };
    }
    if (openStartDate && String(openStartDate) >= String(newStartDate)) {
      return {
        rejected: true,
        reason: 'same-day-or-before',
        message: '새 반 시작일은 현재 재원 시작일보다 뒤여야 합니다.',
      };
    }
    return {
      rejected: false,
      oldEndDate: openStartDate ? SAT.addIsoDays(newStartDate, -1) : null,
      newStartDate,
    };
  };

  SAT.resolveOpenEnrollment = function resolveOpenEnrollment(enrollments, studentId) {
    const rows = (enrollments || []).filter((e) => e.studentId === studentId);
    const open = rows.filter((e) => e.endDate == null || e.endDate === '');
    if (open.length === 1) return open[0];
    if (open.length > 1) {
      return [...open].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))[0];
    }
    return null;
  };

  SAT.deriveStudentClassId = function deriveStudentClassId(enrollments, studentId) {
    const open = SAT.resolveOpenEnrollment(enrollments, studentId);
    return open?.classId || null;
  };

  SAT.composeStudentsWithEnrollment = function composeStudentsWithEnrollment(students, enrollments) {
    return (students || []).map((student) => {
      const { currentClassId, classId: _ignored, ...rest } = student;
      return {
        ...rest,
        classId: SAT.deriveStudentClassId(enrollments, student.id),
      };
    });
  };

  SAT.inspectLegacyLocalAcademicData = function inspectLegacyLocalAcademicData(storage) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return { present: false, counts: { classes: 0, students: 0, exams: 0, results: 0 } };
    try {
      const raw = store.getItem(SAT.STORAGE_KEY);
      if (!raw) return { present: false, counts: { classes: 0, students: 0, exams: 0, results: 0 } };
      const data = JSON.parse(raw);
      const counts = {
        classes: Array.isArray(data.classes) ? data.classes.length : 0,
        students: Array.isArray(data.students) ? data.students.length : 0,
        exams: Array.isArray(data.exams) ? data.exams.length : 0,
        results: Array.isArray(data.results) ? data.results.length : 0,
      };
      const present = counts.classes + counts.students + counts.exams + counts.results > 0;
      return { present, counts };
    } catch {
      return { present: false, counts: { classes: 0, students: 0, exams: 0, results: 0 } };
    }
  };

  SAT.formatRepositoryUserMessage = function formatRepositoryUserMessage(err) {
    const code = err?.code;
    const raw = String(err?.message || '');
    if (/service_role|SUPABASE_SERVICE_ROLE|DATABASE_URL|postgres:\/\/|sb_secret/i.test(raw)) {
      return '요청을 처리하지 못했습니다.';
    }
    if (/새 반 시작일|보관된 반으로는 이관|이미 해당 반에 재원|새 재원 기간이 기존/.test(raw)) {
      return raw;
    }
    if (/Admin required to transfer/i.test(raw)) {
      return '학생 이관은 관리자만 할 수 있습니다.';
    }
    if (/Curriculum authoring required/i.test(raw)) {
      return '이 작업을 할 권한이 없습니다.';
    }
    if (/Only draft versions can be published|Cannot update questions of a|Cannot insert questions on a/i.test(raw)) {
      return '이미 공개된 버전은 수정할 수 없습니다.';
    }
    if (/class\.level .* must equal assessment\.level/i.test(raw)) {
      return '반 레벨과 시험 레벨이 일치하지 않습니다.';
    }
    if (/ExamInstance may only reference a published/i.test(raw)) {
      return '공개된 버전만 반에 배정할 수 있습니다.';
    }
    if (/duplicate key|unique constraint/i.test(raw)) {
      return '이미 같은 번호의 항목이 있습니다. 다시 시도해주세요.';
    }
    if (/unknown question id/i.test(raw)) {
      return '답안 키가 시험 문항과 맞지 않습니다.';
    }
    if (/manual_binary answers must be/i.test(raw)) {
      return '서술형 판정은 정답 또는 오답만 저장할 수 있습니다.';
    }
    if (code === SAT.RepositoryErrorCodes?.STALE || /다른 화면에서 이미 저장된 답/.test(raw)) {
      return SAT.RESULT_STALE_MESSAGE || raw;
    }
    if (code === SAT.RepositoryErrorCodes?.WRITE_FORBIDDEN || /시험 당시 기록은 읽기 전용/.test(raw)) {
      return SAT.RESULT_WRITE_FORBIDDEN_MESSAGE || raw;
    }
    const ctx = String(err?.context || '');
    if (ctx.startsWith('results.create') || ctx.startsWith('results.update')) {
      return '답안을 저장하지 못했습니다.';
    }
    if (ctx.startsWith('results.')) {
      if (code === SAT.RepositoryErrorCodes?.NOT_FOUND) {
        return '이미 삭제되었거나 접근할 수 없는 결과입니다.';
      }
      return '학생 결과를 불러오지 못했습니다.';
    }
    if (ctx.startsWith('assessmentQuestions.') || ctx.startsWith('examInstances.')) {
      return '시험 문항 정보를 불러오지 못했습니다.';
    }
    if (code === SAT.RepositoryErrorCodes?.MUTATION_EMPTY) {
      return '변경할 수 있는 행이 없습니다. 권한이 없거나 이미 삭제되었을 수 있습니다.';
    }
    if (code === SAT.RepositoryErrorCodes?.RLS_OR_PERMISSION) {
      return '이 작업을 할 권한이 없습니다.';
    }
    if (code === SAT.RepositoryErrorCodes?.NOT_FOUND) {
      return '항목을 찾을 수 없거나 보이지 않습니다.';
    }
    if (code === SAT.RepositoryErrorCodes?.TRANSPORT) {
      return '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    }
    if (code === SAT.RepositoryErrorCodes?.VALIDATION) {
      return err.message || '입력값을 확인해주세요.';
    }
    return err?.message || '요청을 처리하지 못했습니다.';
  };

  SAT.withMutationGuard = async function withMutationGuard(holder, key, fn) {
    if (!holder) return { skipped: true };
    holder._mutationGuards = holder._mutationGuards || Object.create(null);
    if (holder._mutationGuards[key]) return { skipped: true };
    holder._mutationGuards[key] = true;
    try {
      const value = await fn();
      return { skipped: false, value };
    } finally {
      holder._mutationGuards[key] = false;
    }
  };
})(window.SAT = window.SAT || {});
