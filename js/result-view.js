/**
 * P5C-1 Result / answer-entry helpers.
 * answers JSON keys are AssessmentQuestion.id (UUID) only.
 * Derived scalars are never written by the client.
 */
(function (SAT) {
  SAT.RESULT_MISSING_LABEL = '미입력';

  SAT.cloudDateOnly = function cloudDateOnly(value) {
    const s = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  };

  SAT.isEnrollmentActiveOnDate = function isEnrollmentActiveOnDate(enrollment, isoDate) {
    if (!enrollment) return false;
    const day = SAT.cloudDateOnly(isoDate);
    const start = SAT.cloudDateOnly(enrollment.startDate);
    if (!day || !start) return false;
    if (enrollment.classId == null) return false;
    if (start > day) return false;
    const end = SAT.cloudDateOnly(enrollment.endDate);
    if (!end) return true;
    return end >= day;
  };

  SAT.eligibleStudentsForExamInstance = function eligibleStudentsForExamInstance(
    students,
    enrollments,
    examInstance
  ) {
    if (!examInstance?.classId || !examInstance?.administeredDate) return [];
    const eligibleIds = new Set();
    (enrollments || []).forEach((row) => {
      if (row.classId !== examInstance.classId) return;
      if (!SAT.isEnrollmentActiveOnDate(row, examInstance.administeredDate)) return;
      if (row.studentId) eligibleIds.add(row.studentId);
    });
    return (students || []).filter((student) => eligibleIds.has(student.id));
  };

  SAT.cloudAnswerValue = function cloudAnswerValue(answers, question) {
    if (!question?.id || !answers || typeof answers !== 'object') return '';
    const raw = answers[question.id];
    if (raw == null) return '';
    return String(raw);
  };

  SAT.buildCloudResultAnswers = function buildCloudResultAnswers(questions, answers) {
    const out = {};
    (questions || []).forEach((question) => {
      if (!question?.id) return;
      const raw = SAT.cloudAnswerValue(answers, question);
      if (!String(raw).trim()) return;
      out[question.id] = String(raw);
    });
    return out;
  };

  SAT.assertAnswersUseQuestionIds = function assertAnswersUseQuestionIds(answers, questions) {
    const ids = new Set((questions || []).map((q) => q && q.id).filter(Boolean));
    Object.keys(answers || {}).forEach((key) => {
      if (!ids.has(key)) {
        throw SAT.createRepositoryError({
          code: 'VALIDATION',
          message: '답안 키는 문항 UUID여야 합니다.',
        }, 'results.answers');
      }
    });
    return answers;
  };

  SAT.cloudChoiceQuickOptions = function cloudChoiceQuickOptions(assessmentType, options = {}) {
    const choiceCount = SAT.normalizeChoiceCount
      ? SAT.normalizeChoiceCount(options.choiceCount)
      : (Number(options.choiceCount) === 5 ? 5 : 4);
    if (SAT.choiceOptionsForCount) return SAT.choiceOptionsForCount(choiceCount);
    const out = [];
    for (let i = 1; i <= choiceCount; i += 1) out.push(String(i));
    return out;
  };

  SAT.displayCloudAnswer = function displayCloudAnswer(question, answers) {
    const raw = SAT.cloudAnswerValue(answers, question);
    if (!String(raw).trim()) return '—';
    if (SAT.normalizeGradingType(question?.gradingType) === SAT.GRADING_TYPE_MANUAL_BINARY) {
      return SAT.manualBinaryUiLabel(raw);
    }
    return String(raw);
  };

  SAT.previewCloudGrade = function previewCloudGrade(questions, answers) {
    let correctCount = 0;
    let earnedPoints = 0;
    let totalPoints = 0;
    (questions || []).forEach((q) => {
      const points = Number(q.points) || 1;
      totalPoints += points;
      const studentAnswer = SAT.cloudAnswerValue(answers, q);
      if (SAT.answersMatch(studentAnswer, q.correctAnswer, { ignoreCase: true })) {
        correctCount += 1;
        earnedPoints += points;
      }
    });
    return {
      correctCount,
      earnedPoints,
      totalPoints,
      percentage: totalPoints > 0 ? earnedPoints / totalPoints : 0,
    };
  };

  SAT.formatDbPercentage = function formatDbPercentage(value) {
    return SAT.formatPercent(value);
  };

  SAT.formatCloudScoreLine = function formatCloudScoreLine(result) {
    if (!result) return SAT.RESULT_MISSING_LABEL;
    const correct = result.correctCount == null ? '—' : String(result.correctCount);
    const earned = result.earnedPoints == null ? '—' : String(result.earnedPoints);
    const total = result.totalPoints == null ? '—' : String(result.totalPoints);
    return `${correct}문항 · ${earned} / ${total}점 · ${SAT.formatDbPercentage(result.percentage)}`;
  };

  SAT.resultCompletionCounts = function resultCompletionCounts(eligibleStudents, results) {
    const eligibleIds = new Set((eligibleStudents || []).map((s) => s.id));
    const completedIds = new Set();
    (results || []).forEach((row) => {
      if (eligibleIds.has(row.studentId)) completedIds.add(row.studentId);
    });
    return {
      eligibleCount: eligibleIds.size,
      completedCount: completedIds.size,
      missingCount: Math.max(0, eligibleIds.size - completedIds.size),
    };
  };

  SAT.findResultForStudentInstance = function findResultForStudentInstance(results, studentId, examInstanceId) {
    return (results || []).find((row) => (
      row.studentId === studentId && row.examInstanceId === examInstanceId
    )) || null;
  };

  SAT.cloudQuestionMetaLine = function cloudQuestionMetaLine(question) {
    if (!question) return '';
    const parts = [
      `#${question.number}`,
      SAT.normalizeGradingType(question.gradingType) === SAT.GRADING_TYPE_MANUAL_BINARY ? '서술 판정' : '객관식',
      question.majorCategory,
      question.middleCategory,
      `${Number(question.points) || 1}점`,
    ].filter(Boolean);
    return parts.join(' · ');
  };

  SAT.allQuestionsChoice = function allQuestionsChoice(questions) {
    const rows = Array.isArray(questions) ? questions : [];
    if (!rows.length) return false;
    return rows.every((q) => SAT.normalizeGradingType(q.gradingType) === SAT.GRADING_TYPE_CHOICE);
  };
})(window.SAT = window.SAT || {});
