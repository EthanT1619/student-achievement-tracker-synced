/**
 * P9C-2 — Answer Entry compact workspace copy/helpers.
 * Does not change save, draft pin, or recovery semantics.
 */
(function (SAT) {
  SAT.ANSWER_PREV_QUESTION_LABEL = '이전 문항';
  SAT.ANSWER_NEXT_QUESTION_LABEL = '다음 문항';
  SAT.ANSWER_KEYBOARD_HINT = '객관식은 숫자키 1–4, 방향키로 이동.';
  SAT.ANSWER_NEW_RESULT_LABEL = '새 결과';
  SAT.ANSWER_SAVED_RESULT_LABEL = '저장됨';
  SAT.ANSWER_UNSAVED_STATUS = '아직 저장되지 않음 · 미입력은 0점이 아님';
  SAT.ANSWER_SAVED_STATUS_SUFFIX = '미입력은 0점이 아님';

  SAT.shouldStartTeacherCommentCollapsed = function shouldStartTeacherCommentCollapsed() {
    return true;
  };

  SAT.hasTeacherCommentText = function hasTeacherCommentText(text) {
    return Boolean(String(text || '').trim());
  };

  SAT.teacherCommentToggleLabel = function teacherCommentToggleLabel({ hasComment, open } = {}) {
    if (open) return '교사 코멘트 접기';
    return hasComment ? '교사 코멘트 있음' : '교사 코멘트';
  };

  SAT.answerQuestionProgress = function answerQuestionProgress(questions, answers) {
    const rows = Array.isArray(questions) ? questions : [];
    let filled = 0;
    rows.forEach((q) => {
      const value = SAT.cloudAnswerValue
        ? SAT.cloudAnswerValue(answers, q)
        : (answers?.[q?.id] ?? answers?.[String(q?.number)] ?? '');
      if (String(value || '').trim()) filled += 1;
    });
    return { filled, total: rows.length };
  };

  SAT.answerEntrySaveStatus = function answerEntrySaveStatus({ saved, scoreLine } = {}) {
    if (saved) {
      return {
        kind: 'saved',
        badge: SAT.ANSWER_SAVED_RESULT_LABEL,
        text: scoreLine
          ? `${scoreLine} · ${SAT.ANSWER_SAVED_STATUS_SUFFIX}`
          : SAT.ANSWER_SAVED_STATUS_SUFFIX,
      };
    }
    return {
      kind: 'new',
      badge: SAT.ANSWER_NEW_RESULT_LABEL,
      text: SAT.ANSWER_UNSAVED_STATUS,
    };
  };
})(window.SAT = window.SAT || {});
