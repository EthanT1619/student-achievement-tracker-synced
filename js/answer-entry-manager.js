/**
 * Answer entry parsing, validation, and keyboard helpers.
 */
(function (SAT) {
  SAT.keyToAnswerOption = function keyToAnswerOption(key, mode) {
    if (key >= '1' && key <= '5') {
      return mode === 'alpha' ? String.fromCharCode(64 + Number(key)) : key;
    }
    return null;
  };

  SAT.parseBulkAnswerInput = function parseBulkAnswerInput(input, mode) {
    const raw = String(input || '').trim();
    if (!raw) return [];

    if (mode === 'text') {
      return raw.split(/[\s,\/\-\n\r]+/).filter(Boolean);
    }

    const splitParts = raw.split(/[\s,\/\-\n\r]+/).filter(Boolean);
    const tokens = [];

    if (splitParts.length === 1) {
      const part = splitParts[0];
      const upper = part.toUpperCase();
      if (mode === 'alpha' && /^[A-E]+$/i.test(part)) {
        for (const ch of upper) {
          if (/^[A-E]$/.test(ch)) tokens.push(ch);
        }
        return tokens;
      }
      if (mode === 'numeric' && /^[1-5]+$/.test(part)) {
        for (const ch of part) tokens.push(ch);
        return tokens;
      }
    }

    splitParts.forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;
      tokens.push(mode === 'alpha' ? trimmed.toUpperCase() : trimmed);
    });
    return tokens;
  };

  SAT.normalizeBulkToken = function normalizeBulkToken(token, mode) {
    const t = String(token).trim();
    if (!t) return '';
    if (mode === 'alpha') return t.toUpperCase();
    if (/^\d+$/.test(t)) return String(parseInt(t, 10));
    return t;
  };

  SAT.validateBulkAnswers = function validateBulkAnswers(tokens, questionCount, mode, options) {
    const errors = [];
    const warnings = [];
    const choiceCount = Number(options?.choiceCount) === 4 ? 4 : 5;
    const allowedNumeric = new RegExp(`^[1-${choiceCount}]$`);
    const allowedAlpha = /^[A-E]$/;

    tokens.forEach((tok, index) => {
      const normalized = SAT.normalizeBulkToken(tok, mode);
      const questionNumber = index + 1;
      if (mode === 'alpha') {
        if (!allowedAlpha.test(normalized)) {
          errors.push({
            questionNumber,
            message: `${questionNumber}번째 답안 "${tok}"은(는) 허용된 값이 아닙니다. (A~E)`,
          });
        }
      } else if (mode === 'numeric') {
        if (!allowedNumeric.test(normalized)) {
          errors.push({
            questionNumber,
            message: `${questionNumber}번째 답안 "${tok}"은(는) 허용된 값이 아닙니다. (1~${choiceCount})`,
          });
        }
      } else if (!normalized) {
        errors.push({
          questionNumber,
          message: `${questionNumber}번째 답안이 비어 있습니다.`,
        });
      }
    });

    if (tokens.length < questionCount) {
      const missingNums = [];
      for (let n = tokens.length + 1; n <= questionCount; n++) missingNums.push(n);
      warnings.push({
        type: 'count-short',
        questionNumbers: missingNums,
        message: `시험은 ${questionCount}문항이지만 입력된 답안은 ${tokens.length}개입니다.`,
        detail: `${missingNums.join(', ')}번은 미입력 상태로 남습니다.`,
      });
    } else if (tokens.length > questionCount) {
      warnings.push({
        type: 'count-long',
        message: `시험은 ${questionCount}문항이지만 답안 ${tokens.length}개가 입력되었습니다.`,
        detail: `초과된 ${tokens.length - questionCount}개 답안은 적용되지 않습니다.`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      errorQuestionNumbers: errors.map((e) => e.questionNumber),
      applyCount: Math.min(tokens.length, questionCount),
    };
  };

  SAT.renderBulkValidationHtml = function renderBulkValidationHtml(errors, warnings) {
    const gotoBtn = (num, label) =>
      `<button type="button" class="answer-goto-link" data-goto="${num}">${SAT.escapeHtml(label)}</button>`;

    const errorLines = (errors || []).map((err) => {
      const q = err.questionNumber;
      return `<p class="bulk-validation-line">${SAT.escapeHtml(err.message)} ${gotoBtn(q, `${q}번 문항으로 이동`)}</p>`;
    });

    const warningLines = (warnings || []).map((warn) => {
      if (typeof warn === 'string') {
        return `<p class="bulk-validation-line">${SAT.escapeHtml(warn)}</p>`;
      }
      const nums = warn.questionNumbers || [];
      const numLinks = nums.map((n) => gotoBtn(n, `${n}번`)).join(' ');
      const detail = warn.detail ? SAT.escapeHtml(warn.detail) : '';
      return `<p class="bulk-validation-line">${SAT.escapeHtml(warn.message)}${detail ? `<br>${detail}` : ''}${nums.length ? `<br>문항 이동: ${numLinks}` : ''}</p>`;
    });

    return [...errorLines, ...warningLines].join('');
  };

  SAT.parseCqQuickAnswers = function parseCqQuickAnswers(input) {
    return SAT.parseBulkAnswerInput(input, 'numeric');
  };

  SAT.validateCqQuickAnswers = function validateCqQuickAnswers(tokens, expectedCount) {
    const count = Number(expectedCount) || SAT.CQ_BLUEPRINT_QUESTION_COUNT || 20;
    const allowed = SAT.CQ_QUICK_ANSWER_OPTIONS || ['1', '2', '3', '4'];
    const errors = [];
    const list = Array.isArray(tokens) ? tokens : [];

    if (!list.length) {
      errors.push({ message: '정답이 입력되지 않았습니다.' });
      return { valid: false, errors, answers: [] };
    }

    if (list.length !== count) {
      errors.push({
        message: `정답은 정확히 ${count}개여야 합니다. (입력 ${list.length}개)`,
      });
    }

    const answers = list.map((tok, index) => {
      const normalized = SAT.normalizeBulkToken(tok, 'numeric');
      if (!allowed.includes(normalized)) {
        errors.push({
          questionNumber: index + 1,
          message: `${index + 1}번째 답안 "${tok}"은(는) 1–4만 허용됩니다.`,
        });
      }
      return normalized;
    });

    return {
      valid: errors.length === 0,
      errors,
      answers,
    };
  };

  SAT.tokensToAnswersMap = function tokensToAnswersMap(tokens, questions, mode) {
    const map = {};
    const count = Math.min(tokens.length, questions.length);
    for (let i = 0; i < count; i++) {
      const q = questions[i];
      map[q.id] = SAT.normalizeBulkToken(tokens[i], mode);
    }
    return map;
  };
})(window.SAT = window.SAT || {});
