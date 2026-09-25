/**
 * Exam list filtering, sorting, and display labels (pure functions).
 */
(function (SAT) {
  SAT.DEFAULT_UI_PREFS = {
    examsListFilters: { classId: '', level: '', examType: '', search: '' },
    examOverviewFilters: { classId: '', level: '' },
    answerEntry: { classId: '', examId: '' },
    examOverviewId: '',
  };

  SAT.normalizeUiPrefs = function normalizeUiPrefs(raw) {
    const d = {
      examsListFilters: { ...SAT.DEFAULT_UI_PREFS.examsListFilters },
      examOverviewFilters: { ...SAT.DEFAULT_UI_PREFS.examOverviewFilters },
      answerEntry: { ...SAT.DEFAULT_UI_PREFS.answerEntry },
      examOverviewId: '',
    };
    if (!raw || typeof raw !== 'object') return d;
    if (raw.examsListFilters && typeof raw.examsListFilters === 'object') {
      Object.keys(d.examsListFilters).forEach((k) => {
        if (raw.examsListFilters[k] !== undefined) {
          d.examsListFilters[k] = String(raw.examsListFilters[k] ?? '');
        }
      });
    }
    if (raw.examOverviewFilters && typeof raw.examOverviewFilters === 'object') {
      Object.keys(d.examOverviewFilters).forEach((k) => {
        if (raw.examOverviewFilters[k] !== undefined) {
          d.examOverviewFilters[k] = String(raw.examOverviewFilters[k] ?? '');
        }
      });
    }
    if (raw.answerEntry && typeof raw.answerEntry === 'object') {
      Object.keys(d.answerEntry).forEach((k) => {
        if (raw.answerEntry[k] !== undefined) {
          d.answerEntry[k] = String(raw.answerEntry[k] ?? '');
        }
      });
    }
    if (raw.examOverviewId !== undefined) {
      d.examOverviewId = String(raw.examOverviewId ?? '');
    }
    return d;
  };

  SAT.formatExamIsoDate = function formatExamIsoDate(date) {
    if (!date) return '—';
    const s = String(date);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    try {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return s;
      return d.toISOString().slice(0, 10);
    } catch {
      return s;
    }
  };

  SAT.formatExamOptionLabel = function formatExamOptionLabel(exam) {
    if (!exam) return '—';
    const date = SAT.formatExamIsoDate(exam.date);
    const title = exam.title || '—';
    const type = String(exam.examType ?? '').trim();
    if (type) return `[${type}] ${title} · ${date}`;
    return `${title} · ${date}`;
  };

  SAT.sortExamsByDateDesc = function sortExamsByDateDesc(exams) {
    return [...(exams || [])].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      const ta = Number.isNaN(da) ? 0 : da;
      const tb = Number.isNaN(db) ? 0 : db;
      if (tb !== ta) return tb - ta;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });
  };

  SAT.collectDistinctClassLevels = function collectDistinctClassLevels(classes) {
    const seen = new Set();
    (classes || []).forEach((c) => {
      const level = SAT.normalizeLevel(c.level);
      if (level) seen.add(level);
    });
    return [...seen].sort((a, b) => a.localeCompare(b, 'ko'));
  };

  SAT.collectDistinctExamTypes = function collectDistinctExamTypes(exams) {
    const set = new Set();
    (exams || []).forEach((e) => {
      const type = String(e.examType ?? '').trim();
      if (type) set.add(type);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  };

  SAT.filterExams = function filterExams(exams, options = {}) {
    const {
      classes = [],
      classId = '',
      level = '',
      examType = '',
      searchQuery = '',
    } = options;
    const classById = new Map((classes || []).map((c) => [c.id, c]));
    let list = Array.isArray(exams) ? [...exams] : [];

    const cid = String(classId ?? '').trim();
    const lvl = SAT.normalizeLevel(level);
    const et = String(examType ?? '').trim();
    const search = String(searchQuery ?? '').trim().toLowerCase();

    if (cid) {
      list = list.filter((e) => e.classId === cid);
    }
    if (lvl) {
      list = list.filter((e) => {
        const cls = classById.get(e.classId);
        return cls && SAT.normalizeLevel(cls.level) === lvl;
      });
    }
    if (et) {
      list = list.filter((e) => String(e.examType ?? '').trim() === et);
    }
    if (search) {
      list = list.filter((e) => String(e.title ?? '').toLowerCase().includes(search));
    }

    return SAT.sortExamsByDateDesc(list);
  };

  SAT.ensureValidExamSelection = function ensureValidExamSelection(examId, filteredExams) {
    if (!examId) return '';
    return (filteredExams || []).some((e) => e.id === examId) ? examId : '';
  };
})(window.SAT = window.SAT || {});
