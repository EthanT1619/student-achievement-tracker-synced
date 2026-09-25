/**
 * P7A audit contract fixture (documentation-as-code).
 * Does not prove live RLS. Describes current SQL/RLS/trigger/grant meaning.
 */
(function (SAT) {
  SAT.P7A_ROLES = ['admin', 'teacherA', 'teacherB', 'inactiveTeacher', 'anon'];

  SAT.P7A_PERMISSION_MATRIX = {
    profiles: {
      admin: { select: 'self+all', insert: 'no', update: 'privilege-cols', delete: 'no' },
      teacherA: { select: 'self-only', insert: 'no', update: 'no', delete: 'no' },
      teacherB: { select: 'self-only', insert: 'no', update: 'no', delete: 'no' },
      inactiveTeacher: { select: 'self-only', insert: 'no', update: 'no', delete: 'no' },
      anon: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
    },
    terms: {
      admin: { select: 'all-active-users', insert: 'yes', update: 'yes', delete: 'yes' },
      teacherA: { select: 'all-if-active', insert: 'no', update: 'no', delete: 'no' },
      teacherB: { select: 'all-if-active', insert: 'no', update: 'no', delete: 'no' },
      inactiveTeacher: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
      anon: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
    },
    classes: {
      admin: { select: 'all', insert: 'any-owner', update: 'name-archived', delete: 'yes' },
      teacherA: { select: 'own+historical-metadata', insert: 'self-owner-only', update: 'own-name-archived', delete: 'own' },
      teacherB: { select: 'own+historical-metadata', insert: 'self-owner-only', update: 'own-name-archived', delete: 'own' },
      inactiveTeacher: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
      anon: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
    },
    students: {
      admin: { select: 'all', insert: 'any-owner', update: 'name-active', delete: 'yes' },
      teacherA: { select: 'own-owner-id-only', insert: 'self-owner-only', update: 'own-name-active', delete: 'own' },
      teacherB: { select: 'own-owner-id-only', insert: 'self-owner-only', update: 'own-name-active', delete: 'own' },
      inactiveTeacher: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
      anon: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
    },
    enrollments: {
      admin: { select: 'all', insert: 'yes', update: 'dates', delete: 'yes' },
      teacherA: { select: 'own-class-or-own-student', insert: 'both-owned', update: 'dates-if-both-owned', delete: 'no' },
      teacherB: { select: 'own-class-or-own-student', insert: 'both-owned', update: 'dates-if-both-owned', delete: 'no' },
      inactiveTeacher: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
      anon: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
    },
    assessments: {
      admin: { select: 'all-incl-draft', insert: 'yes', update: 'admin-only', delete: 'admin-only' },
      teacherA: { select: 'published-archived', insert: 'no', update: 'no', delete: 'no' },
      teacherB: { select: 'published-archived', insert: 'no', update: 'no', delete: 'no' },
      inactiveTeacher: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
      anon: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
    },
    assessment_versions: {
      admin: { select: 'all-incl-draft', insert: 'draft-self-created-by', update: 'status-admin-only', delete: 'draft-only' },
      teacherA: { select: 'published-archived', insert: 'no', update: 'no', delete: 'no' },
      teacherB: { select: 'published-archived', insert: 'no', update: 'no', delete: 'no' },
      inactiveTeacher: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
      anon: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
    },
    assessment_questions: {
      admin: { select: 'all', insert: 'draft-version', update: 'draft-version', delete: 'draft-version' },
      teacherA: { select: 'published-archived', insert: 'no', update: 'no', delete: 'no' },
      teacherB: { select: 'published-archived', insert: 'no', update: 'no', delete: 'no' },
      inactiveTeacher: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
      anon: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
    },
    exam_instances: {
      admin: { select: 'all', insert: 'yes', update: 'date', delete: 'yes' },
      teacherA: { select: 'own-class-or-owned-student-result', insert: 'own-class', update: 'own-class-date-only', delete: 'own-class' },
      teacherB: { select: 'own-class-or-owned-student-result', insert: 'own-class', update: 'own-class-date-only', delete: 'own-class' },
      inactiveTeacher: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
      anon: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
    },
    results: {
      admin: { select: 'all', insert: 'yes', update: 'answers-comment', delete: 'yes' },
      teacherA: { select: 'own-student-or-own-class-instance', insert: 'own-class-and-own-student', update: 'same-as-insert', delete: 'same-as-insert' },
      teacherB: { select: 'own-student-or-own-class-instance', insert: 'own-class-and-own-student', update: 'same-as-insert', delete: 'same-as-insert' },
      inactiveTeacher: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
      anon: { select: 'no', insert: 'no', update: 'no', delete: 'no' },
    },
  };

  SAT.P7A_HANDOVER_TARGET = {
    changes: ['students.owner_id', 'enrollments.close+insert'],
    doesNotRewrite: [
      'classes.owner_id',
      'exam_instances',
      'results',
      'enrollments.class_id',
    ],
    newOwnerSees: ['student-row', 'student-results-longitudinal', 'needed-exam-instance-metadata', 'needed-old-class-metadata'],
    oldClassOwnerSees: ['old-class-row', 'old-class-exam-instances', 'old-class-results'],
    oldClassOwnerDoesNotSee: ['future-other-class-results'],
    unrelatedSees: [],
    enrollmentMoveSeparate: false,
    rpc: 'transfer_student_to_class',
    adminOnly: true,
  };

  SAT.P7B_TRANSFER = {
    rpc: 'transfer_student_to_class',
    adminOnly: true,
    ownerDerivedFromClass: true,
    callerTeacherIdParam: false,
    closeOldEnd: 'new_start_date - 1',
    newStart: 'new_start_date',
    currentClassId: null,
    openOwnerMustMatch: true,
    closedOwnerMismatchAllowed: true,
    studentSelectWidenedForOldClassOwner: false,
    teacherSelfService: false,
  };

  SAT.simulateP7aHandoverVisibility = function simulateP7aHandoverVisibility({
    studentId,
    oldOwnerId,
    newOwnerId,
    unrelatedId,
    resultOld,
    resultFuture,
    oldClassId,
    newClassId,
  }) {
    const visibleTo = (actorId) => {
      const rows = [];
      const seeOld = actorId === newOwnerId
        || (actorId === oldOwnerId && resultOld.classId === oldClassId)
        || actorId === 'admin';
      const seeFuture = actorId === newOwnerId
        || (actorId === oldOwnerId && resultFuture.classId === oldClassId)
        || actorId === 'admin';
      if (seeOld) rows.push(resultOld);
      if (seeFuture) rows.push(resultFuture);
      if (actorId === unrelatedId) return [];
      return rows;
    };
    return {
      teacherB: visibleTo(newOwnerId),
      teacherA: visibleTo(oldOwnerId),
      teacherC: visibleTo(unrelatedId),
      studentId,
      oldClassId,
      newClassId,
    };
  };
})(window.SAT = window.SAT || {});
