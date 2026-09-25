/**
 * P9C-1 — Class/Student workspace UI state.
 * Does not change class/student/transfer domain meaning.
 */
(function (SAT) {
  SAT.CLASS_WORKSPACE_DEFAULT = {
    showAddClass: false,
    showClassManage: false,
    showAddStudent: false,
    managingStudentId: null,
  };

  SAT.normalizeClassWorkspace = function normalizeClassWorkspace(raw) {
    return {
      showAddClass: Boolean(raw?.showAddClass),
      showClassManage: Boolean(raw?.showClassManage),
      showAddStudent: Boolean(raw?.showAddStudent),
      managingStudentId: raw?.managingStudentId ? String(raw.managingStudentId) : null,
    };
  };

  SAT.classWorkspaceAfterSelectClass = function classWorkspaceAfterSelectClass() {
    return SAT.normalizeClassWorkspace(SAT.CLASS_WORKSPACE_DEFAULT);
  };

  SAT.classWorkspaceAfterSessionReset = function classWorkspaceAfterSessionReset() {
    return SAT.normalizeClassWorkspace(SAT.CLASS_WORKSPACE_DEFAULT);
  };

  SAT.classSelectorState = function classSelectorState({ classId, selectedClassId, archived } = {}) {
    return {
      selected: Boolean(classId) && classId === selectedClassId,
      archived: archived === true,
    };
  };

  SAT.classSelectorModifier = function classSelectorModifier(state) {
    const flags = [];
    if (state?.selected) flags.push('class-selector--selected');
    if (state?.archived) flags.push('class-selector--archived');
    return flags.join(' ');
  };

  SAT.sortClassesForSelector = function sortClassesForSelector(classes) {
    return (classes || []).slice().sort((a, b) => {
      const archivedA = a?.archived === true ? 1 : 0;
      const archivedB = b?.archived === true ? 1 : 0;
      if (archivedA !== archivedB) return archivedA - archivedB;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'ko');
    });
  };

  SAT.classRosterStudentCount = function classRosterStudentCount(students, classId) {
    return (students || []).filter((row) => row.classId === classId && row.active !== false).length;
  };

  SAT.shouldShowAddClassForm = function shouldShowAddClassForm(workspace) {
    return SAT.normalizeClassWorkspace(workspace).showAddClass === true;
  };

  SAT.shouldShowClassManage = function shouldShowClassManage(workspace) {
    return SAT.normalizeClassWorkspace(workspace).showClassManage === true;
  };

  SAT.shouldShowAddStudentForm = function shouldShowAddStudentForm(workspace, selectedClass) {
    if (!selectedClass || selectedClass.archived) return false;
    return SAT.normalizeClassWorkspace(workspace).showAddStudent === true;
  };

  SAT.shouldShowStudentManage = function shouldShowStudentManage(workspace, studentId) {
    if (!studentId) return false;
    return SAT.normalizeClassWorkspace(workspace).managingStudentId === String(studentId);
  };

  SAT.canAddStudentToSelectedClass = function canAddStudentToSelectedClass(selectedClass) {
    return Boolean(selectedClass && selectedClass.archived !== true);
  };

  SAT.shouldShowStudentTransferAction = function shouldShowStudentTransferAction({ isAdmin } = {}) {
    return Boolean(isAdmin);
  };

  SAT.toggleStudentManageId = function toggleStudentManageId(workspace, studentId) {
    const current = SAT.normalizeClassWorkspace(workspace).managingStudentId;
    const next = String(studentId || '');
    return current === next ? null : next || null;
  };
})(window.SAT = window.SAT || {});
