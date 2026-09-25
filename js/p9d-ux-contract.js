/**
 * P9D — Results / Counseling / Print helpers.
 * Presentation only. Does not change scoring, Enrollment, or Result class rewrite.
 */
(function (SAT) {
  SAT.PRINT_ACTION_LABEL = '인쇄';
  SAT.PRINT_VIEW_COUNSELING_LABEL = '상담용';
  SAT.PRINT_VIEW_TEACHER_LABEL = '교사용';
  SAT.PRINT_DATE_LABEL = '출력일';
  SAT.PRINT_SELECTED_EXAM_LABEL = '선택한 시험';
  SAT.PRINT_OMIT_CLASS = 'print-omit';
  SAT.PRINT_BROWSER_HEADER_HINT = 'PDF로 저장할 때 브라우저 인쇄 설정의 「머리글과 바닥글」을 끄면 주소와 페이지 번호가 나오지 않습니다.';
  SAT.PRINT_HIDDEN_CLASS_TOKENS = [
    'no-print',
    'app-nav',
    'app-header',
    'modal',
    'modal-overlay',
    'page-guide',
    'onboard-checklist',
  ];

  SAT.formatStudentPrintName = function formatStudentPrintName(student) {
    const name = String(student?.name || '').trim();
    const english = String(student?.englishName || '').trim();
    if (name && english) return `${name} (${english})`;
    return name || english;
  };

  SAT.formatPrintViewModeLabel = function formatPrintViewModeLabel(view) {
    return SAT.isTeacherStudentResultView?.(view)
      ? SAT.PRINT_VIEW_TEACHER_LABEL
      : SAT.PRINT_VIEW_COUNSELING_LABEL;
  };

  SAT.formatPrintDate = function formatPrintDate(value) {
    const date = value instanceof Date ? value : (value ? new Date(value) : new Date());
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  SAT.resolvePrintTermName = function resolvePrintTermName({ filterTermName, currentTermName } = {}) {
    return String(filterTermName || currentTermName || '').trim();
  };

  SAT.shouldIncludeClassAverageInPrint = function shouldIncludeClassAverageInPrint(view) {
    return Boolean(SAT.isTeacherStudentResultView?.(view));
  };

  SAT.shouldShowStudentPrintAction = function shouldShowStudentPrintAction({ student } = {}) {
    return Boolean(student && (student.id || student.name));
  };

  SAT.shouldShowExamPrintAction = function shouldShowExamPrintAction({ instance } = {}) {
    return Boolean(instance && (instance.id || instance.assessmentTitle));
  };

  SAT.shouldPrintOverallTrend = function shouldPrintOverallTrend(resultCount) {
    return Number(resultCount) >= 2;
  };

  SAT.shouldPrintSecondaryCategorySection = function shouldPrintSecondaryCategorySection(middleRows) {
    return (middleRows || []).some((row) => {
      const name = String(row?.middle || '').trim();
      return Boolean(name) && Number(row.totalPoints) > 0;
    });
  };

  SAT.shouldPrintMajorTrendChart = function shouldPrintMajorTrendChart() {
    return false;
  };

  SAT.printOmitClass = function printOmitClass(shouldPrint) {
    return shouldPrint ? '' : ` ${SAT.PRINT_OMIT_CLASS}`;
  };

  SAT.shouldPrepareChartWrapperForPrint = function shouldPrepareChartWrapperForPrint(wrapper) {
    if (!wrapper) return false;
    const className = typeof wrapper === 'string'
      ? wrapper
      : String(wrapper.className || '');
    const tokens = className.split(/\s+/).filter(Boolean);
    if (tokens.includes(SAT.PRINT_OMIT_CLASS) || SAT.isPrintHiddenControl(className)) return false;
    if (typeof wrapper.closest === 'function' && wrapper.closest('.print-omit, .no-print')) return false;
    return true;
  };

  SAT.shouldShowPrintCommentSection = function shouldShowPrintCommentSection(comments) {
    return (comments || []).some((row) => {
      const text = typeof row === 'string' ? row : row?.teacherComment;
      return Boolean(String(text || '').trim());
    });
  };

  SAT.resolvePrintSelectedHistoryRow = function resolvePrintSelectedHistoryRow(history, selectedResultId) {
    if (!selectedResultId) return null;
    return (history || []).find((row) => row.resultId === selectedResultId) || null;
  };

  SAT.keepHistoricalExamClass = function keepHistoricalExamClass(historyClassName) {
    return String(historyClassName || '').trim();
  };

  SAT.formatPrintHistoryLine = function formatPrintHistoryLine(row, scoreText) {
    const date = String(row?.administeredDate || '').trim() || '—';
    const examClass = SAT.keepHistoricalExamClass(row?.className) || '—';
    const score = String(scoreText || '').trim();
    return score ? `${date} · ${examClass} · ${score}` : `${date} · ${examClass}`;
  };

  SAT.listPrintMajorResults = function listPrintMajorResults(categoryStats) {
    return Object.values(categoryStats?.major || {})
      .filter((bucket) => Number(bucket.totalPoints) > 0)
      .sort((a, b) => String(a.major || '').localeCompare(String(b.major || ''), 'ko'))
      .map((bucket) => ({
        major: bucket.major,
        percent: SAT.formatCloudAnalyticsPercent
          ? SAT.formatCloudAnalyticsPercent(bucket.percentage)
          : '',
      }));
  };

  SAT.isPrintHiddenControl = function isPrintHiddenControl(className) {
    const tokens = String(className || '').split(/\s+/);
    return tokens.some((token) => SAT.PRINT_HIDDEN_CLASS_TOKENS.includes(token));
  };

  SAT.buildStudentResultPrintMeta = function buildStudentResultPrintMeta({
    student,
    classes,
    termName,
    view,
    printedAt,
  } = {}) {
    const englishName = String(student?.englishName || '').trim();
    return {
      studentName: String(student?.name || '').trim(),
      englishName,
      displayName: SAT.formatStudentPrintName(student),
      currentClassCaption: SAT.formatCurrentClassCaption?.(student, classes) || '',
      currentClassName: SAT.resolveCurrentClassName?.(student, classes) || '',
      termName: SAT.resolvePrintTermName({ currentTermName: termName }),
      viewMode: SAT.formatPrintViewModeLabel(view),
      viewKind: SAT.normalizeStudentResultView?.(view) || SAT.STUDENT_RESULT_VIEW_COUNSELING,
      printedAt: SAT.formatPrintDate(printedAt),
      includeClassAverage: SAT.shouldIncludeClassAverageInPrint(view),
    };
  };

  SAT.buildExamResultPrintMeta = function buildExamResultPrintMeta({
    instance,
    className,
    view,
    printedAt,
  } = {}) {
    return {
      title: String(instance?.assessmentTitle || '시험').trim(),
      date: String(instance?.administeredDate || '').trim(),
      className: String(className || '').trim(),
      viewMode: SAT.formatPrintViewModeLabel(view),
      printedAt: SAT.formatPrintDate(printedAt),
      includeClassAverage: SAT.shouldIncludeClassAverageInPrint(view),
    };
  };
})(window.SAT = window.SAT || {});
