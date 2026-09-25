/**
 * P9B — Dashboard hierarchy, term placement, nav titles, shared class context.
 * Class ID only. Does not share student/exam/result/draft.
 */
(function (SAT) {
  SAT.DASHBOARD_MY_CLASSES_TITLE = '내 반';
  SAT.DASHBOARD_NO_CLASS_MESSAGE = '현재 학기에 담당 반이 없습니다.';
  SAT.DASHBOARD_NO_EXAM_MESSAGE = '배정된 시험이 없습니다.';
  SAT.DASHBOARD_TERM_LABEL = '현재 학기';
  SAT.PAGE_TITLE_EXAMS = '시험 설정';
  SAT.PAGE_TITLE_BACKUP = '백업';
  SAT.PAGE_TITLE_CLASSES = '반·학생';

  SAT.isAccessibleSharedClass = function isAccessibleSharedClass(classId, classes) {
    if (!classId) return false;
    const cls = (classes || []).find((row) => row && row.id === classId);
    return Boolean(cls && cls.archived !== true);
  };

  SAT.resolveSharedClassId = function resolveSharedClassId(classId, classes) {
    return SAT.isAccessibleSharedClass(classId, classes) ? classId : '';
  };

  SAT.rememberSharedClassId = function rememberSharedClassId(classId, classes) {
    return SAT.resolveSharedClassId(classId, classes) || null;
  };

  SAT.shouldKeepAnswerEntryClassOnSharedApply = function shouldKeepAnswerEntryClassOnSharedApply(draft = {}) {
    return draft.currentAnswers != null
      || draft.draftBaseUpdatedAt != null
      || Boolean(draft.studentId);
  };

  SAT.applySharedClassDefault = function applySharedClassDefault({
    sharedClassId,
    screenClassId,
    classes,
    protectDraft,
  } = {}) {
    if (protectDraft) return screenClassId || '';
    const shared = SAT.resolveSharedClassId(sharedClassId, classes);
    if (shared) return shared;
    return SAT.resolveSharedClassId(screenClassId, classes);
  };

  SAT.applySharedClassToScreenState = function applySharedClassToScreenState(input = {}) {
    const {
      view,
      sharedClassId,
      classes,
      answerEntry = {},
      studentResults = {},
      examOverviewFilters = {},
      draft = {},
    } = input;
    const shared = SAT.resolveSharedClassId(sharedClassId, classes);
    const next = {
      selectedClassId: shared || null,
      answerEntry: {
        classId: answerEntry.classId || '',
        examId: answerEntry.examId || '',
        studentId: answerEntry.studentId || '',
        overrideStudentIds: answerEntry.overrideStudentIds ? [...answerEntry.overrideStudentIds] : [],
      },
      studentResults: {
        classId: studentResults.classId || '',
        studentId: studentResults.studentId || '',
      },
      examOverviewFilters: {
        ...examOverviewFilters,
        classId: examOverviewFilters.classId || '',
      },
      examOverviewClassChanged: false,
    };

    if (view === 'answer-entry') {
      const protect = SAT.shouldKeepAnswerEntryClassOnSharedApply({
        currentAnswers: draft.currentAnswers,
        draftBaseUpdatedAt: draft.draftBaseUpdatedAt,
        studentId: answerEntry.studentId,
      });
      if (!protect) {
        const applied = SAT.applySharedClassDefault({
          sharedClassId: shared,
          screenClassId: answerEntry.classId,
          classes,
        });
        if (applied !== (answerEntry.classId || '')) {
          next.answerEntry = {
            classId: applied,
            examId: '',
            studentId: '',
            overrideStudentIds: [],
          };
        }
      }
    }

    if (view === 'student-results') {
      const applied = SAT.applySharedClassDefault({
        sharedClassId: shared,
        screenClassId: studentResults.classId,
        classes,
      });
      if (applied !== (studentResults.classId || '')) {
        next.studentResults = { classId: applied, studentId: '' };
      }
    }

    if (view === 'exam-overview') {
      const applied = SAT.applySharedClassDefault({
        sharedClassId: shared,
        screenClassId: examOverviewFilters.classId,
        classes,
      });
      if (applied !== (examOverviewFilters.classId || '')) {
        next.examOverviewFilters = { ...next.examOverviewFilters, classId: applied };
        next.examOverviewClassChanged = true;
      }
    }

    return next;
  };

  SAT.clearSharedClassOnSessionReset = function clearSharedClassOnSessionReset(state = {}) {
    return {
      selectedClassId: null,
      answerEntry: { classId: '', examId: '', studentId: '', overrideStudentIds: [] },
      studentResults: { classId: '', studentId: '' },
      examOverviewFilters: { ...(state.examOverviewFilters || {}), classId: '' },
    };
  };

  SAT.dashboardWorkClasses = function dashboardWorkClasses(classes) {
    return (classes || []).filter((row) => row && row.archived !== true);
  };

  SAT.shouldShowTermManagementPanel = function shouldShowTermManagementPanel({ isAdmin } = {}) {
    return Boolean(isAdmin);
  };

  SAT.recentExamInstancesForDashboard = function recentExamInstancesForDashboard(instances, limit = 5) {
    const max = Number(limit) > 0 ? Number(limit) : 5;
    return (instances || [])
      .slice()
      .sort((a, b) => String(b.administeredDate || '').localeCompare(String(a.administeredDate || '')))
      .slice(0, max);
  };

  SAT.pageTitleForView = function pageTitleForView(view) {
    const titles = {
      dashboard: '대시보드',
      classes: SAT.PAGE_TITLE_CLASSES,
      exams: SAT.PAGE_TITLE_EXAMS,
      'answer-entry': '답안 입력',
      'student-results': '학생 결과',
      'exam-overview': '시험 결과',
      backup: SAT.PAGE_TITLE_BACKUP,
    };
    return titles[view] || view;
  };
})(window.SAT = window.SAT || {});
