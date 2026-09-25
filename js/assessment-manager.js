(function (SAT) {
  const { normalizeCategory, makeMiddleKey, getMiddleDisplayName } = SAT;

  SAT.normalizeAnswer = function normalizeAnswer(value, { ignoreCase = true } = {}) {
    if (value == null) return '';
    let str = String(value).trim();
    if (ignoreCase) str = str.toUpperCase();
    if (/^\d+$/.test(str)) return String(parseInt(str, 10));
    return str;
  };

  SAT.answersMatch = function answersMatch(studentAnswer, correctAnswer, options = {}) {
    const a = SAT.normalizeAnswer(studentAnswer, options);
    const b = SAT.normalizeAnswer(correctAnswer, options);
    if (!a && !b) return false;
    return a === b;
  };

  function initCategoryBucket() {
    return { correct: 0, total: 0, points: 0, earned: 0 };
  }

  function initMiddleBucket(major, middle) {
    return {
      ...initCategoryBucket(),
      major: normalizeCategory(major),
      middle: normalizeCategory(middle),
    };
  }

  SAT.gradeAnswers = function gradeAnswers(questions, answers, options = {}) {
    let correctCount = 0;
    let earnedPoints = 0;
    let totalPoints = 0;
    const wrongQuestions = [];
    const majorStats = {};
    const middleStats = {};

    questions.forEach((q) => {
      const points = Number(q.points) || 1;
      totalPoints += points;
      const studentAnswer = answers[q.id] ?? answers[String(q.number)] ?? '';
      const isCorrect = SAT.answersMatch(studentAnswer, q.correctAnswer, options);
      if (isCorrect) {
        correctCount += 1;
        earnedPoints += points;
      } else {
        wrongQuestions.push(q.number);
      }

      const major = normalizeCategory(q.majorCategory);
      const middle = normalizeCategory(q.middleCategory);
      if (!major) return;

      if (!majorStats[major]) majorStats[major] = initCategoryBucket();
      const middleKey = makeMiddleKey(major, middle);
      if (!middleStats[middleKey]) middleStats[middleKey] = initMiddleBucket(major, middle);

      majorStats[major].total += 1;
      majorStats[major].points += points;
      middleStats[middleKey].total += 1;
      middleStats[middleKey].points += points;

      if (isCorrect) {
        majorStats[major].correct += 1;
        majorStats[major].earned += points;
        middleStats[middleKey].correct += 1;
        middleStats[middleKey].earned += points;
      }
    });

    return {
      correctCount,
      earnedPoints,
      totalPoints,
      percentage: totalPoints > 0 ? earnedPoints / totalPoints : 0,
      wrongQuestions,
      categoryStats: { major: majorStats, middle: middleStats },
    };
  };

  SAT.recomputeResultStats = function recomputeResultStats(result, questions, options = { ignoreCase: true }) {
    if (!result || !questions?.length) {
      return { categoryStats: { major: {}, middle: {} }, correctCount: 0, earnedPoints: 0, totalPoints: 0, percentage: 0 };
    }
    return SAT.gradeAnswers(questions, result.answers || {}, options);
  };

  SAT.buildResultRecord = function buildResultRecord({ examId, studentId, questions, answers, existingId, options }) {
    const graded = SAT.gradeAnswers(questions, answers, options);
    return {
      id: existingId,
      examId,
      studentId,
      answers,
      correctCount: graded.correctCount,
      earnedPoints: graded.earnedPoints,
      totalPoints: graded.totalPoints,
      percentage: graded.percentage,
      categoryStats: graded.categoryStats,
      wrongQuestions: graded.wrongQuestions,
    };
  };

  SAT.getMajorRate = function getMajorRate(categoryStats, major) {
    const bucket = categoryStats?.major?.[major];
    if (!bucket || bucket.total === 0) return null;
    return bucket.correct / bucket.total;
  };

  SAT.aggregateCategoryStatsFromResults = function aggregateCategoryStatsFromResults(results, questions, options = { ignoreCase: true }) {
    const majorAvgs = {};
    const middleAvgs = {};

    const gradedEntries = SAT.gradeResultsForExam(results, questions, options);
    gradedEntries.forEach(({ graded }) => {
      if (!graded?.categoryStats) return;
      Object.entries(graded.categoryStats.major).forEach(([cat, bucket]) => {
        if (!majorAvgs[cat]) majorAvgs[cat] = { correct: 0, total: 0 };
        majorAvgs[cat].correct += bucket.correct;
        majorAvgs[cat].total += bucket.total;
      });
      Object.entries(graded.categoryStats.middle).forEach(([key, bucket]) => {
        if (!middleAvgs[key]) {
          middleAvgs[key] = {
            correct: 0,
            total: 0,
            major: bucket.major,
            middle: bucket.middle,
          };
        }
        middleAvgs[key].correct += bucket.correct;
        middleAvgs[key].total += bucket.total;
      });
    });

    return { majorAvgs, middleAvgs };
  };

  SAT.gradeResultsForExam = function gradeResultsForExam(results, questions, options = { ignoreCase: true }) {
    const hasQuestions = Array.isArray(questions) && questions.length > 0;
    return (results || []).map((result) => ({
      result,
      graded: hasQuestions ? SAT.gradeAnswers(questions, result.answers || {}, options) : null,
    }));
  };

  SAT.computeExamOverview = function computeExamOverview(results, students, questions, options = { ignoreCase: true }) {
    const submittedStudentIds = new Set(results.map((r) => r.studentId));
    const activeStudents = students.filter((s) => s.active !== false);
    const notSubmitted = activeStudents.filter((s) => !submittedStudentIds.has(s.id));
    const hasQuestions = Array.isArray(questions) && questions.length > 0;
    const gradedResults = SAT.gradeResultsForExam(results, questions, options);

    const scores = gradedResults.map(({ result, graded }) =>
      (graded ? graded.percentage : (result.percentage ?? 0))
    );
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const questionStats = hasQuestions
      ? questions.map((q) => {
          let correct = 0;
          let answered = 0;
          results.forEach((r) => {
            const ans = r.answers?.[q.id] ?? r.answers?.[String(q.number)] ?? '';
            if (String(ans).trim()) answered += 1;
            if (SAT.answersMatch(ans, q.correctAnswer, options)) correct += 1;
          });
          const total = results.length;
          return {
            number: q.number,
            correct,
            answered,
            total,
            rate: total > 0 ? correct / total : null,
            majorCategory: q.majorCategory,
            middleCategory: q.middleCategory,
          };
        })
      : [];

    const majorAvgs = {};
    const middleAvgs = {};
    if (hasQuestions) {
      gradedResults.forEach(({ graded }) => {
        if (!graded?.categoryStats) return;
        Object.entries(graded.categoryStats.major).forEach(([cat, bucket]) => {
          if (!majorAvgs[cat]) majorAvgs[cat] = { correct: 0, total: 0 };
          majorAvgs[cat].correct += bucket.correct;
          majorAvgs[cat].total += bucket.total;
        });
        Object.entries(graded.categoryStats.middle).forEach(([key, bucket]) => {
          if (!middleAvgs[key]) {
            middleAvgs[key] = {
              correct: 0,
              total: 0,
              major: bucket.major,
              middle: bucket.middle,
            };
          }
          middleAvgs[key].correct += bucket.correct;
          middleAvgs[key].total += bucket.total;
        });
      });
    }

    return {
      submittedCount: results.length,
      notSubmitted,
      classAverage: avg,
      highest: scores.length ? Math.max(...scores) : null,
      lowest: scores.length ? Math.min(...scores) : null,
      questionStats,
      majorAvgs,
      middleAvgs,
      studentScores: gradedResults
        .map(({ result, graded }) => ({
          studentId: result.studentId,
          percentage: graded ? graded.percentage : (result.percentage ?? 0),
          earnedPoints: graded ? graded.earnedPoints : (result.earnedPoints ?? 0),
          totalPoints: graded ? graded.totalPoints : (result.totalPoints ?? 0),
          correctCount: graded ? graded.correctCount : (result.correctCount ?? 0),
        }))
        .sort((a, b) => b.percentage - a.percentage),
    };
  };

  SAT.getClassAverageForExam = function getClassAverageForExam(results, questions, options = { ignoreCase: true }) {
    if (!results.length) return null;
    if (!questions?.length) {
      return results.reduce((sum, r) => sum + r.percentage, 0) / results.length;
    }
    const scores = results.map((r) => SAT.gradeAnswers(questions, r.answers || {}, options).percentage);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  SAT.aggregateStudentResultsAcrossExams = function aggregateStudentResultsAcrossExams(results, questionsByExam, options = { ignoreCase: true }) {
    const majorStats = {};
    const middleStats = {};
    let correctCount = 0;
    let earnedPoints = 0;
    let totalPoints = 0;
    let questionCount = 0;
    const examPercentages = [];

    results.forEach((r) => {
      const questions = questionsByExam?.[r.examId] || [];
      if (!questions.length) return;
      const graded = SAT.gradeAnswers(questions, r.answers || {}, options);
      correctCount += graded.correctCount;
      earnedPoints += graded.earnedPoints;
      totalPoints += graded.totalPoints;
      questionCount += questions.length;
      examPercentages.push(graded.percentage);

      Object.entries(graded.categoryStats.major).forEach(([cat, bucket]) => {
        if (!majorStats[cat]) majorStats[cat] = initCategoryBucket();
        majorStats[cat].correct += bucket.correct;
        majorStats[cat].total += bucket.total;
      });
      Object.entries(graded.categoryStats.middle).forEach(([key, bucket]) => {
        if (!middleStats[key]) middleStats[key] = initMiddleBucket(bucket.major, bucket.middle);
        middleStats[key].correct += bucket.correct;
        middleStats[key].total += bucket.total;
      });
    });

    const examCount = examPercentages.length;
    const avgExamPercentage = examCount
      ? examPercentages.reduce((a, b) => a + b, 0) / examCount
      : 0;

    return {
      examCount,
      avgExamPercentage,
      correctCount,
      earnedPoints,
      totalPoints,
      questionCount,
      percentage: totalPoints > 0 ? earnedPoints / totalPoints : 0,
      categoryStats: { major: majorStats, middle: middleStats },
    };
  };

  SAT.computeAllExamsOverview = function computeAllExamsOverview(exams, students, results, questionsByExam, options = { ignoreCase: true }) {
    let totalEarned = 0;
    let totalPoints = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;
    const majorAvgs = {};
    const middleAvgs = {};
    const percentages = [];

    results.forEach((r) => {
      const questions = questionsByExam?.[r.examId] || [];
      if (!questions.length) return;
      const graded = SAT.gradeAnswers(questions, r.answers || {}, options);
      totalEarned += graded.earnedPoints;
      totalPoints += graded.totalPoints;
      totalCorrect += graded.correctCount;
      totalQuestions += questions.length;
      percentages.push(graded.percentage);

      Object.entries(graded.categoryStats.major).forEach(([cat, bucket]) => {
        if (!majorAvgs[cat]) majorAvgs[cat] = { correct: 0, total: 0 };
        majorAvgs[cat].correct += bucket.correct;
        majorAvgs[cat].total += bucket.total;
      });
      Object.entries(graded.categoryStats.middle).forEach(([key, bucket]) => {
        if (!middleAvgs[key]) {
          middleAvgs[key] = { correct: 0, total: 0, major: bucket.major, middle: bucket.middle };
        }
        middleAvgs[key].correct += bucket.correct;
        middleAvgs[key].total += bucket.total;
      });
    });

    const perExam = exams
      .map((exam) => {
        const examResults = results.filter((r) => r.examId === exam.id);
        const classStudents = students.filter((s) => s.classId === exam.classId && s.active !== false);
        const questions = questionsByExam?.[exam.id] || [];
        const overview = questions.length
          ? SAT.computeExamOverview(examResults, classStudents, questions, options)
          : null;
        return { exam, resultCount: examResults.length, overview };
      })
      .sort((a, b) => new Date(b.exam.date) - new Date(a.exam.date));

    return {
      examCount: exams.length,
      resultCount: results.length,
      overallAvg: percentages.length ? percentages.reduce((a, b) => a + b, 0) / percentages.length : null,
      totalEarned,
      totalPoints,
      totalCorrect,
      totalQuestions,
      majorAvgs,
      middleAvgs,
      perExam,
    };
  };

  SAT.getStudentExamTrend = function getStudentExamTrend(results, exams, questionsByExam, options = { ignoreCase: true }) {
    const examMap = new Map(exams.map((e) => [e.id, e]));
    return results
      .map((r) => {
        const questions = questionsByExam?.[r.examId] || [];
        const graded = questions.length
          ? SAT.gradeAnswers(questions, r.answers || {}, options)
          : { percentage: r.percentage, earnedPoints: r.earnedPoints, totalPoints: r.totalPoints };
        return {
          examId: r.examId,
          title: examMap.get(r.examId)?.title || '—',
          date: examMap.get(r.examId)?.date || '',
          percentage: graded.percentage,
          earnedPoints: graded.earnedPoints,
          totalPoints: graded.totalPoints,
        };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  SAT.detectAnswerMode = function detectAnswerMode(questions) {
    const answers = questions.map((q) => SAT.normalizeAnswer(q.correctAnswer, { ignoreCase: false }));
    const alphaCount = answers.filter((a) => /^[A-E]$/i.test(a)).length;
    const numCount = answers.filter((a) => /^[1-5]$/.test(a)).length;
    if (alphaCount > numCount) return 'alpha';
    if (numCount > 0) return 'numeric';
    return 'text';
  };
})(window.SAT = window.SAT || {});
