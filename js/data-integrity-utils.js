/**
 * Reference integrity validation for import / normalize (pure functions).
 */
(function (SAT) {
  const TOP_LEVEL_ARRAYS = [
    'classes',
    'students',
    'exams',
    'questions',
    'results',
    'assessmentTemplates',
  ];

  const ENTITY_ID_REQUIRED = [
    { key: 'classes', type: 'class', label: '반' },
    { key: 'students', type: 'student', label: '학생' },
    { key: 'exams', type: 'exam', label: '시험' },
    { key: 'results', type: 'result', label: '결과' },
    { key: 'assessmentTemplates', type: 'assessmentTemplate', label: '템플릿' },
  ];

  function makeIssue(code, entityType, entityId, relatedId, humanReadableMessage) {
    return {
      code,
      entityType,
      entityId: entityId == null ? '' : String(entityId),
      relatedId: relatedId == null ? '' : String(relatedId),
      humanReadableMessage,
    };
  }

  function examLabel(exam, fallbackId = '') {
    const title = String(exam?.title ?? '').trim();
    return title || fallbackId || '(이름 없는 시험)';
  }

  function studentLabel(student, fallbackId = '') {
    const name = String(student?.name ?? '').trim();
    return name || fallbackId || '(이름 없는 학생)';
  }

  function classLabel(cls, fallbackId = '') {
    const name = String(cls?.name ?? '').trim();
    return name || fallbackId || '(이름 없는 반)';
  }

  function hasNonEmptyId(value) {
    return String(value ?? '').trim().length > 0;
  }

  function findDuplicateIds(items, getId = (item) => item?.id) {
    const seen = new Map();
    const duplicates = new Set();
    (items || []).forEach((item) => {
      const id = String(getId(item) ?? '').trim();
      if (!id) return;
      if (seen.has(id)) duplicates.add(id);
      else seen.set(id, true);
    });
    return [...duplicates];
  }

  SAT.ensureImportPayloadShape = function ensureImportPayloadShape(payload) {
    const repairs = [];
    const next = payload && typeof payload === 'object' ? { ...payload } : {};
    TOP_LEVEL_ARRAYS.forEach((key) => {
      if (!Array.isArray(next[key])) {
        next[key] = [];
        if (payload && payload[key] != null) {
          repairs.push(`${key} 값이 배열이 아니어서 빈 배열로 초기화합니다.`);
        } else {
          repairs.push(`${key} 배열이 없어 빈 배열로 초기화합니다.`);
        }
      }
    });
    return { payload: next, repairs };
  };

  SAT.validateDataIntegrity = function validateDataIntegrity(payload) {
    const errors = [];
    const warnings = [];
    const repairs = [];

    if (!payload || typeof payload !== 'object') {
      return {
        status: 'blockingError',
        errors: [
          makeIssue(
            'INVALID_PAYLOAD',
            'import',
            '',
            '',
            '가져올 JSON 데이터가 객체 형식이 아닙니다.'
          ),
        ],
        warnings,
        repairs,
      };
    }

    TOP_LEVEL_ARRAYS.forEach((key) => {
      if (payload[key] != null && !Array.isArray(payload[key])) {
        errors.push(
          makeIssue('INVALID_ARRAY', key, '', '', `${key}는 배열이어야 합니다.`)
        );
      }
    });

    if (errors.length) {
      return { status: 'blockingError', errors, warnings, repairs };
    }

    const classes = payload.classes || [];
    const students = payload.students || [];
    const exams = payload.exams || [];
    const questions = payload.questions || [];
    const results = payload.results || [];
    const templates = payload.assessmentTemplates || [];

    const classMap = new Map(classes.filter((c) => hasNonEmptyId(c?.id)).map((c) => [String(c.id), c]));
    const studentMap = new Map(students.filter((s) => hasNonEmptyId(s?.id)).map((s) => [String(s.id), s]));
    const examMap = new Map(exams.filter((e) => hasNonEmptyId(e?.id)).map((e) => [String(e.id), e]));
    const templateMap = new Map(templates.filter((t) => hasNonEmptyId(t?.id)).map((t) => [String(t.id), t]));

    ENTITY_ID_REQUIRED.forEach(({ key, type, label }) => {
      (payload[key] || []).forEach((item, index) => {
        if (!hasNonEmptyId(item?.id)) {
          errors.push(
            makeIssue(
              'MISSING_ENTITY_ID',
              type,
              '',
              String(index),
              `${label} 데이터에 id가 없습니다. (항목 ${index + 1})`
            )
          );
        }
      });
    });

    questions.forEach((q, index) => {
      if (!hasNonEmptyId(q?.id)) {
        repairs.push(
          makeIssue(
            'MISSING_QUESTION_ID',
            'question',
            '',
            String(q?.examId ?? ''),
            `시험 문항 ${q?.number ?? index + 1}번에 id가 없어 새 id를 부여합니다.`
          )
        );
      }
    });

    findDuplicateIds(classes).forEach((id) => {
      errors.push(
        makeIssue(
          'DUPLICATE_CLASS_ID',
          'class',
          id,
          '',
          `동일한 id를 가진 반이 여러 개 있습니다. 반 id: ${id}`
        )
      );
    });

    findDuplicateIds(students).forEach((id) => {
      errors.push(
        makeIssue(
          'DUPLICATE_STUDENT_ID',
          'student',
          id,
          '',
          `동일한 id를 가진 학생이 여러 명 있습니다. 학생 id: ${id}`
        )
      );
    });

    findDuplicateIds(exams).forEach((id) => {
      errors.push(
        makeIssue(
          'DUPLICATE_EXAM_ID',
          'exam',
          id,
          '',
          `동일한 id를 가진 시험이 여러 개 있습니다. 시험 id: ${id}`
        )
      );
    });

    findDuplicateIds(results).forEach((id) => {
      errors.push(
        makeIssue(
          'DUPLICATE_RESULT_ID',
          'result',
          id,
          '',
          `동일한 id를 가진 결과가 여러 개 있습니다. 결과 id: ${id}`
        )
      );
    });

    findDuplicateIds(templates).forEach((id) => {
      errors.push(
        makeIssue(
          'DUPLICATE_TEMPLATE_ID',
          'assessmentTemplate',
          id,
          '',
          `동일한 id를 가진 템플릿이 여러 개 있습니다. 템플릿 id: ${id}`
        )
      );
    });

    findDuplicateIds(questions).forEach((id) => {
      errors.push(
        makeIssue(
          'DUPLICATE_QUESTION_ID',
          'question',
          id,
          '',
          `동일한 id를 가진 문항이 여러 개 있습니다. 문항 id: ${id}`
        )
      );
    });

    students.forEach((student) => {
      const studentId = String(student?.id ?? '').trim();
      const classId = String(student?.classId ?? '').trim();
      if (!studentId || !classId) return;
      if (!classMap.has(classId)) {
        errors.push(
          makeIssue(
            'ORPHAN_STUDENT_CLASS',
            'student',
            studentId,
            classId,
            `학생 "${studentLabel(student, studentId)}"이(가) 존재하지 않는 반 ID를 참조합니다.\n학생: ${studentLabel(student, studentId)}\n반 ID: ${classId}`
          )
        );
      }
    });

    exams.forEach((exam) => {
      const examId = String(exam?.id ?? '').trim();
      const classId = String(exam?.classId ?? '').trim();
      if (!examId || !classId) return;
      if (!classMap.has(classId)) {
        errors.push(
          makeIssue(
            'ORPHAN_EXAM_CLASS',
            'exam',
            examId,
            classId,
            `시험 "${examLabel(exam, examId)}"이(가) 존재하지 않는 반 ID를 참조합니다.\n시험: ${examLabel(exam, examId)}\n반 ID: ${classId}`
          )
        );
      }

      const templateId = String(exam?.templateId ?? '').trim();
      if (templateId && !templateMap.has(templateId)) {
        const snapshot = String(exam?.templateNameSnapshot ?? '').trim();
        const message = snapshot
          ? `시험 "${examLabel(exam, examId)}"이(가) 삭제된 템플릿(id: ${templateId})을 참조합니다. snapshot "${snapshot}" 정보는 유지됩니다.`
          : `시험 "${examLabel(exam, examId)}"이(가) 존재하지 않는 템플릿(id: ${templateId})을 참조합니다.`;
        warnings.push(
          makeIssue(
            snapshot ? 'MISSING_TEMPLATE_WITH_SNAPSHOT' : 'MISSING_TEMPLATE',
            'exam',
            examId,
            templateId,
            message
          )
        );
      }
    });

    const duplicateNumberChecked = new Set();
    questions.forEach((question) => {
      const questionId = String(question?.id ?? '').trim();
      const examId = String(question?.examId ?? '').trim();
      if (!examId) {
        errors.push(
          makeIssue(
            'MISSING_QUESTION_EXAM_ID',
            'question',
            questionId,
            '',
            `문항 ${question?.number ?? '?'}번에 examId가 없습니다.`
          )
        );
        return;
      }
      if (!examMap.has(examId)) {
        errors.push(
          makeIssue(
            'ORPHAN_QUESTION_EXAM',
            'question',
            questionId,
            examId,
            `문항 ${question?.number ?? '?'}번이 존재하지 않는 시험 ID를 참조합니다.\n시험 ID: ${examId}`
          )
        );
        return;
      }

      const dupKey = `${examId}::${String(question?.number ?? '')}`;
      if (!duplicateNumberChecked.has(dupKey)) {
        duplicateNumberChecked.add(dupKey);
        const examQuestions = questions.filter((q) => String(q?.examId ?? '').trim() === examId);
        const dupNum = String(question?.number ?? '');
        const sameNumber = examQuestions.filter((q) => String(q?.number ?? '') === dupNum);
        if (sameNumber.length > 1) {
          const answers = new Set(sameNumber.map((q) => String(q?.correctAnswer ?? '')));
          const majors = new Set(sameNumber.map((q) => String(q?.majorCategory ?? '')));
          if (answers.size > 1 || majors.size > 1) {
            const exam = examMap.get(examId);
            errors.push(
              makeIssue(
                'DUPLICATE_QUESTION_NUMBER_CONFLICT',
                'question',
                sameNumber.map((q) => q.id).join(', '),
                examId,
                `시험 "${examLabel(exam, examId)}"에서 ${dupNum}번 문항에 서로 다른 정답 또는 분류 데이터가 있습니다.`
              )
            );
          }
        }
      }
    });

    const resultPairMap = new Map();
    results.forEach((result) => {
      const resultId = String(result?.id ?? '').trim();
      const examId = String(result?.examId ?? '').trim();
      const studentId = String(result?.studentId ?? '').trim();
      if (!examId || !studentId) return;

      const pairKey = `${examId}::${studentId}`;
      if (!resultPairMap.has(pairKey)) resultPairMap.set(pairKey, []);
      resultPairMap.get(pairKey).push(result);

      const exam = examMap.get(examId);
      const student = studentMap.get(studentId);

      if (!examMap.has(examId)) {
        errors.push(
          makeIssue(
            'ORPHAN_RESULT_EXAM',
            'result',
            resultId,
            examId,
            `결과 데이터가 존재하지 않는 시험 ID를 참조합니다.\n시험 ID: ${examId}\n결과 id: ${resultId}`
          )
        );
      }

      if (!studentMap.has(studentId)) {
        errors.push(
          makeIssue(
            'ORPHAN_RESULT_STUDENT',
            'result',
            resultId,
            studentId,
            `결과 데이터가 존재하지 않는 학생 ID를 참조합니다.\n시험: ${examLabel(exam, examId)}\n학생 ID: ${studentId}`
          )
        );
      }

      if (
        exam &&
        student &&
        String(student.classId ?? '').trim() !== String(exam.classId ?? '').trim()
      ) {
        errors.push(
          makeIssue(
            'RESULT_CLASS_MISMATCH',
            'result',
            resultId,
            studentId,
            `결과가 서로 다른 반의 학생과 시험을 연결합니다.\n시험: ${examLabel(exam, examId)} (반: ${classLabel(classMap.get(exam.classId), exam.classId)})\n학생: ${studentLabel(student, studentId)} (반: ${classLabel(classMap.get(student.classId), student.classId)})`
          )
        );
      }
    });

    resultPairMap.forEach((group, pairKey) => {
      if (group.length <= 1) return;
      const [examId, studentId] = pairKey.split('::');
      const exam = examMap.get(examId);
      const student = studentMap.get(studentId);
      errors.push(
        makeIssue(
          'DUPLICATE_RESULT_PAIR',
          'result',
          group.map((r) => r.id).join(', '),
          studentId,
          `동일 시험·학생 조합의 결과가 ${group.length}개 있습니다.\n시험: ${examLabel(exam, examId)}\n학생: ${studentLabel(student, studentId)}\n결과 id: ${group.map((r) => r.id).join(', ')}`
        )
      );
    });

    let status = 'valid';
    if (errors.length > 0) status = 'blockingError';
    else if (repairs.length > 0) status = 'repairable';

    return { status, errors, warnings, repairs };
  };

  SAT.validateImportReadiness = function validateImportReadiness(payload) {
    const shaped = SAT.ensureImportPayloadShape(payload);
    const structure = SAT.validateImportStructure(shaped.payload);
    const integrity = SAT.validateDataIntegrity(shaped.payload);

    let status = 'valid';
    if (structure.status === 'blockingError' || integrity.status === 'blockingError') {
      status = 'blockingError';
    } else if (
      structure.status === 'repairable' ||
      integrity.status === 'repairable' ||
      shaped.repairs.length > 0
    ) {
      status = 'repairable';
    }

    return {
      status,
      structure,
      integrity,
      shapeRepairs: shaped.repairs,
      payload: shaped.payload,
    };
  };

  function formatIssueList(issues, maxItems = 8) {
    if (!issues?.length) return '';
    const lines = issues.map((item) =>
      typeof item === 'string' ? item : item.humanReadableMessage
    );
    if (lines.length <= maxItems) return lines.join('\n');
    const shown = lines.slice(0, maxItems).join('\n');
    return `${shown}\n… 외 ${lines.length - maxItems}건`;
  }

  SAT.formatIntegrityBlockingSummary = function formatIntegrityBlockingSummary(readiness, options = {}) {
    const maxItems = options.maxItems ?? 8;
    const parts = [];

    (readiness.structure?.blocking || []).forEach((item) => {
      const kind = item.entityType === 'exam' ? '시험' : '템플릿';
      parts.push(`${kind} "${item.entityLabel}": ${item.issues.join(' ')}`);
    });

    if (readiness.integrity?.errors?.length) {
      parts.push(...readiness.integrity.errors.map((e) => e.humanReadableMessage));
    }

    return formatIssueList(parts, maxItems);
  };

  SAT.formatIntegrityRepairSummary = function formatIntegrityRepairSummary(readiness, options = {}) {
    const maxItems = options.maxItems ?? 8;
    const parts = [];

    (readiness.shapeRepairs || []).forEach((line) => parts.push(line));

    (readiness.structure?.repairable || []).forEach((item) => {
      const kind = item.entityType === 'exam' ? '시험' : '템플릿';
      parts.push(`${kind} "${item.entityLabel}": ${item.repairs.join(' ')}`);
    });

    (readiness.integrity?.repairs || []).forEach((item) => {
      parts.push(item.humanReadableMessage);
    });

    return formatIssueList(parts, maxItems);
  };

  SAT.formatIntegrityWarningSummary = function formatIntegrityWarningSummary(readiness, options = {}) {
    const maxItems = options.maxItems ?? 8;
    return formatIssueList(
      (readiness.integrity?.warnings || []).map((w) => w.humanReadableMessage),
      maxItems
    );
  };

  SAT.repairDataIntegrity = function repairDataIntegrity(payload, options = {}) {
    const createId =
      options.createId ||
      (() => `repair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const repairsApplied = [];
    const shaped = SAT.ensureImportPayloadShape(payload);
    repairsApplied.push(...shaped.repairs);

    let next = shaped.payload;
    const structureRepaired = SAT.repairImportPayload(next);
    next = structureRepaired.payload;
    repairsApplied.push(...structureRepaired.repairsApplied);

    const idResult = SAT.ensureExamQuestionIds(next.questions || [], { createId });
    if (idResult.changed) {
      repairsApplied.push(...idResult.repairs);
      next = { ...next, questions: idResult.questions };
    }

    return { payload: next, repairsApplied };
  };

  SAT.prepareImportPayload = function prepareImportPayload(payload, options = {}) {
    const readiness = SAT.validateImportReadiness(payload);
    if (readiness.status === 'blockingError') {
      return { ok: false, readiness };
    }

    let working = readiness.payload;
    let repairsApplied = [];

    if (readiness.status === 'repairable') {
      const repaired = SAT.repairDataIntegrity(working, options);
      working = repaired.payload;
      repairsApplied = repaired.repairsApplied;
    }

    const finalReadiness = SAT.validateImportReadiness(working);
    if (finalReadiness.status === 'blockingError') {
      return { ok: false, readiness: finalReadiness, repairsApplied };
    }

    return {
      ok: true,
      payload: working,
      readiness: finalReadiness,
      repairsApplied,
    };
  };
})(window.SAT = window.SAT || {});
