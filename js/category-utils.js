/**
 * Category normalization, composite keys, and suggestion helpers.
 */
(function (SAT) {
  SAT.normalizeCategory = function normalizeCategory(value) {
    if (value == null) return '';
    return String(value).trim().replace(/\s+/g, ' ');
  };

  SAT.makeMiddleKey = function makeMiddleKey(major, middle) {
    const maj = SAT.normalizeCategory(major);
    const mid = SAT.normalizeCategory(middle);
    return `${maj}::${mid}`;
  };

  SAT.getMiddleDisplayName = function getMiddleDisplayName(middle) {
    const normalized = SAT.normalizeCategory(middle);
    return normalized || '미분류';
  };

  SAT.getMiddleStatText = function getMiddleStatText(bucket) {
    const major = bucket?.major || '';
    const middle = SAT.getMiddleDisplayName(bucket?.middle);
    return `${major} · ${middle}`;
  };

  SAT.collectMajorSuggestions = function collectMajorSuggestions(allQuestions) {
    const defaults = SAT.DEFAULT_MAJOR_SUGGESTIONS || [];
    const fromData = (allQuestions || [])
      .map((q) => SAT.normalizeCategory(q.majorCategory))
      .filter(Boolean);
    return [...new Set([...defaults, ...fromData])].sort((a, b) => a.localeCompare(b, 'ko'));
  };

  SAT.collectMiddleSuggestions = function collectMiddleSuggestions(allQuestions, selectedMajor) {
    const defaults = SAT.DEFAULT_MIDDLE_SUGGESTIONS || [];
    const major = SAT.normalizeCategory(selectedMajor);
    const fromMajor = (allQuestions || [])
      .filter((q) => major && SAT.normalizeCategory(q.majorCategory) === major)
      .map((q) => SAT.normalizeCategory(q.middleCategory))
      .filter(Boolean);
    const fromAll = (allQuestions || [])
      .map((q) => SAT.normalizeCategory(q.middleCategory))
      .filter(Boolean);
    const merged = fromMajor.length ? [...fromMajor, ...fromAll] : fromAll;
    return [...new Set([...defaults, ...merged])].sort((a, b) => a.localeCompare(b, 'ko'));
  };

  SAT.getUniqueMajorsFromQuestions = function getUniqueMajorsFromQuestions(questions) {
    return [...new Set(
      (questions || []).map((q) => SAT.normalizeCategory(q.majorCategory)).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ko'));
  };

  SAT.formatQuestionRateDisplay = function formatQuestionRateDisplay(stat) {
    if (!stat || stat.total === 0) return '데이터 없음';
    const pct = Math.round((stat.correct / stat.total) * 100);
    return `${pct}% · 응답 ${stat.answered}/${stat.total}`;
  };

  SAT.collectExamTypeSuggestions = function collectExamTypeSuggestions(exams) {
    const defaults = [SAT.DEFAULT_EXAM_TYPE || 'CQ'];
    const fromData = (exams || [])
      .map((e) => SAT.normalizeCategory(e.examType))
      .filter(Boolean);
    return [...new Set([...defaults, ...fromData])].sort((a, b) => a.localeCompare(b, 'ko'));
  };
})(window.SAT = window.SAT || {});
