/**
 * Question count resize helpers (pure functions).
 */
(function (SAT) {
  SAT.DEFAULT_QUESTION_POINTS = 1;

  SAT.hasMeaningfulQuestionData = function hasMeaningfulQuestionData(
    question,
    defaultPoints = SAT.DEFAULT_QUESTION_POINTS
  ) {
    if (!question) return false;
    if (String(question.correctAnswer ?? '').trim()) return true;
    if (String(question.majorCategory ?? '').trim()) return true;
    if (String(question.middleCategory ?? '').trim()) return true;
    if (String(question.note ?? '').trim()) return true;
    const points = Number(question.points);
    if (!Number.isNaN(points) && points !== defaultPoints) return true;
    return false;
  };

  SAT.getRemovedQuestions = function getRemovedQuestions(existingQuestions, newCount) {
    const newN = Number(newCount);
    if (Number.isNaN(newN)) return [];
    return (existingQuestions || []).filter((q) => Number(q.number) > newN);
  };

  SAT.getRemovedQuestionRangeLabel = function getRemovedQuestionRangeLabel(oldCount, newCount) {
    const oldN = Number(oldCount);
    const newN = Number(newCount);
    if (newN >= oldN) return '';
    const start = newN + 1;
    const end = oldN;
    return start === end ? `${start}번` : `${start}~${end}번`;
  };

  SAT.needsQuestionCountReductionConfirm = function needsQuestionCountReductionConfirm(
    originalCount,
    newCount,
    isNewRecord
  ) {
    if (isNewRecord) return false;
    const oldN = Number(originalCount);
    const newN = Number(newCount);
    if (Number.isNaN(oldN) || Number.isNaN(newN)) return false;
    return oldN > 0 && newN < oldN;
  };

  SAT.buildQuestionCountReductionMessage = function buildQuestionCountReductionMessage(
    oldCount,
    newCount,
    removedQuestions,
    defaultPoints = SAT.DEFAULT_QUESTION_POINTS
  ) {
    const oldN = Number(oldCount);
    const newN = Number(newCount);
    if (newN >= oldN) return null;
    const removed = removedQuestions || SAT.getRemovedQuestions([], newN);
    const range = SAT.getRemovedQuestionRangeLabel(oldN, newN);
    const hasData = removed.some((q) => SAT.hasMeaningfulQuestionData(q, defaultPoints));

    if (hasData) {
      return (
        `문항 수를 ${oldN}개에서 ${newN}개로 줄이면 ${range} 문항의\n` +
        '정답, 배점, 분류 및 메모가 삭제됩니다.\n' +
        '이 작업은 저장 후 되돌릴 수 없습니다. 계속하시겠습니까?'
      );
    }
    return (
      `문항 수를 ${oldN}개에서 ${newN}개로 줄입니다.\n` +
      `${range} 빈 문항이 제거됩니다. 계속하시겠습니까?`
    );
  };

  SAT.resizeQuestions = function resizeQuestions(existingQuestions, newCount, defaultPoints = SAT.DEFAULT_QUESTION_POINTS) {
    const count = Math.max(1, Number(newCount) || 1);
    const byNumber = new Map();
    (existingQuestions || []).forEach((q) => {
      const n = Number(q.number);
      if (n >= 1 && n <= count) {
        byNumber.set(n, { ...q, number: n });
      }
    });
    const result = [];
    for (let i = 1; i <= count; i += 1) {
      if (byNumber.has(i)) {
        result.push(byNumber.get(i));
      } else {
        result.push({
          number: i,
          correctAnswer: '',
          points: defaultPoints,
          majorCategory: '',
          middleCategory: '',
          note: '',
        });
      }
    }
    return result;
  };

  SAT.mergeQuestionsForReductionCheck = function mergeQuestionsForReductionCheck(
    persistedQuestions,
    formQuestions,
    newCount,
    originalCount
  ) {
    const newN = Number(newCount);
    const oldN = Number(originalCount);
    const byNumber = new Map();
    (persistedQuestions || []).forEach((q) => {
      const n = Number(q.number);
      if (n > newN && n <= oldN) byNumber.set(n, { ...q });
    });
    (formQuestions || []).forEach((q) => {
      const n = Number(q.number);
      if (n > newN && n <= oldN) {
        byNumber.set(n, { ...byNumber.get(n), ...q, number: n });
      }
    });
    return [...byNumber.values()].sort((a, b) => a.number - b.number);
  };
})(window.SAT = window.SAT || {});
