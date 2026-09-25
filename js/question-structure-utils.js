/**
 * Exam / template question structure validation and repair (pure functions).
 */
(function (SAT) {
  function isValidQuestionNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && Number.isInteger(n) && n >= 1;
  }

  function isValidQuestionCount(value) {
    return isValidQuestionNumber(value);
  }

  SAT.createEmptyStructureQuestion = function createEmptyStructureQuestion(number, entityType) {
    const base = {
      number,
      points: SAT.DEFAULT_QUESTION_POINTS || 1,
      majorCategory: '',
      middleCategory: '',
      note: '',
    };
    if (entityType === 'exam') {
      return { ...base, correctAnswer: '' };
    }
    return base;
  };

  SAT.validateQuestionStructure = function validateQuestionStructure({
    questionCount,
    questions,
    entityLabel = '',
    entityType = 'embedded',
  }) {
    const issues = [];
    const repairs = [];
    const qArray = Array.isArray(questions) ? questions : null;

    if (!qArray) {
      issues.push('questions가 배열이 아닙니다.');
      repairs.push('questionCount 기준으로 빈 문항을 생성합니다.');
    }

    const countNum = Number(questionCount);
    const countValid = isValidQuestionCount(countNum);

    if (!countValid) {
      issues.push('questionCount가 1 이상의 정수가 아닙니다.');
      if (qArray && qArray.length > 0) {
        repairs.push('questionCount를 문항 번호 또는 배열 길이 기준으로 계산합니다.');
      } else {
        repairs.push('questionCount를 1로 설정하고 빈 문항을 생성합니다.');
      }
    }

    const duplicateNumbers = [];
    const invalidCount = qArray
      ? qArray.filter((q) => !isValidQuestionNumber(q?.number)).length
      : 0;
    const validNumbers = new Set();

    if (qArray) {
      const seen = new Set();
      qArray.forEach((q) => {
        const n = Number(q?.number);
        if (!isValidQuestionNumber(n)) return;
        if (seen.has(n)) {
          if (!duplicateNumbers.includes(n)) duplicateNumbers.push(n);
        } else {
          seen.add(n);
          validNumbers.add(n);
        }
      });
    }

    if (duplicateNumbers.length > 0) {
      duplicateNumbers.sort((a, b) => a - b);
      return {
        status: 'blockingError',
        issues: [`문항 번호가 중복됩니다: ${duplicateNumbers.join(', ')}번`],
        repairs: [],
        duplicateNumbers,
        entityLabel,
        entityType,
      };
    }

    if (invalidCount > 0) {
      issues.push(`유효하지 않은 문항 번호 ${invalidCount}개`);
      repairs.push('유효하지 않은 문항 번호를 보완합니다.');
    }

    const derivedCount = validNumbers.size > 0
      ? Math.max(...validNumbers)
      : (qArray ? qArray.length : 0);
    const effectiveCount = countValid ? countNum : derivedCount;

    if (qArray && countValid && qArray.length !== countNum) {
      issues.push(
        `questionCount(${countNum})와 questions.length(${qArray.length})가 일치하지 않습니다.`
      );
      repairs.push('questionCount와 questions.length를 맞춥니다.');
    }

    if (qArray && qArray.length === 0 && (countValid || effectiveCount >= 1)) {
      issues.push('questions가 비어 있습니다.');
      repairs.push('questionCount만큼 빈 문항을 생성합니다.');
    }

    if (qArray && effectiveCount >= 1) {
      const missing = [];
      for (let i = 1; i <= effectiveCount; i += 1) {
        if (!validNumbers.has(i)) missing.push(i);
      }
      if (missing.length) {
        issues.push(`누락된 문항 번호: ${missing.join(', ')}번`);
        repairs.push('누락된 문항 번호를 빈 문항으로 채웁니다.');
      }

      const ordered = qArray
        .filter((q) => isValidQuestionNumber(q?.number))
        .map((q) => Number(q.number));
      const isSorted = ordered.every((n, idx) => idx === 0 || n >= ordered[idx - 1]);
      if (!isSorted && ordered.length > 1) {
        issues.push('문항 번호 순서가 정렬되어 있지 않습니다.');
        repairs.push('number 오름차순으로 정렬합니다.');
      }
    }

    const uniqueRepairs = [...new Set(repairs)];
    return {
      status: issues.length ? 'repairable' : 'valid',
      issues,
      repairs: uniqueRepairs,
      entityLabel,
      entityType,
      effectiveCount: countValid ? countNum : derivedCount,
    };
  };

  SAT.repairQuestionStructure = function repairQuestionStructure(input, options = {}) {
    const entityType = options.entityType || input?.entityType || 'embedded';
    const validation = SAT.validateQuestionStructure({
      questionCount: input?.questionCount,
      questions: input?.questions,
      entityLabel: input?.entityLabel || '',
      entityType,
    });

    if (validation.status === 'blockingError') {
      return { success: false, changed: false, validation };
    }

    const source = Array.isArray(input?.questions) ? input.questions.map((q) => ({ ...q })) : [];
    let questionCount = Number(input?.questionCount);

    if (validation.status === 'valid') {
      const sorted = [...source].sort((a, b) => Number(a.number) - Number(b.number));
      const changed = JSON.stringify(source) !== JSON.stringify(sorted);
      return {
        success: true,
        changed,
        questionCount: isValidQuestionCount(questionCount) ? questionCount : sorted.length,
        questions: changed ? sorted : source,
        validation,
        repairs: changed ? ['number 오름차순으로 정렬합니다.'] : [],
      };
    }

    if (!isValidQuestionCount(questionCount)) {
      const validNums = source
        .map((q) => Number(q.number))
        .filter(isValidQuestionNumber);
      if (validNums.length > 0) {
        questionCount = Math.max(...validNums);
      } else if (source.length > 0) {
        questionCount = source.length;
      } else {
        questionCount = 1;
      }
    }

    const byNumber = new Map();
    source
      .filter((q) => isValidQuestionNumber(q?.number))
      .forEach((q) => {
        byNumber.set(Number(q.number), { ...q, number: Number(q.number) });
      });

    source
      .filter((q) => !isValidQuestionNumber(q?.number))
      .forEach((q) => {
        let slot = 1;
        while (byNumber.has(slot)) slot += 1;
        byNumber.set(slot, { ...q, number: slot });
      });

    if (byNumber.size > 0) {
      questionCount = Math.max(questionCount, Math.max(...byNumber.keys()));
    }

    if (byNumber.size === 0) {
      const empty = [];
      for (let i = 1; i <= questionCount; i += 1) {
        empty.push(SAT.createEmptyStructureQuestion(i, entityType));
      }
      return {
        success: true,
        changed: true,
        questionCount,
        questions: empty,
        validation,
        repairs: validation.repairs,
      };
    }

    const repaired = [];
    for (let i = 1; i <= questionCount; i += 1) {
      repaired.push(
        byNumber.get(i) || SAT.createEmptyStructureQuestion(i, entityType)
      );
    }

    return {
      success: true,
      changed: true,
      questionCount: repaired.length,
      questions: repaired,
      validation,
      repairs: validation.repairs,
    };
  };

  SAT.validateImportStructure = function validateImportStructure(payload) {
    const templates = [];
    const exams = [];

    (payload?.assessmentTemplates || []).forEach((t) => {
      templates.push({
        id: t?.id,
        ...SAT.validateQuestionStructure({
          questionCount: t?.questionCount,
          questions: t?.questions,
          entityLabel: String(t?.name ?? '').trim() || '이름 없는 템플릿',
          entityType: 'template',
        }),
      });
    });

    const globalQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
    (payload?.exams || []).forEach((e) => {
      const examQuestions = globalQuestions.filter((q) => q?.examId === e?.id);
      exams.push({
        id: e?.id,
        ...SAT.validateQuestionStructure({
          questionCount: e?.questionCount,
          questions: examQuestions,
          entityLabel: String(e?.title ?? '').trim() || '이름 없는 시험',
          entityType: 'exam',
        }),
      });
    });

    const all = [...templates, ...exams];
    const blocking = all.filter((r) => r.status === 'blockingError');
    const repairable = all.filter((r) => r.status === 'repairable');

    let status = 'valid';
    if (blocking.length) status = 'blockingError';
    else if (repairable.length) status = 'repairable';

    return { status, templates, exams, blocking, repairable };
  };

  SAT.formatImportStructureRepairSummary = function formatImportStructureRepairSummary(structureResult) {
    return (structureResult?.repairable || [])
      .map((item) => {
        const kind = item.entityType === 'exam' ? '시험' : '템플릿';
        return `${kind} "${item.entityLabel}": ${item.repairs.join(' ')}`;
      })
      .join('\n');
  };

  SAT.formatImportStructureBlockingSummary = function formatImportStructureBlockingSummary(structureResult) {
    return (structureResult?.blocking || [])
      .map((item) => {
        const kind = item.entityType === 'exam' ? '시험' : '템플릿';
        return `${kind} "${item.entityLabel}": ${item.issues.join(' ')}`;
      })
      .join('\n');
  };

  SAT.repairImportPayload = function repairImportPayload(payload) {
    const repairsApplied = [];
    const next = { ...payload };

    next.assessmentTemplates = (payload.assessmentTemplates || []).map((t) => {
      const validation = SAT.validateQuestionStructure({
        questionCount: t?.questionCount,
        questions: t?.questions,
        entityLabel: t?.name || '템플릿',
        entityType: 'template',
      });
      if (validation.status !== 'repairable') return t;
      const repaired = SAT.repairQuestionStructure(
        { questionCount: t.questionCount, questions: t.questions },
        { entityType: 'template' }
      );
      if (repaired.success && repaired.changed) {
        repairsApplied.push(`템플릿 "${t.name || t.id}": ${repaired.repairs.join(' ')}`);
        return {
          ...t,
          questionCount: repaired.questionCount,
          questions: repaired.questions,
        };
      }
      return t;
    });

    const globalQuestions = Array.isArray(payload.questions) ? [...payload.questions] : [];
    const questionsByExam = new Map();
    globalQuestions.forEach((q) => {
      const examId = q?.examId;
      if (!examId) return;
      if (!questionsByExam.has(examId)) questionsByExam.set(examId, []);
      questionsByExam.get(examId).push(q);
    });

    next.exams = (payload.exams || []).map((e) => {
      const examQuestions = questionsByExam.get(e.id) || [];
      const validation = SAT.validateQuestionStructure({
        questionCount: e?.questionCount,
        questions: examQuestions,
        entityLabel: e?.title || '시험',
        entityType: 'exam',
      });
      if (validation.status === 'repairable') {
        const repaired = SAT.repairQuestionStructure(
          { questionCount: e.questionCount, questions: examQuestions },
          { entityType: 'exam' }
        );
        if (repaired.success && repaired.changed) {
          repairsApplied.push(`시험 "${e.title || e.id}": ${repaired.repairs.join(' ')}`);
          questionsByExam.set(
            e.id,
            repaired.questions.map((q) => ({ ...q, examId: e.id }))
          );
          return { ...e, questionCount: repaired.questionCount };
        }
      }
      return e;
    });

    const rebuiltQuestions = [];
    questionsByExam.forEach((list) => {
      list.forEach((q) => rebuiltQuestions.push(q));
    });
    const knownExamIds = new Set((payload.exams || []).map((e) => e.id));
    globalQuestions
      .filter((q) => !q?.examId || !knownExamIds.has(q.examId))
      .forEach((q) => rebuiltQuestions.push(q));

    next.questions = rebuiltQuestions;
    return { payload: next, repairsApplied };
  };

  SAT.applyStoredQuestionStructure = function applyStoredQuestionStructure(data) {
    const warnings = [];
    const next = { ...data };

    next.assessmentTemplates = (data.assessmentTemplates || []).map((t) => {
      const validation = SAT.validateQuestionStructure({
        questionCount: t?.questionCount,
        questions: t?.questions,
        entityLabel: t?.name || '템플릿',
        entityType: 'template',
      });
      if (validation.status === 'blockingError') {
        warnings.push(`템플릿 "${t.name || t.id}": ${validation.issues.join(' ')}`);
        return t;
      }
      if (validation.status === 'repairable') {
        const repaired = SAT.repairQuestionStructure(
          { questionCount: t.questionCount, questions: t.questions },
          { entityType: 'template' }
        );
        if (repaired.success && repaired.changed) {
          return {
            ...t,
            questionCount: repaired.questionCount,
            questions: repaired.questions,
          };
        }
      }
      return t;
    });

    const questions = Array.isArray(data.questions) ? [...data.questions] : [];
    const byExam = new Map();
    questions.forEach((q) => {
      if (!q?.examId) return;
      if (!byExam.has(q.examId)) byExam.set(q.examId, []);
      byExam.get(q.examId).push(q);
    });

    next.exams = (data.exams || []).map((e) => {
      const examQuestions = byExam.get(e.id) || [];
      const validation = SAT.validateQuestionStructure({
        questionCount: e?.questionCount,
        questions: examQuestions,
        entityLabel: e?.title || '시험',
        entityType: 'exam',
      });
      if (validation.status === 'blockingError') {
        warnings.push(`시험 "${e.title || e.id}": ${validation.issues.join(' ')}`);
        return e;
      }
      if (validation.status === 'repairable') {
        const repaired = SAT.repairQuestionStructure(
          { questionCount: e.questionCount, questions: examQuestions },
          { entityType: 'exam' }
        );
        if (repaired.success && repaired.changed) {
          byExam.set(
            e.id,
            repaired.questions.map((q) => ({ ...q, examId: e.id, id: q.id }))
          );
          return { ...e, questionCount: repaired.questionCount };
        }
      }
      return e;
    });

    const rebuilt = [];
    byExam.forEach((list) => rebuilt.push(...list));
    questions.filter((q) => !q?.examId).forEach((q) => rebuilt.push(q));
    next.questions = rebuilt;

    return { data: next, warnings };
  };

  SAT.ensureExamQuestionIds = function ensureExamQuestionIds(questions, options = {}) {
    const createId = typeof options.createId === 'function' ? options.createId : () => '';
    const repairs = [];
    const seen = new Set();
    let changed = false;

    const result = (questions || []).map((q, index) => {
      const label = q?.number ?? index + 1;
      let id = String(q?.id ?? '').trim();

      if (!id) {
        id = createId();
        repairs.push(`문항 ${label}: id 없음 → 새 id 부여`);
        changed = true;
      } else if (seen.has(id)) {
        id = createId();
        repairs.push(`문항 ${label}: 중복 id → 새 id 부여`);
        changed = true;
      }

      seen.add(id);

      if (id !== String(q?.id ?? '').trim()) {
        return { ...q, id };
      }
      return q;
    });

    return { questions: result, changed, repairs };
  };
})(window.SAT = window.SAT || {});
