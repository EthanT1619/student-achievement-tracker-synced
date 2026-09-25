/**
 * Application constants — single source for names and keys.
 */
(function (SAT) {
  SAT.APP_NAME = 'Student Achievement Tracker';
  SAT.APP_SHORT_NAME = 'Achievement Tracker';
  SAT.STORAGE_KEY = 'studentAchievementTrackerData';
  SAT.SCHEMA_VERSION = 2;
  SAT.DEFAULT_EXAM_TYPE = 'CQ';

  /** Initial suggestions only — not enforced limits. */
  SAT.DEFAULT_MAJOR_SUGGESTIONS = [
    'Story Comprehension',
    'Reading Comprehension',
    'Dialogue',
    'Grammar',
  ];

  SAT.DEFAULT_MIDDLE_SUGGESTIONS = [
    'Main Idea',
    'Detail',
    'Inference',
    'Vocabulary in Context',
    'Reference',
    'Sequence',
    'Appropriate Response',
    'Situation',
    'Intention',
    'Key Expression',
    'Present Perfect',
    'Countable / Uncountable',
    'Subject-Verb Agreement',
    'Tense',
    'Modal Verbs',
    'Pronouns',
    'Prepositions',
    'Sentence Structure',
  ];

  /** @deprecated Use DEFAULT_MAJOR_SUGGESTIONS — kept for backward compatibility */
  SAT.MAJOR_CATEGORIES = SAT.DEFAULT_MAJOR_SUGGESTIONS;

  SAT.ANSWER_OPTIONS_NUMERIC = ['1', '2', '3', '4', '5'];
  SAT.ANSWER_OPTIONS_ALPHA = ['A', 'B', 'C', 'D', 'E'];

  SAT.DEFAULT_STUDENT_RESULT_DISPLAY = {
    showAllExamsMetrics: true,
    showAllExamsMajorRates: true,
    showAllExamsMajorChart: true,
    showExamTitle: true,
    showExamMetrics: true,
    showClassAverage: false,
    showMajorCategoryRates: true,
    showMiddleCategoryRates: true,
    showWrongQuestions: true,
    showExamMajorChart: true,
    showTrendChart: true,
    showPrintChartTables: true,
    showTeacherComment: true,
  };

  SAT.STUDENT_RESULT_DISPLAY_OPTIONS = [
    { key: 'showAllExamsMetrics', label: '요약 수치', group: 'all' },
    { key: 'showAllExamsMajorRates', label: '대분류 정답률', group: 'all' },
    { key: 'showAllExamsMajorChart', label: '대분류 그래프', group: 'all' },
    { key: 'showExamTitle', label: '시험명', group: 'exam' },
    { key: 'showExamMetrics', label: '총점·정답수·정답률', group: 'exam' },
    { key: 'showClassAverage', label: '반 평균', group: 'exam', hint: '교사용 비교 지표' },
    { key: 'showMajorCategoryRates', label: '대분류 정답률', group: 'exam' },
    { key: 'showMiddleCategoryRates', label: '중분류 정답률', group: 'exam' },
    { key: 'showWrongQuestions', label: '틀린 문항', group: 'exam' },
    { key: 'showExamMajorChart', label: '대분류 그래프', group: 'exam' },
    { key: 'showTrendChart', label: '점수 추이 그래프', group: 'exam' },
    { key: 'showPrintChartTables', label: '인쇄용 표', group: 'exam' },
    { key: 'showTeacherComment', label: '선생님 코멘트', group: 'exam' },
  ];

  SAT.normalizeStudentResultDisplay = function normalizeStudentResultDisplay(raw) {
    const d = { ...SAT.DEFAULT_STUDENT_RESULT_DISPLAY };
    if (!raw) return d;
    if (raw.showAllExamsSummary === false) {
      d.showAllExamsMetrics = false;
      d.showAllExamsMajorRates = false;
      d.showAllExamsMajorChart = false;
    }
    if (raw.showMiddleCategory === false) d.showMiddleCategoryRates = false;
    Object.keys(d).forEach((k) => {
      if (raw[k] !== undefined) d[k] = !!raw[k];
    });
    return d;
  };
})(window.SAT = window.SAT || {});
