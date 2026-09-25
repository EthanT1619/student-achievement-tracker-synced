/**
 * Question range bulk patch helpers (pure functions).
 */
(function (SAT) {
  SAT.QUESTION_RANGE_PATCH_FIELD_LABELS = {
    majorCategory: '대분류',
    middleCategory: '중분류',
    points: '배점',
    note: '메모',
  };

  SAT.validateQuestionRangePatch = function validateQuestionRangePatch(
    startNumber,
    endNumber,
    questionCount
  ) {
    const start = Number(startNumber);
    const end = Number(endNumber);
    const count = Number(questionCount);
    if (!Number.isFinite(start) || !Number.isInteger(start) || start < 1) {
      return { valid: false, error: '시작 문항 번호는 1 이상의 정수여야 합니다.' };
    }
    if (!Number.isFinite(end) || !Number.isInteger(end) || end < 1) {
      return { valid: false, error: '끝 문항 번호는 1 이상의 정수여야 합니다.' };
    }
    if (start > end) {
      return { valid: false, error: '시작 번호는 끝 번호보다 클 수 없습니다.' };
    }
    if (!Number.isFinite(count) || count < 1) {
      return { valid: false, error: '문항 수가 올바르지 않습니다.' };
    }
    if (end > count) {
      return { valid: false, error: `끝 번호는 현재 문항 수(${count})를 초과할 수 없습니다.` };
    }
    return {
      valid: true,
      startNumber: start,
      endNumber: end,
      affectedCount: end - start + 1,
    };
  };

  SAT.buildQuestionRangePatchFields = function buildQuestionRangePatchFields(raw) {
    const fields = {};
    if (raw?.applyMajorCategory) {
      fields.majorCategory = String(raw.majorCategory ?? '');
    }
    if (raw?.applyMiddleCategory) {
      fields.middleCategory = String(raw.middleCategory ?? '');
    }
    if (raw?.applyPoints) {
      fields.points = raw.points;
    }
    if (raw?.applyNote) {
      fields.note = String(raw.note ?? '');
    }
    return fields;
  };

  SAT.validateQuestionRangePatchFields = function validateQuestionRangePatchFields(fields) {
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      return { valid: false, error: '적용할 항목을 하나 이상 선택해주세요.' };
    }
    if (fields.points !== undefined) {
      const pts = Number(fields.points);
      if (!Number.isFinite(pts) || pts <= 0) {
        return { valid: false, error: '배점은 0보다 큰 숫자여야 합니다.' };
      }
    }
    return { valid: true, fields };
  };

  SAT.applyQuestionRangePatch = function applyQuestionRangePatch(questions, { startNumber, endNumber, fields }) {
    const start = Number(startNumber);
    const end = Number(endNumber);
    const patchFields = fields || {};
    const byNumber = new Map((questions || []).map((q) => [Number(q.number), { ...q }]));

    for (let n = start; n <= end; n += 1) {
      const current = byNumber.get(n) || {
        number: n,
        correctAnswer: '',
        points: SAT.DEFAULT_QUESTION_POINTS || 1,
        majorCategory: '',
        middleCategory: '',
        note: '',
      };
      const patched = { ...current, number: n };
      if (patchFields.majorCategory !== undefined) {
        patched.majorCategory = SAT.normalizeCategory(patchFields.majorCategory);
      }
      if (patchFields.middleCategory !== undefined) {
        patched.middleCategory = SAT.normalizeCategory(patchFields.middleCategory);
      }
      if (patchFields.points !== undefined) {
        patched.points = Number(patchFields.points);
      }
      if (patchFields.note !== undefined) {
        patched.note = String(patchFields.note ?? '').trim();
      }
      byNumber.set(n, patched);
    }

    const maxNum = Math.max(0, ...byNumber.keys(), end);
    const result = [];
    for (let n = 1; n <= maxNum; n += 1) {
      if (byNumber.has(n)) result.push(byNumber.get(n));
    }
    return result;
  };

  SAT.formatQuestionRangePatchSummary = function formatQuestionRangePatchSummary(
    startNumber,
    endNumber,
    fields,
    affectedCount
  ) {
    const start = Number(startNumber);
    const end = Number(endNumber);
    const rangeLabel = start === end ? `${start}번` : `${start}~${end}번`;
    const lines = [`${rangeLabel} 문항에 다음 값을 적용합니다.`];
    Object.entries(fields || {}).forEach(([key, value]) => {
      const label = SAT.QUESTION_RANGE_PATCH_FIELD_LABELS[key] || key;
      const display = value === '' || value == null ? '(빈 값)' : String(value);
      lines.push(`${label}: ${display}`);
    });
    lines.push(`총 ${affectedCount}개 문항이 변경됩니다. 계속하시겠습니까?`);
    return lines.join('\n');
  };

  SAT.prepareQuestionRangePatch = function prepareQuestionRangePatch(input, questionCount) {
    const range = SAT.validateQuestionRangePatch(
      input.startNumber,
      input.endNumber,
      questionCount
    );
    if (!range.valid) {
      return { valid: false, error: range.error };
    }
    const fields = SAT.buildQuestionRangePatchFields(input);
    const fieldValidation = SAT.validateQuestionRangePatchFields(fields);
    if (!fieldValidation.valid) {
      return { valid: false, error: fieldValidation.error };
    }
    return {
      valid: true,
      startNumber: range.startNumber,
      endNumber: range.endNumber,
      affectedCount: range.affectedCount,
      fields: fieldValidation.fields,
      summary: SAT.formatQuestionRangePatchSummary(
        range.startNumber,
        range.endNumber,
        fieldValidation.fields,
        range.affectedCount
      ),
    };
  };
})(window.SAT = window.SAT || {});
