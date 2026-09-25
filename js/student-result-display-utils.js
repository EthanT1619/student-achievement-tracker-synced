/**
 * Student Result Counseling / Teacher presentation presets (pure).
 * Does not change scoring or aggregation math.
 */
(function (SAT) {
  SAT.STUDENT_RESULT_VIEW_COUNSELING = 'counseling';
  SAT.STUDENT_RESULT_VIEW_TEACHER = 'teacher';

  SAT.normalizeStudentResultView = function normalizeStudentResultView(view) {
    return view === SAT.STUDENT_RESULT_VIEW_TEACHER
      ? SAT.STUDENT_RESULT_VIEW_TEACHER
      : SAT.STUDENT_RESULT_VIEW_COUNSELING;
  };

  SAT.getCounselingStudentResultDisplay = function getCounselingStudentResultDisplay() {
    const d = SAT.normalizeStudentResultDisplay(SAT.DEFAULT_STUDENT_RESULT_DISPLAY);
    d.showClassAverage = false;
    return d;
  };

  SAT.getTeacherStudentResultDisplay = function getTeacherStudentResultDisplay() {
    const d = SAT.normalizeStudentResultDisplay(SAT.DEFAULT_STUDENT_RESULT_DISPLAY);
    d.showClassAverage = true;
    return d;
  };

  SAT.getStudentResultDisplayPreset = function getStudentResultDisplayPreset(view) {
    return SAT.normalizeStudentResultView(view) === SAT.STUDENT_RESULT_VIEW_TEACHER
      ? SAT.getTeacherStudentResultDisplay()
      : SAT.getCounselingStudentResultDisplay();
  };

  SAT.getStudentResultPrintKicker = function getStudentResultPrintKicker(view) {
    return SAT.normalizeStudentResultView(view) === SAT.STUDENT_RESULT_VIEW_TEACHER
      ? `${SAT.APP_NAME} · 학생 성취 분석`
      : `${SAT.APP_NAME} · 학생 학습 추이`;
  };

  SAT.isTeacherStudentResultView = function isTeacherStudentResultView(view) {
    return SAT.normalizeStudentResultView(view) === SAT.STUDENT_RESULT_VIEW_TEACHER;
  };
})(window.SAT = window.SAT || {});
