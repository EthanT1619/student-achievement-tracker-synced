/**
 * Cloud domain mappers: snake_case DB <-> camelCase app.
 * P4B only. Does not map legacy localStorage Exam entities (P6).
 */
(function (SAT) {
  const DB_TO_APP = {
    id: 'id',
    email: 'email',
    role: 'role',
    active: 'active',
    display_name: 'displayName',
    can_edit_curriculum: 'canEditCurriculum',
    name: 'name',
    start_date: 'startDate',
    end_date: 'endDate',
    is_current: 'isCurrent',
    term_id: 'termId',
    owner_id: 'ownerId',
    level: 'level',
    archived: 'archived',
    english_name: 'englishName',
    current_class_id: 'currentClassId',
    student_id: 'studentId',
    class_id: 'classId',
    title: 'title',
    assessment_type: 'assessmentType',
    lesson_start: 'lessonStart',
    lesson_end: 'lessonEnd',
    created_by: 'createdBy',
    assessment_id: 'assessmentId',
    version_number: 'versionNumber',
    status: 'status',
    published_at: 'publishedAt',
    choice_count: 'choiceCount',
    assessment_version_id: 'assessmentVersionId',
    number: 'number',
    grading_type: 'gradingType',
    correct_answer: 'correctAnswer',
    points: 'points',
    major_category: 'majorCategory',
    middle_category: 'middleCategory',
    note: 'note',
    administered_date: 'administeredDate',
    exam_instance_id: 'examInstanceId',
    answers: 'answers',
    teacher_comment: 'teacherComment',
    submitted_at: 'submittedAt',
    correct_count: 'correctCount',
    earned_points: 'earnedPoints',
    total_points: 'totalPoints',
    percentage: 'percentage',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    deleted_versions: 'deletedVersions',
    deleted_exam_instances: 'deletedExamInstances',
    deleted_results: 'deletedResults',
  };

  const APP_TO_DB = {};
  Object.keys(DB_TO_APP).forEach((dbKey) => {
    APP_TO_DB[DB_TO_APP[dbKey]] = dbKey;
  });

  SAT.CLOUD_DB_TO_APP = DB_TO_APP;
  SAT.CLOUD_APP_TO_DB = APP_TO_DB;

  SAT.RESULT_INSERT_APP_FIELDS = [
    'examInstanceId',
    'studentId',
    'answers',
    'teacherComment',
    'submittedAt',
  ];
  SAT.RESULT_UPDATE_APP_FIELDS = ['answers', 'teacherComment', 'submittedAt'];
  SAT.RESULT_FORBIDDEN_WRITE_APP_FIELDS = [
    'id',
    'correctCount',
    'earnedPoints',
    'totalPoints',
    'percentage',
    'createdAt',
    'updatedAt',
  ];

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  SAT.mapDbRowToApp = function mapDbRowToApp(row) {
    if (!isPlainObject(row)) return row;
    const out = {};
    Object.keys(row).forEach((key) => {
      const mapped = DB_TO_APP[key] || key;
      let value = row[key];
      if (key === 'answers' && value && typeof value === 'object') {
        value = value;
      }
      out[mapped] = value;
    });
    return out;
  };

  SAT.mapAppPatchToDb = function mapAppPatchToDb(patch, allowedAppFields) {
    if (!isPlainObject(patch)) return {};
    const allow = allowedAppFields ? new Set(allowedAppFields) : null;
    const out = {};
    Object.keys(patch).forEach((key) => {
      if (patch[key] === undefined) return;
      if (allow && !allow.has(key)) return;
      const dbKey = APP_TO_DB[key] || key;
      out[dbKey] = patch[key];
    });
    return out;
  };

  SAT.pickResultInsertPayload = function pickResultInsertPayload(input) {
    return SAT.mapAppPatchToDb(input, SAT.RESULT_INSERT_APP_FIELDS);
  };

  SAT.pickResultUpdatePayload = function pickResultUpdatePayload(input) {
    return SAT.mapAppPatchToDb(input, SAT.RESULT_UPDATE_APP_FIELDS);
  };

  SAT.assertNoResultScalarWrites = function assertNoResultScalarWrites(dbPayload) {
    const forbidden = [
      'correct_count',
      'earned_points',
      'total_points',
      'percentage',
    ];
    const leaked = forbidden.filter((key) => Object.prototype.hasOwnProperty.call(dbPayload || {}, key));
    if (leaked.length) {
      throw SAT.createRepositoryError({
        code: 'VALIDATION',
        message: `Result payload must not include derived scalars: ${leaked.join(', ')}`,
      }, 'result.write');
    }
    return dbPayload;
  };
})(window.SAT = window.SAT || {});
