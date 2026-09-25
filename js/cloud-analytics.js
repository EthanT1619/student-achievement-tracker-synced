/**
 * P5C-2 Cloud analytics — pure functions only.
 * Inputs: Cloud Result + ExamInstance + Version Questions + Class/Term.
 * No DB I/O, no DOM, no localStorage, no Result.categoryStats.
 * Overall score SoT = Result scalars. Category SoT = answers + that version's questions.
 */
(function (SAT) {
  SAT.CLOUD_ANALYTICS_MATCH_OPTIONS = { ignoreCase: true };
  SAT.CLOUD_ANALYTICS_MAX_LINE_SERIES = 4;

  SAT.CLOUD_ANALYTICS_EMPTY = {
    results: '아직 입력된 CQ 결과가 없습니다.',
    category: '해당 범주의 기록이 없습니다.',
    filter: '선택한 조건에 해당하는 결과가 없습니다.',
  };

  SAT.CLOUD_CQ_CONTEXT_LINE = '이 화면은 기록된 CQ 결과를 기준으로 합니다.';

  SAT.cloudPointsRatio = function cloudPointsRatio(earned, total) {
    const t = Number(total);
    if (!(t > 0) || !Number.isFinite(t)) return null;
    const e = Number(earned);
    if (!Number.isFinite(e)) return null;
    return e / t;
  };

  SAT.formatCloudAnalyticsPercent = function formatCloudAnalyticsPercent(ratio) {
    if (ratio == null || !Number.isFinite(Number(ratio))) return '데이터 없음';
    const rounded = Math.round(Number(ratio) * 1000) / 10;
    return `${rounded.toFixed(1)}%`;
  };

  SAT.cloudDisplayPercent = function cloudDisplayPercent(ratio) {
    if (ratio == null || !Number.isFinite(Number(ratio))) return null;
    return Number(ratio) * 100;
  };

  SAT.emptyCloudCategoryBucket = function emptyCloudCategoryBucket(extra = {}) {
    return {
      attemptedQuestions: 0,
      correctQuestions: 0,
      earnedPoints: 0,
      totalPoints: 0,
      percentage: null,
      ...extra,
    };
  };

  SAT.finalizeCloudCategoryBucket = function finalizeCloudCategoryBucket(bucket) {
    if (!bucket) return bucket;
    bucket.percentage = SAT.cloudPointsRatio(bucket.earnedPoints, bucket.totalPoints);
    return bucket;
  };

  SAT.cloudQuestionIsCorrect = function cloudQuestionIsCorrect(question, answers) {
    const raw = SAT.cloudAnswerValue ? SAT.cloudAnswerValue(answers, question) : '';
    if (!String(raw).trim()) return false;
    return SAT.answersMatch(raw, question?.correctAnswer, SAT.CLOUD_ANALYTICS_MATCH_OPTIONS);
  };

  SAT.computeCloudResultCategoryStats = function computeCloudResultCategoryStats(questions, answers) {
    const major = {};
    const middle = {};
    (questions || []).forEach((question) => {
      const maj = SAT.normalizeCategory ? SAT.normalizeCategory(question?.majorCategory) : String(question?.majorCategory || '').trim();
      const mid = SAT.normalizeCategory ? SAT.normalizeCategory(question?.middleCategory) : String(question?.middleCategory || '').trim();
      const points = Number(question?.points) > 0 ? Number(question.points) : 1;
      const correct = SAT.cloudQuestionIsCorrect(question, answers);
      if (maj) {
        if (!major[maj]) major[maj] = SAT.emptyCloudCategoryBucket({ major: maj });
        major[maj].attemptedQuestions += 1;
        major[maj].totalPoints += points;
        if (correct) {
          major[maj].correctQuestions += 1;
          major[maj].earnedPoints += points;
        }
      }
      if (maj && mid) {
        const key = SAT.makeMiddleKey ? SAT.makeMiddleKey(maj, mid) : `${maj}::${mid}`;
        if (!middle[key]) middle[key] = SAT.emptyCloudCategoryBucket({ major: maj, middle: mid, key });
        middle[key].attemptedQuestions += 1;
        middle[key].totalPoints += points;
        if (correct) {
          middle[key].correctQuestions += 1;
          middle[key].earnedPoints += points;
        }
      }
    });
    Object.values(major).forEach(SAT.finalizeCloudCategoryBucket);
    Object.values(middle).forEach(SAT.finalizeCloudCategoryBucket);
    return { major, middle };
  };

  SAT.mergeCloudCategoryBuckets = function mergeCloudCategoryBuckets(target, source) {
    if (!source) return target;
    target.attemptedQuestions += Number(source.attemptedQuestions) || 0;
    target.correctQuestions += Number(source.correctQuestions) || 0;
    target.earnedPoints += Number(source.earnedPoints) || 0;
    target.totalPoints += Number(source.totalPoints) || 0;
    return SAT.finalizeCloudCategoryBucket(target);
  };

  SAT.mergeCloudCategoryStats = function mergeCloudCategoryStats(statsList) {
    const major = {};
    const middle = {};
    (statsList || []).forEach((stats) => {
      Object.entries(stats?.major || {}).forEach(([name, bucket]) => {
        if (!major[name]) major[name] = SAT.emptyCloudCategoryBucket({ major: name });
        SAT.mergeCloudCategoryBuckets(major[name], bucket);
      });
      Object.entries(stats?.middle || {}).forEach(([key, bucket]) => {
        if (!middle[key]) {
          middle[key] = SAT.emptyCloudCategoryBucket({
            key,
            major: bucket.major,
            middle: bucket.middle,
          });
        }
        SAT.mergeCloudCategoryBuckets(middle[key], bucket);
      });
    });
    return { major, middle };
  };

  SAT.averageCloudResultPercentages = function averageCloudResultPercentages(results) {
    const scores = (results || [])
      .map((row) => row?.percentage)
      .filter((value) => value != null && Number.isFinite(Number(value)));
    if (!scores.length) return null;
    return scores.reduce((sum, value) => sum + Number(value), 0) / scores.length;
  };

  SAT.composeCloudAnalyticsExamContext = function composeCloudAnalyticsExamContext(
    instance,
    versions,
    assessments,
    classes,
    terms
  ) {
    const view = SAT.composeExamInstanceView
      ? SAT.composeExamInstanceView(instance || {}, versions, assessments)
      : { ...(instance || {}) };
    const cls = (classes || []).find((row) => row.id === instance?.classId) || null;
    const term = cls ? (terms || []).find((row) => row.id === cls.termId) || null : null;
    return {
      ...view,
      examInstanceId: instance?.id || view.id,
      classId: instance?.classId || '',
      className: cls?.name || '',
      termId: cls?.termId || '',
      termName: term?.name || '',
      classLevel: cls?.level || '',
      assessmentLevel: view.level || '',
      displayLevel: cls?.level || view.level || '',
    };
  };

  SAT.buildCloudStudentHistoryRows = function buildCloudStudentHistoryRows({
    results,
    examInstances,
    versions,
    assessments,
    classes,
    terms,
    questionsByVersionId,
  }) {
    const instanceMap = new Map((examInstances || []).map((row) => [row.id, row]));
    return (results || []).map((result) => {
      const instance = instanceMap.get(result.examInstanceId) || null;
      const context = SAT.composeCloudAnalyticsExamContext(
        instance || { id: result.examInstanceId },
        versions,
        assessments,
        classes,
        terms
      );
      const versionId = instance?.assessmentVersionId || context.assessmentVersionId || '';
      const questions = versionId && questionsByVersionId
        ? (questionsByVersionId[versionId] || [])
        : [];
      const categoryStats = questions.length
        ? SAT.computeCloudResultCategoryStats(questions, result.answers)
        : { major: {}, middle: {} };
      return {
        resultId: result.id,
        studentId: result.studentId,
        examInstanceId: result.examInstanceId,
        assessmentVersionId: versionId,
        assessmentTitle: context.assessmentTitle || '',
        versionNumber: context.versionNumber,
        administeredDate: context.administeredDate || '',
        classId: context.classId,
        className: context.className,
        termId: context.termId,
        termName: context.termName,
        level: context.displayLevel,
        classLevel: context.classLevel,
        assessmentLevel: context.assessmentLevel,
        correctCount: result.correctCount,
        earnedPoints: result.earnedPoints,
        totalPoints: result.totalPoints,
        percentage: result.percentage,
        teacherComment: String(result.teacherComment || '').trim(),
        answers: result.answers,
        categoryStats,
        questions,
      };
    });
  };

  SAT.compareAdministeredDateAsc = function compareAdministeredDateAsc(a, b) {
    const da = String(a?.administeredDate || '');
    const db = String(b?.administeredDate || '');
    if (da !== db) return da.localeCompare(db);
    return String(a?.examInstanceId || '').localeCompare(String(b?.examInstanceId || ''));
  };

  SAT.sortCloudHistoryByDateAsc = function sortCloudHistoryByDateAsc(rows) {
    return (rows || []).slice().sort(SAT.compareAdministeredDateAsc);
  };

  SAT.sortCloudHistoryByDateDesc = function sortCloudHistoryByDateDesc(rows) {
    return SAT.sortCloudHistoryByDateAsc(rows).reverse();
  };

  SAT.filterCloudHistoryRows = function filterCloudHistoryRows(rows, { termId, level } = {}) {
    return (rows || []).filter((row) => {
      if (termId && row.termId !== termId) return false;
      if (level && row.level !== level && row.classLevel !== level && row.assessmentLevel !== level) return false;
      return true;
    });
  };

  SAT.collectCloudHistoryFilterOptions = function collectCloudHistoryFilterOptions(rows) {
    const terms = [];
    const termSeen = new Set();
    const levels = [];
    const levelSeen = new Set();
    (rows || []).forEach((row) => {
      if (row.termId && !termSeen.has(row.termId)) {
        termSeen.add(row.termId);
        terms.push({ id: row.termId, name: row.termName || row.termId });
      }
      const level = row.classLevel || row.level;
      if (level && !levelSeen.has(level)) {
        levelSeen.add(level);
        levels.push(level);
      }
    });
    return {
      terms: terms.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko')),
      levels: levels.sort((a, b) => String(a).localeCompare(String(b), 'ko')),
    };
  };

  SAT.sanitizeCloudHistoryFilters = function sanitizeCloudHistoryFilters(filters, options) {
    const termIds = new Set((options?.terms || []).map((row) => row.id));
    const levels = new Set(options?.levels || []);
    const majors = new Set(options?.majors || []);
    return {
      termId: termIds.has(filters?.termId) ? filters.termId : '',
      level: levels.has(filters?.level) ? filters.level : '',
      majorCategory: majors.has(filters?.majorCategory) ? filters.majorCategory : '',
    };
  };

  SAT.buildCloudOverallTrend = function buildCloudOverallTrend(rows) {
    return SAT.sortCloudHistoryByDateAsc(rows).map((row) => ({
      examInstanceId: row.examInstanceId,
      resultId: row.resultId,
      title: row.assessmentTitle || '시험',
      date: row.administeredDate,
      versionNumber: row.versionNumber,
      level: row.level,
      correctCount: row.correctCount,
      earnedPoints: row.earnedPoints,
      totalPoints: row.totalPoints,
      percentage: row.percentage,
    }));
  };

  SAT.buildCloudMajorCategoryTrend = function buildCloudMajorCategoryTrend(rows) {
    const series = {};
    SAT.sortCloudHistoryByDateAsc(rows).forEach((row) => {
      Object.entries(row.categoryStats?.major || {}).forEach(([name, bucket]) => {
        if (!(Number(bucket.totalPoints) > 0) || bucket.percentage == null) return;
        if (!series[name]) series[name] = [];
        series[name].push({
          examInstanceId: row.examInstanceId,
          resultId: row.resultId,
          title: row.assessmentTitle || '시험',
          date: row.administeredDate,
          major: name,
          percentage: bucket.percentage,
          earnedPoints: bucket.earnedPoints,
          totalPoints: bucket.totalPoints,
        });
      });
    });
    const categories = Object.keys(series).sort((a, b) => a.localeCompare(b, 'ko'));
    return { categories, series };
  };

  SAT.cloudMajorTrendChartMode = function cloudMajorTrendChartMode(categories) {
    const names = categories || [];
    if (names.length <= SAT.CLOUD_ANALYTICS_MAX_LINE_SERIES) return 'multi';
    return 'selector';
  };

  SAT.buildCloudCategorySummary = function buildCloudCategorySummary(rows) {
    return SAT.mergeCloudCategoryStats((rows || []).map((row) => row.categoryStats));
  };

  SAT.middleBreakdownForMajor = function middleBreakdownForMajor(summary, majorName) {
    const major = SAT.normalizeCategory ? SAT.normalizeCategory(majorName) : String(majorName || '').trim();
    return Object.values(summary?.middle || {})
      .filter((bucket) => bucket.middle && bucket.major === major && Number(bucket.totalPoints) > 0)
      .sort((a, b) => String(a.middle).localeCompare(String(b.middle), 'ko'));
  };

  SAT.describeCloudScoreSequence = function describeCloudScoreSequence(points) {
    const rows = (points || []).filter((row) => row?.percentage != null && Number.isFinite(Number(row.percentage)));
    if (rows.length < 2) return '';
    const recent = rows.slice(-3);
    const parts = recent.map((row) => SAT.formatCloudAnalyticsPercent(row.percentage));
    return `최근 ${recent.length}회 CQ: ${parts.join(' → ')}`;
  };

  SAT.cloudTeacherCommentHistory = function cloudTeacherCommentHistory(rows) {
    return SAT.sortCloudHistoryByDateDesc(rows).filter((row) => row.teacherComment);
  };

  SAT.computeCloudExamInstanceSummary = function computeCloudExamInstanceSummary({
    eligibleStudents,
    results,
    questions,
  }) {
    const eligible = eligibleStudents || [];
    const submitted = results || [];
    const counts = SAT.resultCompletionCounts
      ? SAT.resultCompletionCounts(eligible, submitted)
      : {
        eligibleCount: eligible.length,
        completedCount: submitted.filter((row) => eligible.some((student) => student.id === row.studentId)).length,
        missingCount: Math.max(0, eligible.length - submitted.length),
      };
    const percentages = submitted
      .map((row) => row.percentage)
      .filter((value) => value != null && Number.isFinite(Number(value)));
    const average = SAT.averageCloudResultPercentages(submitted);
    const categoryStats = SAT.mergeCloudCategoryStats(
      submitted.map((row) => SAT.computeCloudResultCategoryStats(questions, row.answers))
    );
    return {
      eligibleCount: counts.eligibleCount,
      completedCount: counts.completedCount,
      missingCount: counts.missingCount,
      averagePercentage: average,
      minPercentage: percentages.length ? Math.min(...percentages) : null,
      maxPercentage: percentages.length ? Math.max(...percentages) : null,
      sampleSize: submitted.length,
      categoryStats,
    };
  };

  SAT.buildCloudClassAverageTrend = function buildCloudClassAverageTrend({
    instances,
    results,
    enrollments,
    students,
  }) {
    return SAT.sortCloudHistoryByDateAsc(
      (instances || []).map((instance) => {
        const eligible = SAT.eligibleStudentsForExamInstance
          ? SAT.eligibleStudentsForExamInstance(students, enrollments, instance)
          : [];
        const submitted = (results || []).filter((row) => row.examInstanceId === instance.id);
        const average = SAT.averageCloudResultPercentages(submitted);
        return {
          examInstanceId: instance.id,
          title: instance.assessmentTitle || '시험',
          date: instance.administeredDate,
          administeredDate: instance.administeredDate,
          averagePercentage: average,
          eligibleCount: eligible.length,
          submittedCount: submitted.length,
          percentage: average,
        };
      }).filter((row) => row.averagePercentage != null)
    );
  };

  SAT.buildCloudStudentVsClassOverlay = function buildCloudStudentVsClassOverlay(studentTrend, classTrend) {
    const classByInstance = new Map((classTrend || []).map((row) => [row.examInstanceId, row]));
    return (studentTrend || []).map((point) => {
      const classPoint = classByInstance.get(point.examInstanceId);
      return {
        ...point,
        classAveragePercentage: classPoint ? classPoint.averagePercentage : null,
        classSampleSize: classPoint ? classPoint.submittedCount : 0,
      };
    }).filter((row) => row.percentage != null);
  };

  SAT.collectVersionIdsForResults = function collectVersionIdsForResults(results, examInstances) {
    const instanceMap = new Map((examInstances || []).map((row) => [row.id, row]));
    const ids = [];
    const seen = new Set();
    (results || []).forEach((result) => {
      const versionId = instanceMap.get(result.examInstanceId)?.assessmentVersionId;
      if (versionId && !seen.has(versionId)) {
        seen.add(versionId);
        ids.push(versionId);
      }
    });
    return ids;
  };

  SAT.buildCloudStudentAnalyticsView = function buildCloudStudentAnalyticsView({
    studentId,
    results,
    examInstances,
    versions,
    assessments,
    classes,
    terms,
    questionsByVersionId,
    enrollments,
    students,
    filters,
    isTeacher,
  }) {
    const studentResults = (results || []).filter((row) => row.studentId === studentId);
    const allRows = SAT.buildCloudStudentHistoryRows({
      results: studentResults,
      examInstances,
      versions,
      assessments,
      classes,
      terms,
      questionsByVersionId,
    });
    const filterOptions = SAT.collectCloudHistoryFilterOptions(allRows);
    const majors = Object.keys(SAT.buildCloudCategorySummary(allRows).major);
    const safeFilters = SAT.sanitizeCloudHistoryFilters(filters, {
      terms: filterOptions.terms,
      levels: filterOptions.levels,
      majors,
    });
    const filteredRows = SAT.filterCloudHistoryRows(allRows, safeFilters);
    const overallTrend = SAT.buildCloudOverallTrend(filteredRows);
    const majorTrend = SAT.buildCloudMajorCategoryTrend(filteredRows);
    const summary = SAT.buildCloudCategorySummary(filteredRows);
    const selectedMajor = safeFilters.majorCategory || majorTrend.categories[0] || '';
    const middleRows = SAT.middleBreakdownForMajor(summary, selectedMajor);
    let classTrend = [];
    let overlay = [];
    if (isTeacher) {
      classTrend = SAT.buildCloudClassAverageTrend({
        instances: examInstances,
        results,
        enrollments,
        students,
      });
      overlay = SAT.buildCloudStudentVsClassOverlay(overallTrend, classTrend);
    }
    return {
      emptyKind: !allRows.length ? 'results' : (!filteredRows.length ? 'filter' : ''),
      emptyMessage: !allRows.length
        ? SAT.CLOUD_ANALYTICS_EMPTY.results
        : (!filteredRows.length ? SAT.CLOUD_ANALYTICS_EMPTY.filter : ''),
      filterOptions,
      filters: { ...safeFilters, majorCategory: selectedMajor },
      historyDesc: SAT.sortCloudHistoryByDateDesc(filteredRows),
      overallTrend,
      majorTrend,
      categorySummary: summary,
      middleRows,
      selectedMajor,
      commentHistory: SAT.cloudTeacherCommentHistory(filteredRows),
      scoreSequence: SAT.describeCloudScoreSequence(overallTrend),
      classTrend: isTeacher ? classTrend : [],
      overlay: isTeacher ? overlay : [],
      showClassAverage: Boolean(isTeacher),
    };
  };
})(window.SAT = window.SAT || {});
