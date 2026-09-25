/**
 * Assessment template helpers (pure functions).
 */
(function (SAT) {
  SAT.normalizeTemplateQuestion = function normalizeTemplateQuestion(raw, fallbackNumber) {
    return {
      number: Number(raw?.number) || fallbackNumber || 1,
      points: Number(raw?.points) || 1,
      majorCategory: SAT.normalizeCategory(raw?.majorCategory),
      middleCategory: SAT.normalizeCategory(raw?.middleCategory),
      note: String(raw?.note ?? '').trim(),
      correctAnswer: String(raw?.correctAnswer ?? '').trim(),
    };
  };

  SAT.normalizeAssessmentTemplate = function normalizeAssessmentTemplate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const questions = Array.isArray(raw.questions) ? raw.questions : [];
    const normalizedQuestions = questions.map((q, i) =>
      SAT.normalizeTemplateQuestion(q, i + 1)
    );
    return {
      id: raw.id,
      name: String(raw.name ?? '').trim(),
      level: SAT.normalizeLevel(raw.level ?? ''),
      examType: SAT.normalizeCategory(raw.examType),
      questionCount: normalizedQuestions.length || Number(raw.questionCount) || 0,
      questions: normalizedQuestions,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  };

  SAT.filterTemplatesByLevel = function filterTemplatesByLevel(templates, level) {
    const lvl = SAT.normalizeLevel(level);
    if (!lvl) return [];
    return (templates || [])
      .filter((t) => SAT.normalizeLevel(t.level) === lvl)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  };

  SAT.templateQuestionsToExamQuestions = function templateQuestionsToExamQuestions(template) {
    return (template?.questions || []).map((q, i) => ({
      number: q.number || i + 1,
      correctAnswer: '',
      points: q.points || 1,
      majorCategory: q.majorCategory || '',
      middleCategory: q.middleCategory || '',
      note: q.note || '',
    }));
  };

  SAT.hasDuplicateTemplateName = function hasDuplicateTemplateName(templates, name, level, excludeId) {
    const n = String(name ?? '').trim().toLowerCase();
    const l = SAT.normalizeLevel(level);
    if (!n) return false;
    return (templates || []).some(
      (t) =>
        t.id !== excludeId
        && String(t.name ?? '').trim().toLowerCase() === n
        && SAT.normalizeLevel(t.level) === l
    );
  };

  SAT.buildExamTemplateLinkage = function buildExamTemplateLinkage(template) {
    if (!template?.id) return {};
    return {
      templateId: String(template.id),
      templateNameSnapshot: String(template.name ?? '').trim(),
      templateLevelSnapshot: SAT.normalizeLevel(template.level),
    };
  };

  SAT.normalizeExamTemplateFields = function normalizeExamTemplateFields(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const exam = { ...raw };
    if (exam.templateId) {
      exam.templateId = String(exam.templateId);
    }
    exam.templateNameSnapshot = String(exam.templateNameSnapshot ?? '').trim();
    exam.templateLevelSnapshot = String(exam.templateLevelSnapshot ?? '').trim();
    return exam;
  };

  SAT.getExamTemplateDisplay = function getExamTemplateDisplay(exam, templates) {
    if (!exam?.templateId) return null;
    const template = (templates || []).find((t) => t.id === exam.templateId);
    if (template) {
      const name = String(template.name ?? '').trim() || '이름 없음';
      return {
        text: `사용한 템플릿: ${name}`,
        name,
        deleted: false,
      };
    }
    const snapshotName = String(exam.templateNameSnapshot ?? '').trim();
    if (snapshotName) {
      return {
        text: `사용한 템플릿: ${snapshotName} (삭제됨)`,
        name: snapshotName,
        deleted: true,
      };
    }
    return {
      text: '사용한 템플릿: 삭제되었거나 확인할 수 없음',
      name: '',
      deleted: true,
    };
  };

  SAT.buildQuestionsFromRanges = function buildQuestionsFromRanges(ranges) {
    const questions = [];
    ranges.forEach(({ from, to, majorCategory, middleCategory, points }) => {
      for (let n = from; n <= to; n += 1) {
        questions.push({
          number: n,
          points: points ?? 1,
          majorCategory,
          middleCategory: middleCategory || '',
          note: '',
          correctAnswer: '',
        });
      }
    });
    return questions;
  };

  SAT.CQ_MAJOR_STORY = 'Story Comprehension';
  SAT.CQ_MAJOR_DIALOGUE = 'Dialogue';
  SAT.CQ_MAJOR_GRAMMAR = 'Grammar';
  SAT.CQ_BLUEPRINT_QUESTION_COUNT = 20;
  SAT.CQ_QUICK_ANSWER_OPTIONS = ['1', '2', '3', '4'];
  SAT.EXAM_SETUP_CQ_QUICK = 'cq-quick';
  SAT.EXAM_SETUP_CQ_UNSUPPORTED = 'cq-unsupported';

  SAT.CQ_BLUEPRINTS = [
    {
      id: 'dsc',
      examType: 'CQ',
      questionCount: SAT.CQ_BLUEPRINT_QUESTION_COUNT,
      levels: ['DSC'],
      ranges: [
        { from: 1, to: 10, majorCategory: SAT.CQ_MAJOR_STORY },
        { from: 11, to: 16, majorCategory: SAT.CQ_MAJOR_DIALOGUE },
        { from: 17, to: 20, majorCategory: SAT.CQ_MAJOR_GRAMMAR },
      ],
    },
    {
      id: 'dsd-plus',
      examType: 'CQ',
      questionCount: SAT.CQ_BLUEPRINT_QUESTION_COUNT,
      levels: ['DSD', 'LSA', 'LSB', 'LSC', 'LSD', 'MSA', 'MSB'],
      ranges: [
        { from: 1, to: 16, majorCategory: SAT.CQ_MAJOR_STORY },
        { from: 17, to: 20, majorCategory: SAT.CQ_MAJOR_GRAMMAR },
      ],
    },
  ];

  SAT.getCqBlueprintById = function getCqBlueprintById(id) {
    return (SAT.CQ_BLUEPRINTS || []).find((bp) => bp.id === id) || null;
  };

  SAT.getCqBlueprintForLevel = function getCqBlueprintForLevel(level) {
    const normalized = SAT.normalizeLevel(level);
    if (!normalized) return { supported: false, level: '', blueprint: null };
    const official = (SAT.OFFICIAL_LEVELS || []).includes(normalized);
    if (!official) return { supported: false, level: normalized, blueprint: null };
    const blueprint = (SAT.CQ_BLUEPRINTS || []).find((bp) => bp.levels.includes(normalized));
    return {
      supported: !!blueprint,
      level: normalized,
      blueprint: blueprint || null,
    };
  };

  SAT.buildCqBlueprintQuestions = function buildCqBlueprintQuestions(level) {
    const found = SAT.getCqBlueprintForLevel(level);
    if (!found.supported) return null;
    return SAT.buildQuestionsFromRanges(found.blueprint.ranges);
  };

  SAT.formatCqBlueprintPreviewRows = function formatCqBlueprintPreviewRows(blueprint) {
    return (blueprint?.ranges || []).map((r) => ({
      rangeLabel: `${r.from}–${r.to}`,
      majorCategory: r.majorCategory,
    }));
  };

  SAT.formatCqBlueprintSummary = function formatCqBlueprintSummary(levelOrBlueprint) {
    const blueprint = levelOrBlueprint && Array.isArray(levelOrBlueprint.ranges)
      ? levelOrBlueprint
      : SAT.getCqBlueprintForLevel(levelOrBlueprint).blueprint;
    if (!blueprint) return '';
    const ranges = SAT.formatCqBlueprintPreviewRows(blueprint)
      .map((row) => `${row.majorCategory} ${row.rangeLabel}`);
    const count = blueprint.questionCount || SAT.CQ_BLUEPRINT_QUESTION_COUNT || 20;
    return `${count}문항 · ${ranges.join(' · ')}`;
  };

  SAT.shouldShowCreateBlueprintOption = function shouldShowCreateBlueprintOption(assessmentType, level) {
    const type = String(assessmentType || '').trim().toUpperCase();
    if (type !== 'CQ') return false;
    return SAT.getCqBlueprintForLevel(level)?.supported === true;
  };

  SAT.PRESET_ASSESSMENT_TEMPLATES = [
    {
      key: 'dsa-phonics',
      name: 'DSA Phonics Quiz',
      level: 'DSA',
      examType: 'Phonics Quiz',
      ranges: [
        { from: 1, to: 10, majorCategory: 'Listen & Match' },
        { from: 11, to: 20, majorCategory: 'Dictation' },
      ],
    },
    {
      key: 'dsc-cq',
      name: 'DSC CQ',
      level: 'DSC',
      examType: 'CQ',
      blueprintId: 'dsc',
    },
    {
      key: 'lsa-cq',
      name: 'LSA CQ',
      level: 'LSA',
      examType: 'CQ',
      blueprintId: 'dsd-plus',
    },
  ];

  SAT.buildPresetAssessmentTemplate = function buildPresetAssessmentTemplate(presetKey) {
    const preset = SAT.PRESET_ASSESSMENT_TEMPLATES.find((p) => p.key === presetKey);
    if (!preset) return null;
    const blueprint = preset.blueprintId ? SAT.getCqBlueprintById(preset.blueprintId) : null;
    const ranges = blueprint?.ranges || preset.ranges;
    if (!ranges) return null;
    const questions = SAT.buildQuestionsFromRanges(ranges);
    return {
      name: preset.name,
      level: preset.level,
      examType: preset.examType,
      questionCount: questions.length,
      questions,
    };
  };

  SAT.examQuestionsToTemplateQuestions = function examQuestionsToTemplateQuestions(questions) {
    return (questions || []).map((q, i) => ({
      number: q.number || i + 1,
      points: q.points || 1,
      majorCategory: q.majorCategory || '',
      middleCategory: q.middleCategory || '',
      note: q.note || '',
      correctAnswer: '',
    }));
  };

  SAT.buildDuplicatedExamRecords = function buildDuplicatedExamRecords(
    exam,
    questions,
    { newExamId, title, date, createId }
  ) {
    if (!exam || !newExamId) return null;
    const makeId = typeof createId === 'function' ? createId : SAT.generateId;
    return {
      exam: {
        ...exam,
        id: newExamId,
        title,
        date,
        createdAt: undefined,
      },
      questions: (questions || []).map((q) => ({
        ...q,
        id: makeId(),
        examId: newExamId,
      })),
    };
  };
})(window.SAT = window.SAT || {});

