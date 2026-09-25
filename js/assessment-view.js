/**
 * P5B Assessment Library / Version / Question / ExamInstance view helpers.
 * CQ Blueprint는 authoring helper일 뿐 DB source of truth가 아니다.
 * student answers / Result 는 P5C.
 */
(function (SAT) {
  SAT.ASSESSMENT_TYPE_CQ = 'CQ';
  SAT.GRADING_TYPE_CHOICE = 'choice';
  SAT.GRADING_TYPE_MANUAL_BINARY = 'manual_binary';
  SAT.MANUAL_BINARY_CORRECT = '1';
  SAT.MANUAL_BINARY_INCORRECT = '2';
  SAT.STANDARD_CQ_ANSWER_OPTIONS = SAT.CQ_QUICK_ANSWER_OPTIONS || ['1', '2', '3', '4'];
  SAT.DEFAULT_CHOICE_COUNT = 4;
  SAT.MIN_MANUAL_QUESTIONS = 1;
  SAT.MAX_MANUAL_QUESTIONS = 100;
  SAT.DEFERRED_CLOUD_RESULT_MESSAGE = '학생 답안/채점은 다음 단계에서 연결됩니다.';
  SAT.EMPTY_MANUAL_AUTHORING_NOTICE = '표준 문항 구성이 없는 문제집입니다.';
  SAT.EMPTY_MANUAL_AUTHORING_HINT = '문항을 직접 구성합니다.';
  SAT.CREATE_BLUEPRINT_HINT = '기본 구성을 불러온 뒤 초안에서 자유롭게 수정할 수 있습니다.';
  SAT.UNUSED_ASSESSMENT_DELETE_BLOCKED = '공개 또는 사용 이력이 있는 문제집은 삭제할 수 없습니다. 필요하면 보관/비활성 처리하세요.';
  SAT.DELETE_BLOCKED_PUBLISHED = '공개된 버전이 있어 삭제할 수 없습니다.';
  SAT.DELETE_BLOCKED_ARCHIVED = '보관된 버전이 있어 삭제할 수 없습니다.';
  SAT.DELETE_BLOCKED_EXAM = '시험 배정 이력이 있어 삭제할 수 없습니다.';
  SAT.DELETE_BLOCKED_RESULT = '시험 결과 이력이 있어 삭제할 수 없습니다.';
  SAT.PRIOR_PUBLISHED_HISTORY_NOTE = '이전 공개 이력 있음';

  SAT.isStandardCqAssessment = function isStandardCqAssessment(assessment) {
    return String(assessment?.assessmentType || '').trim().toUpperCase() === SAT.ASSESSMENT_TYPE_CQ;
  };

  SAT.standardCqAnswerOptions = function standardCqAnswerOptions() {
    return SAT.STANDARD_CQ_ANSWER_OPTIONS || SAT.CQ_QUICK_ANSWER_OPTIONS || ['1', '2', '3', '4'];
  };

  SAT.isStandardCqChoiceAnswer = function isStandardCqChoiceAnswer(value) {
    return SAT.standardCqAnswerOptions().includes(String(value ?? '').trim());
  };

  SAT.normalizeChoiceCount = function normalizeChoiceCount(value, options = {}) {
    const n = Number(value);
    if (n === 5) return 5;
    if (n === 4) return 4;
    if (options.allowInvalid) return 0;
    return options.fallback === 5 ? 5 : SAT.DEFAULT_CHOICE_COUNT;
  };

  SAT.choiceOptionsForCount = function choiceOptionsForCount(choiceCount) {
    const n = SAT.normalizeChoiceCount(choiceCount);
    const out = [];
    for (let i = 1; i <= n; i += 1) out.push(String(i));
    return out;
  };

  SAT.isValidChoiceAnswer = function isValidChoiceAnswer(value, choiceCount) {
    return SAT.choiceOptionsForCount(choiceCount).includes(String(value ?? '').trim());
  };

  SAT.hasStandardCqBlueprint = function hasStandardCqBlueprint(assessment) {
    if (!SAT.isStandardCqAssessment(assessment)) return false;
    return SAT.getCqBlueprintForLevel?.(assessment.level)?.supported === true;
  };

  SAT.canMutateDraftQuestionCount = function canMutateDraftQuestionCount(assessment, version) {
    return SAT.canEditAssessmentVersion(version);
  };

  SAT.canApplyCqBlueprintGenerator = function canApplyCqBlueprintGenerator(assessment, version, questions) {
    return SAT.canEditAssessmentVersion(version)
      && SAT.hasStandardCqBlueprint(assessment)
      && !(questions || []).length;
  };

  SAT.inferChoiceCountFromQuestions = function inferChoiceCountFromQuestions(questions) {
    const hasFive = (questions || []).some((raw, i) => {
      const q = SAT.normalizeCloudQuestion(raw, raw?.number || i + 1);
      return q.gradingType === SAT.GRADING_TYPE_CHOICE && String(q.correctAnswer || '').trim() === '5';
    });
    return hasFive ? 5 : 0;
  };

  SAT.resolveChoiceCount = function resolveChoiceCount({ version, questions } = {}) {
    const fromVersion = SAT.normalizeChoiceCount(version?.choiceCount, { allowInvalid: true });
    if (fromVersion) return fromVersion;
    const inferred = SAT.inferChoiceCountFromQuestions(questions);
    return inferred || SAT.DEFAULT_CHOICE_COUNT;
  };

  SAT.canLowerChoiceCountToFour = function canLowerChoiceCountToFour(questions) {
    const blocked = SAT.inferChoiceCountFromQuestions(questions) === 5;
    return {
      ok: !blocked,
      error: blocked ? '5번 정답이 있는 문항이 있어 4지선다로 변경할 수 없습니다.' : '',
    };
  };

  SAT.unusedAssessmentDeleteReason = function unusedAssessmentDeleteReason(
    assessment,
    versions,
    examInstances,
    results,
  ) {
    if (!assessment?.id) return '문제집을 찾을 수 없습니다.';
    const list = versions || [];
    if (list.some((v) => v.status === 'published')) return SAT.DELETE_BLOCKED_PUBLISHED;
    if (list.some((v) => v.status === 'archived')) return SAT.DELETE_BLOCKED_ARCHIVED;
    const versionIds = new Set(list.map((v) => v.id).filter(Boolean));
    const linkedExams = (examInstances || []).filter((row) => versionIds.has(row.assessmentVersionId));
    if (linkedExams.length) {
      const examIdSet = new Set(linkedExams.map((row) => row.id).filter(Boolean));
      const hasResults = examIdSet.size > 0
        && (results || []).some((row) => examIdSet.has(row.examInstanceId));
      if (hasResults) return SAT.DELETE_BLOCKED_RESULT;
      return SAT.DELETE_BLOCKED_EXAM;
    }
    return '';
  };

  SAT.canHardDeleteAssessment = function canHardDeleteAssessment(
    assessment,
    versions,
    examInstances,
    results,
  ) {
    return SAT.unusedAssessmentDeleteReason(assessment, versions, examInstances, results) === '';
  };

  SAT.hasPriorPublishedAssessmentHistory = function hasPriorPublishedAssessmentHistory(versions) {
    const list = versions || [];
    const latest = list.slice().sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0];
    if (!latest || latest.status !== 'draft') return false;
    return list.some((v) => v.status === 'published' || v.status === 'archived');
  };

  SAT.canShowForceDeleteAssessment = function canShowForceDeleteAssessment(profile) {
    return SAT.isSystemAdmin ? SAT.isSystemAdmin(profile) : false;
  };

  SAT.forceDeleteTitleMatches = function forceDeleteTitleMatches(typed, title) {
    return String(typed ?? '') === String(title ?? '');
  };

  SAT.canSubmitForceDeleteConfirm = function canSubmitForceDeleteConfirm(typed, title) {
    return SAT.forceDeleteTitleMatches(typed, title) && String(title ?? '') !== '';
  };

  SAT.formatForceDeleteConfirm = function formatForceDeleteConfirm(title) {
    const name = String(title || '').trim() || '이름 없음';
    return `문제집 '${name}'을 강제로 삭제하시겠습니까?\n\n연결된 시험 배정과 학생 결과까지 영구적으로 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`;
  };

  SAT.formatForceDeleteSuccessToast = function formatForceDeleteSuccessToast(summary) {
    const exams = Number(
      summary?.deletedExamInstances ?? summary?.deleted_exam_instances ?? 0,
    );
    const results = Number(summary?.deletedResults ?? summary?.deleted_results ?? 0);
    return `문제집을 강제로 삭제했습니다.\n시험 ${exams}건 · 결과 ${results}건이 함께 삭제되었습니다.`;
  };

  SAT.formatUnusedAssessmentDeleteConfirm = function formatUnusedAssessmentDeleteConfirm(title) {
    const name = String(title || '').trim() || '이름 없음';
    return `문제집 '${name}'을 삭제하시겠습니까?\n\n아직 사용되지 않은 초안과 문항이 함께 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`;
  };

  SAT.normalizeManualQuestionCount = function normalizeManualQuestionCount(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < SAT.MIN_MANUAL_QUESTIONS || n > SAT.MAX_MANUAL_QUESTIONS) {
      return 0;
    }
    return n;
  };

  SAT.validateManualQuestionCount = function validateManualQuestionCount(value) {
    const count = SAT.normalizeManualQuestionCount(value);
    if (!count) {
      return { ok: false, count: 0, error: '문항 수는 1–100 사이여야 합니다.' };
    }
    return { ok: true, count, error: '' };
  };

  SAT.buildBlankCloudQuestions = function buildBlankCloudQuestions(count) {
    const n = SAT.normalizeManualQuestionCount(count);
    if (!n) return [];
    const rows = [];
    for (let i = 1; i <= n; i += 1) {
      rows.push(SAT.normalizeCloudQuestion({
        number: i,
        gradingType: SAT.GRADING_TYPE_CHOICE,
        correctAnswer: '',
        points: 1,
        majorCategory: '',
        middleCategory: '',
        note: '',
      }, i));
    }
    return rows;
  };

  SAT.renumberCloudQuestions = function renumberCloudQuestions(questions) {
    return (questions || []).map((q, i) => SAT.normalizeCloudQuestion({
      ...q,
      number: i + 1,
    }, i + 1));
  };

  SAT.validateChoiceAnswers = function validateChoiceAnswers(questions, options = {}) {
    const choiceCount = SAT.normalizeChoiceCount(options.choiceCount);
    const requireFilled = options.requireFilled === true;
    const errors = [];
    (questions || []).forEach((raw, i) => {
      const q = SAT.normalizeCloudQuestion(raw, raw?.number || i + 1);
      if (q.gradingType !== SAT.GRADING_TYPE_CHOICE) return;
      const ans = String(q.correctAnswer || '').trim();
      if (!ans) {
        if (requireFilled) errors.push(`${q.number}번 문항의 정답이 없습니다.`);
        return;
      }
      if (!SAT.isValidChoiceAnswer(ans, choiceCount)) {
        errors.push(`${q.number}번 정답은 1–${choiceCount}만 허용됩니다. ("${ans}"는 저장할 수 없습니다)`);
      }
    });
    return { ok: errors.length === 0, errors };
  };

  SAT.validateManualPublish = function validateManualPublish(questions, options = {}) {
    const rows = (questions || []).map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
    const errors = [];
    if (!rows.length) {
      return { ok: false, errors: ['공개하려면 문항이 필요합니다.'] };
    }
    const dups = SAT.duplicateNumbers(rows);
    if (dups.length) errors.push(`문항 번호가 중복됩니다: ${dups.join(', ')}`);
    rows.forEach((q) => {
      if (!(Number(q.points) > 0)) {
        errors.push(`${q.number}번 문항의 배점이 올바르지 않습니다.`);
      }
    });
    const answerCheck = SAT.validateChoiceAnswers(rows, {
      choiceCount: options.choiceCount,
      requireFilled: true,
    });
    if (!answerCheck.ok) errors.push(...answerCheck.errors);
    return { ok: errors.length === 0, errors };
  };

  SAT.parseAuthoringBulkAnswers = function parseAuthoringBulkAnswers(input) {
    if (typeof SAT.parseBulkAnswerInput === 'function') {
      return SAT.parseBulkAnswerInput(input, 'numeric');
    }
    return String(input || '').trim().split(/[\s,\/\n\r\t]+/).filter(Boolean);
  };

  SAT.validateAuthoringBulkAnswers = function validateAuthoringBulkAnswers(tokens, questionCount, choiceCount) {
    const count = Number(questionCount) || 0;
    const max = SAT.normalizeChoiceCount(choiceCount);
    const list = Array.isArray(tokens) ? tokens : [];
    const errors = [];
    if (!list.length) {
      errors.push({ message: '정답이 입력되지 않았습니다.' });
      return { ok: false, errors, answers: [] };
    }
    if (list.length < count) {
      errors.push({ message: `${count}문항 중 ${list.length}개의 정답만 입력되었습니다.` });
    } else if (list.length > count) {
      errors.push({ message: `${count}문항인데 ${list.length}개의 값이 입력되었습니다.` });
    }
    const answers = list.map((tok, index) => {
      const normalized = typeof SAT.normalizeBulkToken === 'function'
        ? SAT.normalizeBulkToken(tok, 'numeric')
        : String(tok || '').trim();
      if (!SAT.isValidChoiceAnswer(normalized, max)) {
        errors.push({
          questionNumber: index + 1,
          message: `${index + 1}번째 답안 "${tok}"은(는) 1–${max}만 허용됩니다.`,
        });
      }
      return normalized;
    });
    return { ok: errors.length === 0, errors, answers };
  };

  SAT.validateStandardCqChoiceAnswers = function validateStandardCqChoiceAnswers(questions, options = {}) {
    const requireFilled = options.requireFilled === true;
    const errors = [];
    (questions || []).forEach((raw, i) => {
      const q = SAT.normalizeCloudQuestion(raw, raw?.number || i + 1);
      if (q.gradingType !== SAT.GRADING_TYPE_CHOICE) return;
      const ans = String(q.correctAnswer || '').trim();
      if (!ans) {
        if (requireFilled) errors.push(`${q.number}번 정답이 비어 있습니다.`);
        return;
      }
      if (!SAT.isStandardCqChoiceAnswer(ans)) {
        errors.push(`${q.number}번 정답은 1–4만 허용됩니다. ("${ans}"는 저장할 수 없습니다)`);
      }
    });
    return { ok: errors.length === 0, errors };
  };

  SAT.hasNonCanonicalCqChoiceAnswers = function hasNonCanonicalCqChoiceAnswers(questions) {
    return (questions || []).some((raw, i) => {
      const q = SAT.normalizeCloudQuestion(raw, raw?.number || i + 1);
      if (q.gradingType !== SAT.GRADING_TYPE_CHOICE) return false;
      const ans = String(q.correctAnswer || '').trim();
      return Boolean(ans) && !SAT.isStandardCqChoiceAnswer(ans);
    });
  };

  SAT.manualBinaryUiLabel = function manualBinaryUiLabel(value) {
    const v = String(value ?? '').trim();
    if (v === SAT.MANUAL_BINARY_INCORRECT) return '오답';
    return '정답';
  };

  SAT.normalizeGradingType = function normalizeGradingType(value) {
    return value === SAT.GRADING_TYPE_MANUAL_BINARY
      ? SAT.GRADING_TYPE_MANUAL_BINARY
      : SAT.GRADING_TYPE_CHOICE;
  };

  SAT.normalizeCloudQuestion = function normalizeCloudQuestion(raw, fallbackNumber) {
    const gradingType = SAT.normalizeGradingType(raw?.gradingType);
    const number = Number(raw?.number) || fallbackNumber || 1;
    return {
      id: raw?.id,
      assessmentVersionId: raw?.assessmentVersionId,
      number,
      gradingType,
      correctAnswer: gradingType === SAT.GRADING_TYPE_MANUAL_BINARY
        ? SAT.MANUAL_BINARY_CORRECT
        : String(raw?.correctAnswer ?? '').trim(),
      points: Number(raw?.points) > 0 ? Number(raw.points) : 1,
      majorCategory: SAT.normalizeCategory ? SAT.normalizeCategory(raw?.majorCategory) : String(raw?.majorCategory || ''),
      middleCategory: SAT.normalizeCategory ? SAT.normalizeCategory(raw?.middleCategory) : String(raw?.middleCategory || ''),
      note: String(raw?.note ?? '').trim(),
    };
  };

  SAT.cloudQuestionsFromCqBlueprint = function cloudQuestionsFromCqBlueprint(level) {
    const rows = SAT.buildCqBlueprintQuestions?.(level);
    if (!rows) return null;
    return rows.map((q, i) => SAT.normalizeCloudQuestion({
      ...q,
      gradingType: SAT.GRADING_TYPE_CHOICE,
    }, i + 1));
  };

  SAT.copyQuestionsForNewDraft = function copyQuestionsForNewDraft(questions) {
    return (questions || []).map((q, i) => {
      const copy = SAT.normalizeCloudQuestion(q, i + 1);
      delete copy.id;
      delete copy.assessmentVersionId;
      return copy;
    });
  };

  SAT.nextAssessmentVersionNumber = function nextAssessmentVersionNumber(versions) {
    const max = (versions || []).reduce((acc, row) => Math.max(acc, Number(row.versionNumber) || 0), 0);
    return max + 1;
  };

  SAT.assessmentHasPublishedOrArchived = function assessmentHasPublishedOrArchived(versions) {
    return (versions || []).some((v) => v.status === 'published' || v.status === 'archived');
  };

  SAT.assessmentMetadataLocked = function assessmentMetadataLocked(versions) {
    return SAT.assessmentHasPublishedOrArchived(versions);
  };

  SAT.canEditAssessmentVersion = function canEditAssessmentVersion(version) {
    return Boolean(version && version.status === 'draft');
  };

  SAT.filterLibraryAssessments = function filterLibraryAssessments(assessments, { level, assessmentType, active } = {}) {
    const lvl = SAT.normalizeLevel ? SAT.normalizeLevel(level) : String(level || '').trim();
    const type = String(assessmentType || '').trim();
    return (assessments || []).filter((row) => {
      if (lvl && (SAT.normalizeLevel ? SAT.normalizeLevel(row.level) : row.level) !== lvl) return false;
      if (type && String(row.assessmentType || '').trim() !== type) return false;
      if (active === 'active' && row.active === false) return false;
      if (active === 'inactive' && row.active !== false) return false;
      return true;
    });
  };

  SAT.composeLibraryRows = function composeLibraryRows(assessments, versions) {
    const byAssessment = {};
    (versions || []).forEach((v) => {
      const id = v.assessmentId;
      if (!byAssessment[id]) byAssessment[id] = [];
      byAssessment[id].push(v);
    });
    return (assessments || []).map((a) => {
      const list = (byAssessment[a.id] || []).slice().sort((x, y) => (y.versionNumber || 0) - (x.versionNumber || 0));
      const latest = list[0] || null;
      return {
        ...a,
        versions: list,
        versionCount: list.length,
        latestVersionStatus: latest?.status || '',
        latestVersionNumber: latest?.versionNumber || null,
        metadataLocked: SAT.assessmentMetadataLocked(list),
      };
    });
  };

  SAT.composeExamInstanceView = function composeExamInstanceView(instance, versions, assessments) {
    const version = (versions || []).find((v) => v.id === instance.assessmentVersionId) || null;
    const assessment = version
      ? (assessments || []).find((a) => a.id === version.assessmentId) || null
      : (assessments || []).find((a) => a.id === instance.assessmentId) || null;
    return {
      ...instance,
      assessmentTitle: assessment?.title || '',
      assessmentType: assessment?.assessmentType || '',
      level: assessment?.level || '',
      lessonStart: assessment?.lessonStart,
      lessonEnd: assessment?.lessonEnd,
      assessmentId: version?.assessmentId || instance.assessmentId,
      versionNumber: version?.versionNumber || null,
      versionStatus: version?.status || '',
      choiceCount: SAT.resolveChoiceCount({ version, assessment }),
    };
  };

  SAT.duplicateNumbers = function duplicateNumbers(questions) {
    const seen = new Map();
    (questions || []).forEach((q) => {
      const n = Number(q.number);
      seen.set(n, (seen.get(n) || 0) + 1);
    });
    return [...seen.entries()].filter(([, count]) => count > 1).map(([n]) => n);
  };

  SAT.validateCqPublish = function validateCqPublish(level, questions) {
    const found = SAT.getCqBlueprintForLevel?.(level) || { supported: false };
    const errors = [];
    if (!found.supported) {
      return { ok: false, cq: false, errors: ['이 레벨은 표준 CQ 구성이 없습니다.'] };
    }
    const rows = (questions || []).map((q, i) => SAT.normalizeCloudQuestion(q, i + 1));
    const expected = SAT.CQ_BLUEPRINT_QUESTION_COUNT || 20;
    if (rows.length !== expected) {
      errors.push(`CQ는 ${expected}문항이어야 합니다. 현재 ${rows.length}문항입니다.`);
    }
    const nums = rows.map((q) => Number(q.number)).sort((a, b) => a - b);
    for (let i = 1; i <= expected; i += 1) {
      if (!nums.includes(i)) errors.push(`${i}번 문항이 없습니다.`);
    }
    const dups = SAT.duplicateNumbers(rows);
    if (dups.length) errors.push(`문항 번호가 중복됩니다: ${dups.join(', ')}`);
    const answerCheck = SAT.validateStandardCqChoiceAnswers(rows, { requireFilled: true });
    if (!answerCheck.ok) errors.push(...answerCheck.errors);
    const ranges = found.blueprint?.ranges || [];
    rows.forEach((q) => {
      const range = ranges.find((r) => q.number >= r.from && q.number <= r.to);
      if (range && q.majorCategory !== range.majorCategory) {
        errors.push(`${q.number}번 대분류는 "${range.majorCategory}"여야 합니다.`);
      }
    });
    return { ok: errors.length === 0, cq: true, errors };
  };

  SAT.canAssignVersionToClass = function canAssignVersionToClass(assessment, version, cls) {
    if (!assessment || !version || !cls) {
      return { ok: false, reason: '배정할 반·버전을 선택해주세요.' };
    }
    if (version.status !== 'published') {
      return { ok: false, reason: '공개된 버전만 반에 배정할 수 있습니다.' };
    }
    const classLevel = SAT.normalizeLevel ? SAT.normalizeLevel(cls.level) : cls.level;
    const assessmentLevel = SAT.normalizeLevel ? SAT.normalizeLevel(assessment.level) : assessment.level;
    if (classLevel !== assessmentLevel) {
      return { ok: false, reason: '반 레벨과 시험 레벨이 일치하지 않습니다.' };
    }
    return { ok: true, reason: '' };
  };

  SAT.findDuplicateAssignments = function findDuplicateAssignments(instances, classId, versionId) {
    return (instances || []).filter(
      (row) => row.classId === classId && row.assessmentVersionId === versionId
    );
  };

  SAT.examInstanceWritablePatch = function examInstanceWritablePatch(patch) {
    const date = patch?.administeredDate;
    return { administeredDate: date };
  };

  SAT.filterPublishedAssessmentsForClass = function filterPublishedAssessmentsForClass(libraryRows, cls) {
    const level = SAT.normalizeLevel ? SAT.normalizeLevel(cls?.level) : cls?.level;
    return (libraryRows || []).filter((row) => {
      const rowLevel = SAT.normalizeLevel ? SAT.normalizeLevel(row.level) : row.level;
      if (level && rowLevel !== level) return false;
      return (row.versions || []).some((v) => v.status === 'published');
    });
  };

  SAT.publishedVersionsOf = function publishedVersionsOf(versions) {
    return (versions || []).filter((v) => v.status === 'published');
  };
})(window.SAT = window.SAT || {});
