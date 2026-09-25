/**
 * Node test runner — loads window.SAT scripts via vm sandbox (browser IIFE flow).
 * Run: node js/test-logic.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const CORE_FILES = [
  'js/constants.js',
  'js/utils.js',
  'js/student-result-display-utils.js',
  'js/category-utils.js',
  'js/level-utils.js',
  'js/question-resize-utils.js',
  'js/question-range-patch-utils.js',
  'js/question-structure-utils.js',
  'js/exam-filter-utils.js',
  'js/assessment-template-utils.js',
  'js/assessment-manager.js',
  'js/answer-entry-manager.js',
];

function loadSat(extraFiles = []) {
  const sandbox = {
    console,
    window: {},
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);

  for (const file of [...CORE_FILES, ...extraFiles]) {
    const code = readFileSync(join(root, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  const SAT = sandbox.window.SAT || sandbox.SAT;
  if (!SAT) {
    throw new Error('SAT namespace failed to initialize in vm sandbox');
  }
  return SAT;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runTests() {
  const SAT = loadSat();

  // 1. 숫자 1과 문자열 "1"
  assert(SAT.answersMatch('1', '1'), 'numeric string match');
  assert(SAT.answersMatch(1, '1'), 'number vs string');

  // 2. 영문 대소문자 무시
  assert(SAT.answersMatch('a', 'A', { ignoreCase: true }), 'ignoreCase true');
  assert(!SAT.answersMatch('a', 'B', { ignoreCase: true }), 'ignoreCase mismatch');

  // 3. 공백 trim
  assert(SAT.answersMatch(' 2 ', '2'), 'trim whitespace');

  // 4. 미입력 답안은 오답
  const qBasic = [
    { id: 'q1', number: 1, correctAnswer: '2', points: 1, majorCategory: 'Grammar', middleCategory: 'Tense' },
  ];
  const emptyResult = SAT.gradeAnswers(qBasic, { q1: '' });
  assert(emptyResult.correctCount === 0, 'empty answer is wrong');

  // 5. 배점이 다른 문항 총점
  const qPoints = [
    { id: 'a', number: 1, correctAnswer: '1', points: 2, majorCategory: 'G', middleCategory: 'm1' },
    { id: 'b', number: 2, correctAnswer: '2', points: 3, majorCategory: 'G', middleCategory: 'm2' },
  ];
  const ptsResult = SAT.gradeAnswers(qPoints, { a: '1', b: '3' });
  assert(ptsResult.earnedPoints === 2 && ptsResult.totalPoints === 5, 'weighted points');

  // 6. 대분류별 통계
  const qMulti = [
    { id: 'q1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'Grammar', middleCategory: 'Tense' },
    { id: 'q2', number: 2, correctAnswer: '2', points: 1, majorCategory: 'Dialogue', middleCategory: 'Situation' },
  ];
  const multiResult = SAT.gradeAnswers(qMulti, { q1: '1', q2: '2' });
  assert(multiResult.categoryStats.major.Grammar.correct === 1, 'major Grammar stat');
  assert(multiResult.categoryStats.major.Dialogue.correct === 1, 'major Dialogue stat');

  // 7. 동일 중분류 이름 충돌 방지
  const qCollision = [
    { id: 'r1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'Reading Comprehension', middleCategory: 'Detail' },
    { id: 'd1', number: 2, correctAnswer: '2', points: 1, majorCategory: 'Dialogue', middleCategory: 'Detail' },
  ];
  const collisionResult = SAT.gradeAnswers(qCollision, { r1: '1', d1: '2' });
  const middleKeys = Object.keys(collisionResult.categoryStats.middle);
  assert(middleKeys.length === 2, 'two separate middle keys');
  assert(middleKeys.includes('Reading Comprehension::Detail'), 'RC Detail key');
  assert(middleKeys.includes('Dialogue::Detail'), 'Dialogue Detail key');

  // 8. 문항별 반 정답률 — 미입력도 분모 포함
  const qOne = [{ id: 'x', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' }];
  const results = [
    { answers: { x: '1' } },
    { answers: { x: '2' } },
    { answers: { x: '' } },
    { answers: {} },
    { answers: { x: '1' } },
    { answers: { x: '1' } },
    { answers: { x: '2' } },
    { answers: { x: '' } },
    { answers: { x: '1' } },
    { answers: { x: '1' } },
  ];
  const overview = SAT.computeExamOverview(results, [], qOne);
  assert(overview.questionStats[0].correct === 5, 'five correct');
  assert(overview.questionStats[0].total === 10, 'ten submitted');
  assert(overview.questionStats[0].rate === 0.5, 'rate is 50% not inflated');

  // 9–10. 사용자 정의 분류 저장 (normalizeCategory)
  assert(SAT.normalizeCategory('  Vocabulary  ') === 'Vocabulary', 'custom major trim');
  assert(SAT.normalizeCategory('  Context Clue  ') === 'Context Clue', 'custom middle trim');

  // 11. 대분류 추천 목록
  const suggestions = SAT.collectMajorSuggestions([
    { majorCategory: 'Vocabulary' },
    { majorCategory: 'Grammar' },
  ]);
  assert(suggestions.includes('Vocabulary'), 'Vocabulary in major suggestions');
  assert(suggestions.includes('Grammar'), 'Grammar in major suggestions');

  // 12. 대분류별 중분류 추천
  const middleSug = SAT.collectMiddleSuggestions([
    { majorCategory: 'Vocabulary', middleCategory: 'Context Clue' },
    { majorCategory: 'Grammar', middleCategory: 'Tense' },
  ], 'Vocabulary');
  assert(middleSug.includes('Context Clue'), 'Context Clue for Vocabulary');

  // 13. 빈 대분류 — gradeAnswers에서 major 없으면 통계 제외
  const noMajor = SAT.gradeAnswers(
    [{ id: 'z', number: 1, correctAnswer: '1', points: 1, majorCategory: '', middleCategory: 'X' }],
    { z: '1' }
  );
  assert(Object.keys(noMajor.categoryStats.major).length === 0, 'empty major excluded from stats');

  // 14. 빈 중분류 — 미분류 표시, 별도 키
  const unclassified = SAT.gradeAnswers(
    [{ id: 'u', number: 1, correctAnswer: '1', points: 1, majorCategory: 'Grammar', middleCategory: '' }],
    { u: '1' }
  );
  const uKey = 'Grammar::';
  assert(unclassified.categoryStats.middle[uKey], 'empty middle bucket exists');
  assert(SAT.getMiddleDisplayName('') === '미분류', 'display label for empty middle');

  // 15. 빠른 입력 — 숫자키 → A~E 매핑
  assert(SAT.keyToAnswerOption('1', 'alpha') === 'A', 'key 1 -> A');
  assert(SAT.keyToAnswerOption('5', 'alpha') === 'E', 'key 5 -> E');
  assert(SAT.keyToAnswerOption('3', 'numeric') === '3', 'key 3 numeric');

  // 16. 일괄 입력 파싱 — 붙여쓰기
  assert(
    JSON.stringify(SAT.parseBulkAnswerInput('1234512345', 'numeric')) === JSON.stringify(['1', '2', '3', '4', '5', '1', '2', '3', '4', '5']),
    'concatenated numeric parse'
  );
  assert(
    JSON.stringify(SAT.parseBulkAnswerInput('1, 2, 3, 4, 5', 'numeric')) === JSON.stringify(['1', '2', '3', '4', '5']),
    'comma separated parse'
  );
  assert(
    JSON.stringify(SAT.parseBulkAnswerInput('1 / 2 / 3', 'numeric')) === JSON.stringify(['1', '2', '3']),
    'slash separated parse'
  );
  assert(
    JSON.stringify(SAT.parseBulkAnswerInput('ABCDE', 'alpha')) === JSON.stringify(['A', 'B', 'C', 'D', 'E']),
    'concatenated alpha parse'
  );

  // 17. 일괄 입력 검증
  const vShort = SAT.validateBulkAnswers(['1', '2', '3'], 5, 'numeric');
  assert(vShort.valid && vShort.warnings.length === 1, 'short answer warning');
  assert(vShort.warnings[0].detail.includes('4, 5'), 'missing question numbers listed');
  assert(vShort.warnings[0].questionNumbers.includes(4), 'missing question number 4');

  const vLong = SAT.validateBulkAnswers(['1', '2', '3', '4', '5', '1'], 5, 'numeric');
  assert(vLong.valid && vLong.warnings.length === 1, 'long answer warning');
  assert(vLong.applyCount === 5, 'apply count capped');

  const vBad = SAT.validateBulkAnswers(['1', 'X', '3'], 3, 'numeric');
  assert(!vBad.valid && vBad.errors[0].questionNumber === 2, 'invalid token error position');
  assert(vBad.errorQuestionNumbers.includes(2), 'error question numbers');

  const mapped = SAT.tokensToAnswersMap(['1', '2'], [{ id: 'q1', number: 1 }, { id: 'q2', number: 2 }], 'numeric');
  assert(mapped.q1 === '1' && mapped.q2 === '2', 'tokens to answers map');

  // 18. 학생 전체 시험 집계
  const agg = SAT.aggregateStudentResultsAcrossExams(
    [
      { examId: 'e1', answers: { q1: '1', q2: '2' } },
      { examId: 'e2', answers: { x1: '1' } },
    ],
    {
      e1: [
        { id: 'q1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' },
        { id: 'q2', number: 2, correctAnswer: '3', points: 1, majorCategory: 'G', middleCategory: '' },
      ],
      e2: [{ id: 'x1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'R', middleCategory: '' }],
    }
  );
  assert(agg.examCount === 2, 'two exams aggregated');
  assert(agg.correctCount === 2, 'two correct across exams');
  assert(agg.categoryStats.major.G.total === 2, 'Grammar total from first exam');

  // 19. 시험 필터·정렬·표시
  const filterClasses = [
    { id: 'c-dsa', name: 'DSA', level: 'Level 3' },
    { id: 'c-dsc', name: 'DSC', level: 'Level 3' },
    { id: 'c-lsa', name: 'LSA', level: 'Level 2' },
  ];
  const filterExamsData = [
    { id: 'e1', classId: 'c-dsa', title: 'Unit 1', examType: 'CQ', date: '2026-01-10' },
    { id: 'e2', classId: 'c-dsc', title: 'Unit 2', examType: 'CQ', date: '2026-02-15' },
    { id: 'e3', classId: 'c-lsa', title: 'Midterm', examType: 'MT', date: '2026-03-01' },
    { id: 'e4', classId: 'c-dsa', title: 'Review', examType: '', date: '2026-03-20' },
  ];

  const dsaOnly = SAT.filterExams(filterExamsData, { classes: filterClasses, classId: 'c-dsa' });
  assert(dsaOnly.length === 2 && dsaOnly.every((e) => e.classId === 'c-dsa'), 'class filter DSA only');

  const level3 = SAT.filterExams(filterExamsData, { classes: filterClasses, level: 'Level 3' });
  assert(level3.length === 3 && !level3.some((e) => e.classId === 'c-lsa'), 'level filter excludes LSA class');
  assert(level3.every((e) => ['c-dsa', 'c-dsc'].includes(e.classId)), 'level filter only Level 3 classes');

  const combo = SAT.filterExams(filterExamsData, {
    classes: filterClasses,
    examType: 'CQ',
    searchQuery: 'Unit',
  });
  assert(combo.length === 2 && combo.every((e) => e.examType === 'CQ'), 'exam type + search combo');

  assert(SAT.ensureValidExamSelection('e3', dsaOnly) === '', 'invalid examId cleared');
  assert(SAT.ensureValidExamSelection('e1', dsaOnly) === 'e1', 'valid examId kept');

  const sorted = SAT.sortExamsByDateDesc(filterExamsData);
  assert(sorted[0].id === 'e4', 'newest exam first');

  assert(
    SAT.formatExamOptionLabel({ title: 'Test A', examType: 'CQ', date: '2026-03-15' }) === '[CQ] Test A · 2026-03-15',
    'option label with type'
  );
  assert(
    SAT.formatExamOptionLabel({ title: 'Test B', examType: '', date: '2026-03-15' }) === 'Test B · 2026-03-15',
    'option label without type'
  );

  const legacyPrefs = SAT.normalizeUiPrefs(undefined);
  assert(legacyPrefs.examsListFilters.classId === '', 'legacy backup uiPrefs defaults');

  // 20. 시험 템플릿 — 프리셋 DSA/DSC/LSA 문항 구조
  const dsaPreset = SAT.buildPresetAssessmentTemplate('dsa-phonics');
  assert(dsaPreset && dsaPreset.level === 'DSA' && dsaPreset.questionCount === 20, 'DSA preset meta');
  assert(dsaPreset.questions[0].majorCategory === 'Listen & Match', 'DSA q1 major');
  assert(dsaPreset.questions[9].majorCategory === 'Listen & Match', 'DSA q10 major');
  assert(dsaPreset.questions[10].majorCategory === 'Dictation', 'DSA q11 major');
  assert(dsaPreset.questions[19].majorCategory === 'Dictation', 'DSA q20 major');

  const dscPreset = SAT.buildPresetAssessmentTemplate('dsc-cq');
  assert(dscPreset && dscPreset.level === 'DSC' && dscPreset.examType === 'CQ', 'DSC preset meta');
  assert(dscPreset.questions[0].majorCategory === 'Story Comprehension', 'DSC q1 major');
  assert(dscPreset.questions[9].majorCategory === 'Story Comprehension', 'DSC q10 major');
  assert(dscPreset.questions[10].majorCategory === 'Dialogue', 'DSC q11 major');
  assert(dscPreset.questions[15].majorCategory === 'Dialogue', 'DSC q16 major');
  assert(dscPreset.questions[16].majorCategory === 'Grammar', 'DSC q17 major');
  assert(dscPreset.questions[19].majorCategory === 'Grammar', 'DSC q20 major');

  const lsaPreset = SAT.buildPresetAssessmentTemplate('lsa-cq');
  assert(lsaPreset && lsaPreset.level === 'LSA' && lsaPreset.questionCount === 20, 'LSA preset meta');
  assert(lsaPreset.questions[0].majorCategory === 'Story Comprehension', 'LSA q1 major');
  assert(lsaPreset.questions[15].majorCategory === 'Story Comprehension', 'LSA q16 major');
  assert(lsaPreset.questions[16].majorCategory === 'Grammar', 'LSA q17 major');
  assert(lsaPreset.questions[19].majorCategory === 'Grammar', 'LSA q20 major');

  // 21. 템플릿 필터·변환·중복 감지
  const tplList = [
    { id: 't1', name: 'DSC CQ', level: 'DSC', examType: 'CQ', questionCount: 20, questions: [] },
    { id: 't2', name: 'LSA CQ', level: 'LSA', examType: 'CQ', questionCount: 20, questions: [] },
    { id: 't3', name: 'DSA Phonics Quiz', level: 'DSA', examType: 'Phonics Quiz', questionCount: 20, questions: [] },
  ];

  const dscTpl = SAT.filterTemplatesByLevel(tplList, 'DSC');
  assert(dscTpl.length === 1 && dscTpl[0].name === 'DSC CQ', 'filter templates by DSC level');

  const lsaTpl = SAT.filterTemplatesByLevel(tplList, 'LSA');
  assert(lsaTpl.length === 1 && lsaTpl[0].id === 't2', 'filter templates by LSA level');

  assert(SAT.filterTemplatesByLevel(tplList, 'DSA').length === 1, 'filter templates by DSA level');
  assert(SAT.filterTemplatesByLevel(tplList, 'UNKNOWN').length === 0, 'unknown level returns empty');

  assert(SAT.hasDuplicateTemplateName(tplList, 'DSC CQ', 'DSC'), 'duplicate name same level');
  assert(SAT.hasDuplicateTemplateName(tplList, 'dsc cq', 'DSC'), 'duplicate name case-insensitive');
  assert(!SAT.hasDuplicateTemplateName(tplList, 'DSC CQ', 'LSA'), 'same name different level ok');
  assert(!SAT.hasDuplicateTemplateName(tplList, 'DSC CQ', 'DSC', 't1'), 'exclude self on edit');

  const applied = SAT.templateQuestionsToExamQuestions(dsaPreset);
  assert(applied.length === 20, 'template apply question count');
  assert(applied.every((q) => q.correctAnswer === ''), 'template to exam clears correctAnswer');
  assert(applied[0].majorCategory === 'Listen & Match', 'template to exam keeps majorCategory');
  assert(applied[0].points === 1, 'template to exam keeps points');

  const examQuestions = [
    { number: 1, correctAnswer: '3', points: 2, majorCategory: 'Grammar', middleCategory: 'Tense', note: 'n1' },
    { number: 2, correctAnswer: 'A', points: 1, majorCategory: 'Dialogue', middleCategory: '', note: '' },
  ];
  const toTemplate = SAT.examQuestionsToTemplateQuestions(examQuestions);
  assert(toTemplate.length === 2, 'exam to template count');
  assert(toTemplate.every((q) => q.correctAnswer === ''), 'exam to template strips correctAnswer');
  assert(toTemplate[0].majorCategory === 'Grammar' && toTemplate[0].points === 2, 'exam to template keeps structure');
  assert(toTemplate[0].note === 'n1', 'exam to template keeps note');

  // 22. 레벨 정규화
  assert(SAT.normalizeLevel('dsc') === 'DSC', 'dsc → DSC');
  assert(SAT.normalizeLevel(' DSC ') === 'DSC', 'trimmed DSC');
  assert(SAT.normalizeLevel('DSC1') === 'DSC', 'DSC1 → DSC');
  assert(SAT.normalizeLevel('DSC-2') === 'DSC', 'DSC-2 → DSC');
  assert(SAT.normalizeLevel('lsa 1') === 'LSA', 'lsa 1 → LSA');
  assert(SAT.normalizeLevel('Ascent') === 'ASCENT', 'Ascent → ASCENT');
  assert(SAT.normalizeLevel('Custom A') === 'CUSTOM A', 'custom level preserved uppercased');
  assert(SAT.normalizeLevel(null) === '', 'null → empty');
  assert(SAT.normalizeLevel(undefined) === '', 'undefined → empty');

  const classDsaVariants = [
    { id: 'c1', name: 'Morning A', level: 'dsa 1' },
    { id: 'c2', name: 'Evening B', level: 'DSA' },
  ];
  const tplDsa = [
    { id: 'tp1', name: 'DSA Phonics Quiz', level: 'DSA', examType: 'Phonics Quiz', questionCount: 20, questions: [] },
    { id: 'tp2', name: 'DSC CQ', level: 'DSC', examType: 'CQ', questionCount: 20, questions: [] },
  ];
  assert(
    SAT.filterTemplatesByLevel(tplDsa, classDsaVariants[0].level).length === 1,
    'DSA class variant matches DSA template'
  );
  assert(
    SAT.filterTemplatesByLevel(tplDsa, 'dsc').length === 1 && SAT.filterTemplatesByLevel(tplDsa, 'dsc')[0].id === 'tp2',
    'dsc filter matches DSC template'
  );
  assert(SAT.hasDuplicateTemplateName(tplDsa, 'DSC CQ', 'dsc'), 'duplicate detects normalized level');
  assert(!SAT.hasDuplicateTemplateName(tplDsa, 'DSC CQ', 'lsa'), 'different normalized level ok');

  const mixedLevels = SAT.collectDistinctClassLevels([
    { level: 'dsc' },
    { level: 'DSC' },
    { level: 'DSC1' },
    { level: 'Custom A' },
  ]);
  assert(mixedLevels.length === 2 && mixedLevels.includes('DSC') && mixedLevels.includes('CUSTOM A'), 'distinct levels deduped after normalize');

  // 23. 시험–템플릿 연결 표시 및 snapshot
  const tplLive = { id: 't-dsa', name: 'DSA Phonics Quiz', level: 'DSA', examType: 'Phonics Quiz', questionCount: 20, questions: [] };
  const linkage = SAT.buildExamTemplateLinkage(tplLive);
  assert(linkage.templateId === 't-dsa', 'linkage stores templateId');
  assert(linkage.templateNameSnapshot === 'DSA Phonics Quiz', 'linkage stores name snapshot');
  assert(linkage.templateLevelSnapshot === 'DSA', 'linkage stores level snapshot');

  const examFromTpl = { id: 'e1', title: 'Quiz 1', ...linkage };
  let liveDisplay = SAT.getExamTemplateDisplay(examFromTpl, [tplLive]);
  assert(liveDisplay.text === '사용한 템플릿: DSA Phonics Quiz', 'live template name shown');

  liveDisplay = SAT.getExamTemplateDisplay(examFromTpl, [{ ...tplLive, name: 'Renamed Template' }]);
  assert(liveDisplay.text === '사용한 템플릿: Renamed Template', 'renamed template shows current name');

  const deletedDisplay = SAT.getExamTemplateDisplay(examFromTpl, []);
  assert(deletedDisplay.text === '사용한 템플릿: DSA Phonics Quiz (삭제됨)', 'deleted template shows snapshot');

  const legacyDisplay = SAT.getExamTemplateDisplay({ templateId: 'missing-id' }, []);
  assert(legacyDisplay.text === '사용한 템플릿: 삭제되었거나 확인할 수 없음', 'legacy exam without snapshot');

  assert(SAT.getExamTemplateDisplay({ title: 'No template' }, []) === null, 'no templateId hides display');

  const migrated = SAT.normalizeExamTemplateFields({ id: 'e-old', templateId: 't1', title: 'Old' });
  assert(migrated.templateNameSnapshot === '' && migrated.templateLevelSnapshot === '', 'migrate adds empty snapshots');

  const gradeQs = [{ id: 'q1', number: 1, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '' }];
  const gradeResult = SAT.gradeAnswers(gradeQs, { q1: '2' });
  assert(gradeResult.correctCount === 1 && gradeResult.totalPoints === 1, 'grading unchanged after template removal');

  // 24. 문항 수 줄이기 확인 로직
  const twentyQs = Array.from({ length: 20 }, (_, i) => ({
    number: i + 1,
    correctAnswer: '',
    points: 1,
    majorCategory: '',
    middleCategory: '',
    note: '',
  }));
  twentyQs[10] = { ...twentyQs[10], correctAnswer: '3', majorCategory: 'Grammar' };
  twentyQs[19] = { ...twentyQs[19], note: 'memo' };

  const removed = SAT.getRemovedQuestions(twentyQs, 10);
  assert(removed.length === 10 && removed[0].number === 11 && removed[9].number === 20, '20→10 removed range 11–20');
  assert(SAT.getRemovedQuestionRangeLabel(20, 10) === '11~20번', 'removed range label');

  assert(SAT.hasMeaningfulQuestionData({ number: 11, correctAnswer: '2', points: 1 }), 'correctAnswer is meaningful');
  assert(SAT.hasMeaningfulQuestionData({ number: 11, points: 2, majorCategory: '' }), 'non-default points meaningful');
  assert(SAT.hasMeaningfulQuestionData({ number: 11, majorCategory: 'Dialogue', points: 1 }), 'majorCategory meaningful');
  assert(!SAT.hasMeaningfulQuestionData({ number: 11, points: 1, majorCategory: '', middleCategory: '', note: '' }), 'empty question');

  const dataMsg = SAT.buildQuestionCountReductionMessage(20, 10, removed);
  assert(dataMsg.includes('11~20번') && dataMsg.includes('되돌릴 수 없습니다'), 'meaningful data warning message');

  const emptyRemoved = SAT.getRemovedQuestions(twentyQs.slice(0, 10), 10);
  const emptyMsg = SAT.buildQuestionCountReductionMessage(20, 10, emptyRemoved);
  assert(emptyMsg.includes('빈 문항이 제거됩니다'), 'empty removed warning message');

  const kept = SAT.resizeQuestions(twentyQs, 25);
  assert(kept.length === 25 && kept[0].correctAnswer === twentyQs[0].correctAnswer, 'increase keeps existing');
  assert(kept[24].number === 25 && kept[24].majorCategory === '', 'increase adds empty defaults');

  const shrunk = SAT.resizeQuestions(twentyQs, 10);
  assert(shrunk.length === 10 && shrunk[9].number === 10, 'decrease keeps first N');
  assert(!shrunk.some((q) => q.number > 10), 'decrease drops trailing questions');

  assert(!SAT.needsQuestionCountReductionConfirm(20, 10, true), 'new record skips confirm');
  assert(SAT.needsQuestionCountReductionConfirm(20, 10, false), 'edit record needs confirm');
  assert(!SAT.needsQuestionCountReductionConfirm(10, 20, false), 'increase skips confirm');

  const mergedRemoved = SAT.mergeQuestionsForReductionCheck(
    twentyQs,
    [{ number: 12, correctAnswer: '9', points: 1, majorCategory: '', middleCategory: '', note: '' }],
    10,
    20
  );
  assert(mergedRemoved.find((q) => q.number === 12)?.correctAnswer === '9', 'merge prefers form values for removed');

  let repositorySaveCalls = 0;
  const runSave = (proceed) => {
    if (!SAT.needsQuestionCountReductionConfirm(20, 10, false)) return true;
    if (!proceed) return false;
    repositorySaveCalls += 1;
    return true;
  };
  assert(runSave(false) === false && repositorySaveCalls === 0, 'cancel skips repository save');
  assert(runSave(true) === true && repositorySaveCalls === 1, 'confirm proceeds to save');

  assert(
    SAT.buildQuestionCountReductionMessage(20, 10, removed) ===
      SAT.buildQuestionCountReductionMessage(20, 10, removed),
    'exam and template share same reduction message helper'
  );

  // 25. 범위 일괄 적용
  const aceQuestions = Array.from({ length: 12 }, (_, i) => ({
    number: i + 1,
    correctAnswer: String((i % 5) + 1),
    points: 1,
    majorCategory: 'Mixed',
    middleCategory: `Topic ${i + 1}`,
    note: i === 0 ? 'keep' : '',
  }));

  const majorOnlyPatch = SAT.applyQuestionRangePatch(aceQuestions, {
    startNumber: 1,
    endNumber: 10,
    fields: { majorCategory: 'Story Comprehension' },
  });
  assert(
    majorOnlyPatch.filter((q) => q.number <= 10).every((q) => q.majorCategory === 'Story Comprehension'),
    '1~10 majorCategory bulk apply'
  );
  assert(
    majorOnlyPatch.find((q) => q.number === 1).middleCategory === 'Topic 1' &&
      majorOnlyPatch.find((q) => q.number === 5).middleCategory === 'Topic 5',
    'ACE middleCategory preserved when not checked'
  );
  assert(majorOnlyPatch.find((q) => q.number === 11).majorCategory === 'Mixed', 'out-of-range question unchanged');
  assert(majorOnlyPatch.find((q) => q.number === 1).correctAnswer === '1', 'correctAnswer never bulk-patched');

  const withPoints = SAT.applyQuestionRangePatch(aceQuestions, {
    startNumber: 3,
    endNumber: 5,
    fields: { points: 2 },
  });
  assert(withPoints.find((q) => q.number === 3).points === 2, 'points apply in subrange');
  assert(withPoints.find((q) => q.number === 2).points === 1, 'unchecked range keeps points');

  const clearNote = SAT.applyQuestionRangePatch(
    [{ number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '', note: 'old' }],
    { startNumber: 1, endNumber: 1, fields: { note: '' } }
  );
  assert(clearNote[0].note === '', 'checked empty note clears value');

  const invalidRange = SAT.validateQuestionRangePatch(5, 3, 10);
  assert(!invalidRange.valid, 'reject start > end');
  const overCount = SAT.validateQuestionRangePatch(1, 15, 10);
  assert(!overCount.valid, 'reject end > questionCount');

  const prepared = SAT.prepareQuestionRangePatch(
    {
      startNumber: 1,
      endNumber: 10,
      applyMajorCategory: true,
      majorCategory: 'Story Comprehension',
    },
    20
  );
  assert(prepared.valid && prepared.summary.includes('Story Comprehension'), 'summary includes applied major');
  assert(prepared.affectedCount === 10, 'affected count in prepared patch');

  const noFields = SAT.prepareQuestionRangePatch({ startNumber: 1, endNumber: 5 }, 10);
  assert(!noFields.valid, 'reject when no apply checkbox selected');

  const templatePatch = SAT.applyQuestionRangePatch(
    [{ number: 1, points: 1, majorCategory: '', middleCategory: '', note: '', correctAnswer: '' }],
    { startNumber: 1, endNumber: 1, fields: { majorCategory: 'Dictation', middleCategory: 'Words' } }
  );
  assert(templatePatch[0].majorCategory === 'Dictation', 'template questions patch same as exam');

  // 26. 문항 구조 검사·복구
  const makeQ = (n, extra = {}) => ({
    number: n,
    points: 1,
    majorCategory: extra.majorCategory || 'G',
    middleCategory: extra.middleCategory || '',
    note: extra.note || '',
    correctAnswer: extra.correctAnswer || '',
  });

  const valid20 = Array.from({ length: 20 }, (_, i) => makeQ(i + 1));
  const validCheck = SAT.validateQuestionStructure({ questionCount: 20, questions: valid20 });
  assert(validCheck.status === 'valid', 'valid structure detected');
  const validRepair = SAT.repairQuestionStructure({ questionCount: 20, questions: valid20 });
  assert(validRepair.success && !validRepair.changed, 'valid data not rewritten');

  const partial18 = valid20.slice(0, 18);
  const partialValidation = SAT.validateQuestionStructure({ questionCount: 20, questions: partial18 });
  assert(partialValidation.status === 'repairable', 'count 20 with 18 questions is repairable');
  const partialRepaired = SAT.repairQuestionStructure({ questionCount: 20, questions: partial18 });
  assert(partialRepaired.questions.length === 20, 'repair fills to questionCount 20');
  assert(partialRepaired.questions[17].majorCategory === 'G', 'existing question data kept');
  assert(partialRepaired.questions[19].majorCategory === '', 'missing slots filled empty');

  const noCountQs = [{ number: 1, points: 1, majorCategory: 'A' }, { number: 3, points: 1, majorCategory: 'C' }];
  const noCountRepair = SAT.repairQuestionStructure({ questions: noCountQs });
  assert(noCountRepair.questionCount === 3 && noCountRepair.questions.length === 3, 'derive count from max number');
  assert(noCountRepair.questions[1].majorCategory === '', 'missing number 2 filled');

  const shuffled = [makeQ(3), makeQ(1), makeQ(2)];
  const shuffledRepair = SAT.repairQuestionStructure({ questionCount: 3, questions: shuffled });
  assert(
    shuffledRepair.questions.map((q) => q.number).join(',') === '1,2,3',
    'unsorted questions sorted'
  );

  const dupValidation = SAT.validateQuestionStructure({
    questionCount: 3,
    questions: [makeQ(1), makeQ(1), makeQ(2)],
    entityLabel: 'Test Exam',
    entityType: 'exam',
  });
  assert(dupValidation.status === 'blockingError', 'duplicate numbers block');
  assert(dupValidation.issues[0].includes('중복'), 'duplicate error message');

  const emptyWithCount = SAT.repairQuestionStructure({ questionCount: 5, questions: [] });
  assert(emptyWithCount.questions.length === 5, 'empty questions rebuilt from count');

  const importPayload = {
    exams: [{ id: 'e1', title: 'Midterm', questionCount: 20, classId: 'c1', date: '2026-01-01' }],
    questions: partial18.map((q) => ({ ...q, id: `q${q.number}`, examId: 'e1' })),
    assessmentTemplates: [],
  };
  const importStructure = SAT.validateImportStructure(importPayload);
  assert(importStructure.status === 'repairable', 'import detects exam question mismatch');
  const importRepaired = SAT.repairImportPayload(importPayload);
  assert(importRepaired.payload.exams[0].questionCount === 20, 'import repair syncs exam count');
  assert(importRepaired.payload.questions.length === 20, 'import repair fills exam questions');

  const dupImport = SAT.validateImportStructure({
    exams: [{ id: 'e2', title: 'Bad', questionCount: 2 }],
    questions: [
      { id: 'a', examId: 'e2', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G' },
      { id: 'b', examId: 'e2', number: 1, correctAnswer: '2', points: 1, majorCategory: 'G' },
    ],
    assessmentTemplates: [],
  });
  assert(dupImport.status === 'blockingError', 'import blocks duplicate exam numbers');

  // 27. 시험 문항 id 보장
  let idSeq = 0;
  const mkId = () => `gen-${++idSeq}`;
  const noIdQuestions = [
    { examId: 'e1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '', note: '' },
    { examId: 'e1', number: 2, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '', note: '' },
    { examId: 'e1', number: 3, correctAnswer: '3', points: 1, majorCategory: 'G', middleCategory: '', note: '' },
  ];
  const ensuredImport = SAT.ensureExamQuestionIds(noIdQuestions, { createId: mkId });
  assert(ensuredImport.questions.length === 3, 'three questions ensured');
  assert(
    new Set(ensuredImport.questions.map((q) => q.id)).size === 3,
    'imported questions get distinct ids'
  );
  assert(ensuredImport.changed && ensuredImport.repairs.length === 3, 'missing id repairs logged');

  const repairedMissing = SAT.repairQuestionStructure(
    { questionCount: 3, questions: [{ number: 1, correctAnswer: '1', points: 1, majorCategory: 'G' }] },
    { entityType: 'exam' }
  );
  idSeq = 0;
  const ensuredMissing = SAT.ensureExamQuestionIds(
    repairedMissing.questions.map((q) => ({ ...q, examId: 'e2' })),
    { createId: mkId }
  );
  assert(
    ensuredMissing.questions.every((q) => q.id && q.examId === 'e2' && q.number >= 1),
    'auto-created missing questions get id examId number'
  );

  idSeq = 0;
  const dupIds = SAT.ensureExamQuestionIds(
    [
      { id: 'dup', examId: 'e1', number: 1 },
      { id: 'dup', examId: 'e1', number: 2 },
      { id: 'keep', examId: 'e1', number: 3 },
    ],
    { createId: mkId }
  );
  assert(dupIds.questions[0].id === 'dup', 'first duplicate id kept');
  assert(dupIds.questions[1].id !== 'dup', 'second duplicate gets new id');
  assert(dupIds.questions[2].id === 'keep', 'unique id preserved');
  assert(dupIds.repairs.some((r) => r.includes('중복 id')), 'duplicate id repair logged');

  idSeq = 0;
  const keepExisting = SAT.ensureExamQuestionIds(
    [{ id: 'stable-id', examId: 'e1', number: 1 }],
    { createId: mkId }
  );
  assert(!keepExisting.changed && keepExisting.questions[0].id === 'stable-id', 'valid existing id unchanged');

  idSeq = 0;
  const answerSafe = SAT.ensureExamQuestionIds(noIdQuestions, { createId: mkId });
  const answers = {};
  answerSafe.questions.forEach((q) => {
    answers[q.id] = String(q.number);
  });
  assert(Object.keys(answers).length === 3, 'three answer keys');
  assert(new Set(Object.values(answers)).size === 3, 'answers not overwritten via undefined key');

  const templateOnly = { number: 1, points: 1, majorCategory: 'G', middleCategory: '', note: '' };
  assert(templateOnly.id === undefined, 'template questions do not require id');

  // 28. computeExamOverview 재채점 일관성
  const overviewQs = [
    { id: 'q1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' },
    { id: 'q2', number: 2, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '' },
  ];
  const overviewResults = [
    {
      studentId: 's1',
      answers: { q1: '1', q2: '2' },
      percentage: 0.5,
      earnedPoints: 1,
      totalPoints: 2,
      correctCount: 1,
    },
    {
      studentId: 's2',
      answers: { q1: '1', q2: '1' },
      percentage: 1,
      earnedPoints: 2,
      totalPoints: 2,
      correctCount: 2,
    },
  ];
  const students = [{ id: 's1', active: true }, { id: 's2', active: true }];

  const staleOverview = SAT.computeExamOverview(overviewResults, students, overviewQs);
  assert(staleOverview.classAverage === 0.75, 'overview uses recomputed not stale stored average');
  assert(staleOverview.highest === 1 && staleOverview.lowest === 0.5, 'highest/lowest recomputed');
  assert(
    staleOverview.studentScores.find((s) => s.studentId === 's1')?.percentage === 1,
    'studentScores match recomputed grades'
  );
  assert(
    staleOverview.studentScores.find((s) => s.studentId === 's2')?.percentage === 0.5,
    'studentScores reflect partial credit'
  );

  const changedAnswerQs = [
    { id: 'q1', number: 1, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '' },
    { id: 'q2', number: 2, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '' },
  ];
  const afterAnswerChange = SAT.computeExamOverview(overviewResults, students, changedAnswerQs);
  assert(afterAnswerChange.classAverage === 0.25, 'class average updates after answer key change');

  const weightedQs = [
    { id: 'q1', number: 1, correctAnswer: '1', points: 3, majorCategory: 'G', middleCategory: '' },
    { id: 'q2', number: 2, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '' },
  ];
  const weightedOverview = SAT.computeExamOverview(overviewResults, students, weightedQs);
  const expectedS1 = SAT.gradeAnswers(weightedQs, overviewResults[0].answers).percentage;
  const expectedS2 = SAT.gradeAnswers(weightedQs, overviewResults[1].answers).percentage;
  assert(
    weightedOverview.studentScores.find((s) => s.studentId === 's1')?.percentage === expectedS1,
    'student score matches weighted regrade'
  );
  assert(weightedOverview.classAverage === (expectedS1 + expectedS2) / 2, 'average matches weighted scores');
  assert(
    weightedOverview.highest === Math.max(expectedS1, expectedS2) &&
      weightedOverview.lowest === Math.min(expectedS1, expectedS2),
    'high/low match weighted scores'
  );

  const caseQs = [{ id: 'q1', number: 1, correctAnswer: 'a', points: 1, majorCategory: 'G', middleCategory: '' }];
  const caseResults = [{ studentId: 's1', answers: { q1: 'A' }, percentage: 0 }];
  const caseSensitive = SAT.computeExamOverview(caseResults, students, caseQs, { ignoreCase: false });
  const caseInsensitive = SAT.computeExamOverview(caseResults, students, caseQs, { ignoreCase: true });
  assert(caseSensitive.classAverage === 0, 'ignoreCase false treats A vs a as wrong');
  assert(caseInsensitive.classAverage === 1, 'ignoreCase true treats A vs a as correct');

  const noQuestionsOverview = SAT.computeExamOverview(overviewResults, students, []);
  assert(noQuestionsOverview.classAverage === 0.75, 'fallback to stored percentages when no questions');
  assert(Array.isArray(noQuestionsOverview.questionStats), 'no throw when questions empty');

  // 29. HTML escape — 차트 fallback·인쇄 표
  const SATChart = loadSat(['js/chart-manager.js']);
  const xssPayloads = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    'Grammar & Reading',
    '"Quoted" Category',
    'A < B',
  ];

  assert(SAT.escapeHtml('Grammar & Reading') === 'Grammar &amp; Reading', 'escape ampersand');
  assert(SAT.escapeHtml('A < B') === 'A &lt; B', 'escape less-than');
  assert(SAT.escapeHtml('"Quoted" Category') === '&quot;Quoted&quot; Category', 'escape quotes');
  assert(SAT.escapeHtml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;', 'escape script tags');

  assert(SAT.clampPercent(-5) === 0, 'clamp negative percent');
  assert(SAT.clampPercent(150) === 100, 'clamp over 100');
  assert(SAT.clampPercent('abc') === 0, 'clamp non-numeric');
  assert(SAT.percentFromRatio(1, 2) === 50, 'ratio percent');

  const maliciousMajor = '<script>alert(1)</script>';
  const maliciousTitle = '<img src=x onerror=alert(1)>';
  const chartStats = {
    major: {
      [maliciousMajor]: { correct: 1, total: 2 },
      'Grammar & Reading': { correct: 2, total: 4 },
    },
    middle: {
      k1: { major: maliciousMajor, middle: '"Quoted" Category', correct: 1, total: 1 },
    },
  };
  const chartTrend = [
    {
      title: maliciousTitle,
      date: '2026-01-15',
      percentage: 1.5,
      earnedPoints: 10,
      totalPoints: 10,
    },
    {
      title: 'A < B',
      date: '<script>bad</script>',
      percentage: -0.2,
      earnedPoints: 1,
      totalPoints: 5,
    },
  ];

  const printHtml = SATChart.renderPrintChartTables(chartStats, chartTrend);
  assert(!printHtml.includes('<script>alert(1)</script>'), 'print table: no raw script in major');
  assert(printHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'print table: escaped major category');
  assert(printHtml.includes('Grammar &amp; Reading'), 'print table: escaped ampersand category');
  assert(!printHtml.includes('<img src=x'), 'print table: no raw img xss in trend title');
  assert(printHtml.includes('&quot;Quoted&quot; Category'), 'print table: escaped middle category quotes');
  assert(printHtml.includes('100%'), 'print table: trend percentage clamped to 100');
  assert(printHtml.includes('0%') || printHtml.includes('>0%<'), 'print table: negative trend percentage clamped');

  const fallbackBars = SATChart.buildFallbackBarsHtml(
    [maliciousMajor, 'A < B'],
    [50, 150],
    chartStats.major
  );
  assert(fallbackBars.includes('&lt;script&gt;'), 'fallback bars: escaped label');
  assert(fallbackBars.includes('width:50%'), 'fallback bars: width clamped 50');
  assert(fallbackBars.includes('width:100%'), 'fallback bars: width clamped 100 not 150');
  assert(!fallbackBars.includes('width:150%'), 'fallback bars: no overflow width');

  const fallbackTrend = SATChart.buildFallbackTrendHtml(chartTrend);
  assert(fallbackTrend.includes('&lt;img'), 'fallback trend: escaped title');
  assert(fallbackTrend.includes('&lt;script&gt;bad&lt;/script&gt;'), 'fallback trend: escaped invalid date');
  assert(fallbackTrend.includes('100% (10/10)'), 'fallback trend: score percent clamped');

  assert(SAT.formatDate('<script>x</script>') === '&lt;script&gt;x&lt;/script&gt;', 'formatDate escapes invalid iso');

  // 30. localStorage 손상·저장 실패 처리
  function createMockStorage(initial = {}) {
    const store = { ...initial };
    let nextSetError = null;
    return {
      store,
      failNextSet(err) {
        nextSetError = err;
      },
      get length() {
        return Object.keys(store).length;
      },
      key(i) {
        return Object.keys(store)[i] ?? null;
      },
      getItem(k) {
        return store[k] ?? null;
      },
      setItem(k, v) {
        if (nextSetError) {
          const err = nextSetError;
          nextSetError = null;
          throw err;
        }
        store[k] = String(v);
      },
      removeItem(k) {
        delete store[k];
      },
    };
  }

  const SATStorage = loadSat(['js/data-integrity-utils.js', 'js/storage-adapter.js', 'js/storage-repository.js']);
  const MAIN_KEY = 'studentAchievementTrackerData';

  const goodStore = createMockStorage({
    [MAIN_KEY]: JSON.stringify({
      schemaVersion: 2,
      settings: { ignoreCase: true },
      classes: [{ id: 'c1', name: '반A', level: 'LSA', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      students: [],
      exams: [],
      questions: [],
      results: [],
      assessmentTemplates: [],
    }),
  });
  const goodRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(goodStore),
  });
  const goodData = goodRepo.loadAll();
  assert(goodData.classes.length === 1, 'normal JSON load');
  assert(!goodRepo.isStorageRecoveryRequired(), 'normal load: no recovery');

  const corruptRaw = '{not-json';
  const corruptStore = createMockStorage({ [MAIN_KEY]: corruptRaw });
  const corruptRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(corruptStore),
  });
  const corruptLoad = corruptRepo.loadAll();
  assert(corruptRepo.isStorageRecoveryRequired(), 'corrupt parse triggers recovery');
  assert(corruptLoad.classes.length === 0, 'corrupt load uses empty working copy');
  assert(corruptStore.store[MAIN_KEY] === corruptRaw, 'corrupt load does not overwrite main key');
  const backupKeys = Object.keys(corruptStore.store).filter((k) =>
    k.startsWith(SATStorage.STORAGE_CORRUPT_PREFIX)
  );
  assert(backupKeys.length === 1, 'corrupt raw saved to backup key');
  assert(corruptStore.store[backupKeys[0]] === corruptRaw, 'backup contains raw corrupt string');
  assert(corruptRepo.getCorruptRaw() === corruptRaw, 'repo keeps corrupt raw reference');

  const blocked = corruptRepo.saveClass({ name: 'New', level: 'LSA' });
  assert(SATStorage.isSaveFailure(blocked), 'save blocked during recovery');
  assert(blocked.code === SATStorage.StorageErrorCodes.RECOVERY_REQUIRED, 'recovery required code');
  assert(corruptStore.store[MAIN_KEY] === corruptRaw, 'blocked save leaves main key untouched');

  const fresh = corruptRepo.startFreshAfterRecovery();
  assert(fresh.ok, 'start fresh succeeds');
  assert(!corruptRepo.isStorageRecoveryRequired(), 'recovery cleared after fresh start');
  assert(JSON.parse(corruptStore.store[MAIN_KEY]).classes.length === 0, 'main key replaced after fresh start');
  assert(corruptStore.store[backupKeys[0]] === corruptRaw, 'corrupt backup preserved after fresh start');

  const quotaStore = createMockStorage();
  const quotaRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(quotaStore),
  });
  quotaRepo.loadAll();
  const firstSave = quotaRepo.saveClass({ name: 'Persist', level: 'LSA' });
  assert(firstSave.ok, 'first save succeeds');
  assert(quotaRepo.getClasses().length === 1, 'first save persisted in cache');
  const quotaErr = new Error('quota');
  quotaErr.name = 'QuotaExceededError';
  quotaStore.failNextSet(quotaErr);
  const failSave = quotaRepo.saveClass({ name: 'Another', level: 'LSA' });
  assert(SATStorage.isSaveFailure(failSave), 'quota error returns failure');
  assert(failSave.code === SATStorage.StorageErrorCodes.QUOTA_EXCEEDED, 'quota error code');
  assert(quotaRepo.getClasses().length === 1, 'cache rolled back after quota failure');
  assert(quotaRepo.getClasses()[0].name === 'Persist', 'rolled back cache keeps prior class');

  const pruneStore = createMockStorage({ [MAIN_KEY]: corruptRaw });
  const pruneAdapter = SATStorage.createLocalStorageAdapter(pruneStore);
  for (let i = 0; i < 7; i += 1) {
    pruneAdapter.preserveCorruptBackup(MAIN_KEY, `${corruptRaw}-${i}`);
  }
  const pruneKeys = pruneAdapter.listCorruptBackupKeys();
  assert(pruneKeys.length === SATStorage.MAX_CORRUPT_BACKUPS, 'corrupt backups pruned to max');

  const bytes = SATStorage.estimateStorageBytes({ classes: [{ name: 'test' }] });
  assert(bytes > 0, 'estimateStorageBytes returns positive');

  const importStore = createMockStorage({ [MAIN_KEY]: corruptRaw });
  const importRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(importStore),
  });
  importRepo.loadAll();
  assert(importRepo.isStorageRecoveryRequired(), 'recovery before import');
  const payload = {
    schemaVersion: 2,
    settings: { ignoreCase: true },
    classes: [{ id: 'c2', name: '복원', level: 'DSA', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    students: [],
    exams: [],
    questions: [],
    results: [],
    assessmentTemplates: [],
  };
  const imported = importRepo.importData(payload);
  assert(imported.ok, 'import during recovery succeeds');
  assert(!importRepo.isStorageRecoveryRequired(), 'import clears recovery');
  assert(importRepo.loadAll().classes[0].name === '복원', 'imported data loaded');

  // 31. JSON import 참조 무결성
  const SATInt = loadSat(['js/data-integrity-utils.js']);

  function makeIntegrityFixture(overrides = {}) {
    const base = {
      schemaVersion: 2,
      settings: { ignoreCase: true },
      classes: [
        { id: 'c1', name: 'DSA', level: 'DSA', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
      students: [
        {
          id: 's1',
          classId: 'c1',
          name: 'Kim',
          englishName: 'Kim',
          active: true,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      exams: [
        {
          id: 'e1',
          classId: 'c1',
          title: 'DSC1 CQ Lesson 3 & 4',
          questionCount: 1,
          date: '2026-01-01',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      questions: [
        {
          id: 'q1',
          examId: 'e1',
          number: 1,
          correctAnswer: '1',
          points: 1,
          majorCategory: 'G',
          middleCategory: '',
          note: '',
        },
      ],
      results: [
        {
          id: 'r1',
          examId: 'e1',
          studentId: 's1',
          answers: { q1: '1' },
          correctCount: 1,
          earnedPoints: 1,
          totalPoints: 1,
          percentage: 1,
          submittedAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      assessmentTemplates: [],
    };
    return { ...base, ...overrides };
  }

  const validFixture = makeIntegrityFixture();
  assert(SATInt.validateImportReadiness(validFixture).status === 'valid', 'valid import fixture');

  const orphanStudent = makeIntegrityFixture();
  orphanStudent.students[0].classId = 'missing-class';
  assert(
    SATInt.validateDataIntegrity(orphanStudent).status === 'blockingError',
    'orphan student.classId blocks'
  );

  const orphanExam = makeIntegrityFixture();
  orphanExam.exams[0].classId = 'missing-class';
  assert(
    SATInt.validateDataIntegrity(orphanExam).status === 'blockingError',
    'orphan exam.classId blocks'
  );

  const orphanQuestion = makeIntegrityFixture();
  orphanQuestion.questions[0].examId = 'missing-exam';
  assert(
    SATInt.validateDataIntegrity(orphanQuestion).status === 'blockingError',
    'orphan question.examId blocks'
  );

  const orphanResultExam = makeIntegrityFixture();
  orphanResultExam.results[0].examId = 'missing-exam';
  assert(
    SATInt.validateDataIntegrity(orphanResultExam).errors.some((e) => e.code === 'ORPHAN_RESULT_EXAM'),
    'orphan result.examId blocks'
  );

  const orphanResultStudent = makeIntegrityFixture();
  orphanResultStudent.results[0].studentId = 'missing-student';
  assert(
    SATInt.validateDataIntegrity(orphanResultStudent).errors.some((e) => e.code === 'ORPHAN_RESULT_STUDENT'),
    'orphan result.studentId blocks'
  );

  const classMismatch = makeIntegrityFixture();
  classMismatch.classes.push({
    id: 'c2',
    name: 'DSC',
    level: 'DSC',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  });
  classMismatch.exams[0].classId = 'c2';
  assert(
    SATInt.validateDataIntegrity(classMismatch).errors.some((e) => e.code === 'RESULT_CLASS_MISMATCH'),
    'student/exam class mismatch blocks'
  );

  const dupClass = makeIntegrityFixture();
  dupClass.classes.push({ ...dupClass.classes[0], name: 'Other' });
  assert(
    SATInt.validateDataIntegrity(dupClass).errors.some((e) => e.code === 'DUPLICATE_CLASS_ID'),
    'duplicate class id blocks'
  );

  const dupPair = makeIntegrityFixture();
  dupPair.results.push({
    ...dupPair.results[0],
    id: 'r2',
    updatedAt: '2026-01-02',
  });
  assert(
    SATInt.validateDataIntegrity(dupPair).errors.some((e) => e.code === 'DUPLICATE_RESULT_PAIR'),
    'duplicate examId+studentId result blocks'
  );

  const missingTemplateSnap = makeIntegrityFixture();
  missingTemplateSnap.exams[0].templateId = 'tpl-missing';
  missingTemplateSnap.exams[0].templateNameSnapshot = 'Old Template';
  const snapIntegrity = SATInt.validateDataIntegrity(missingTemplateSnap);
  assert(snapIntegrity.status === 'valid', 'missing template with snapshot stays valid');
  assert(
    snapIntegrity.warnings.some((w) => w.code === 'MISSING_TEMPLATE_WITH_SNAPSHOT'),
    'missing template with snapshot warns'
  );

  const missingTemplateNoSnap = makeIntegrityFixture();
  missingTemplateNoSnap.exams[0].templateId = 'tpl-missing';
  missingTemplateNoSnap.exams[0].templateNameSnapshot = '';
  const noSnapIntegrity = SATInt.validateDataIntegrity(missingTemplateNoSnap);
  assert(noSnapIntegrity.status === 'valid', 'missing template without snapshot stays valid');
  assert(
    noSnapIntegrity.warnings.some((w) => w.code === 'MISSING_TEMPLATE'),
    'missing template without snapshot warns'
  );

  const repairableQuestion = makeIntegrityFixture();
  repairableQuestion.questions[0] = { ...repairableQuestion.questions[0], id: '' };
  assert(
    SATInt.validateDataIntegrity(repairableQuestion).status === 'repairable',
    'missing question id is repairable'
  );
  const repairedQuestion = SATInt.repairDataIntegrity(repairableQuestion, { createId: () => 'gen-q1' });
  assert(repairedQuestion.payload.questions[0].id === 'gen-q1', 'repair assigns question id');
  assert(
    SATInt.validateImportReadiness(repairedQuestion.payload).status === 'valid',
    'repaired payload becomes valid'
  );

  const atomicStore = createMockStorage({
    [MAIN_KEY]: JSON.stringify({
      schemaVersion: 2,
      settings: { ignoreCase: true },
      classes: [{ id: 'keep', name: 'Keep', level: 'LSA', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      students: [],
      exams: [],
      questions: [],
      results: [],
      assessmentTemplates: [],
    }),
  });
  const atomicRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(atomicStore),
  });
  atomicRepo.loadAll();
  const storedBefore = atomicStore.store[MAIN_KEY];
  const blockedImport = atomicRepo.importData(orphanStudent);
  assert(!blockedImport.ok, 'blocking import fails');
  assert(atomicStore.store[MAIN_KEY] === storedBefore, 'blocking import does not mutate storage');
  const repairBlocked = atomicRepo.importData(repairableQuestion);
  assert(repairBlocked.code === 'INTEGRITY_REPAIR_REQUIRED', 'repairable import blocked until repaired');

  const goodImport = atomicRepo.importData(validFixture);
  assert(goodImport.ok, 'valid fixture imports successfully');
  assert(atomicRepo.loadAll().students[0].name === 'Kim', 'valid fixture regression import');

  // 32. 시험 복제 — 문항 보존, 결과 미복사
  const sourceExam = {
    id: 'e-src',
    classId: 'c1',
    title: 'Original CQ',
    examType: 'CQ',
    date: '2026-01-10',
    questionCount: 2,
  };
  const sourceQuestions = [
    {
      id: 'q-src-1',
      examId: 'e-src',
      number: 1,
      correctAnswer: '3',
      points: 2,
      majorCategory: 'Grammar',
      middleCategory: 'Tense',
      note: 'keep',
    },
    {
      id: 'q-src-2',
      examId: 'e-src',
      number: 2,
      correctAnswer: 'A',
      points: 1,
      majorCategory: 'Dialogue',
      middleCategory: '',
      note: '',
    },
  ];
  let dupSeq = 0;
  const duplicated = SAT.buildDuplicatedExamRecords(sourceExam, sourceQuestions, {
    newExamId: 'e-dup',
    title: 'Original CQ (복제)',
    date: '2026-02-01',
    createId: () => `q-dup-${++dupSeq}`,
  });
  assert(duplicated.exam.id === 'e-dup' && duplicated.exam.id !== sourceExam.id, 'duplicated exam id differs');
  assert(sourceExam.id === 'e-src' && sourceExam.title === 'Original CQ', 'source exam not mutated');
  assert(sourceQuestions[0].id === 'q-src-1', 'source question id unchanged');
  assert(duplicated.questions.length === 2, 'question count preserved');
  assert(duplicated.questions.every((q) => q.examId === 'e-dup'), 'duplicated questions point to new exam');
  assert(duplicated.questions[0].id !== 'q-src-1' && duplicated.questions[1].id !== 'q-src-2', 'question ids regenerated');
  assert(duplicated.questions[0].correctAnswer === '3', 'correctAnswer preserved');
  assert(duplicated.questions[0].points === 2, 'points preserved');
  assert(duplicated.questions[0].majorCategory === 'Grammar', 'major preserved');
  assert(duplicated.questions[0].middleCategory === 'Tense', 'middle preserved');

  const dupStore = createMockStorage();
  const dupRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(dupStore),
  });
  dupRepo.saveClass({ id: 'c1', name: 'DSA', level: 'DSA' });
  dupRepo.saveExam(sourceExam);
  dupRepo.saveQuestions('e-src', sourceQuestions);
  dupRepo.saveResult({
    id: 'r-src',
    examId: 'e-src',
    studentId: 's1',
    answers: { 'q-src-1': '3' },
    correctCount: 1,
    earnedPoints: 2,
    totalPoints: 3,
    percentage: 2 / 3,
  });
  dupRepo.saveExam(duplicated.exam);
  dupRepo.saveQuestions('e-dup', duplicated.questions);
  assert(dupRepo.getExam('e-src').title === 'Original CQ', 'original exam still present');
  assert(dupRepo.getQuestionsByExam('e-src').length === 2, 'original questions kept');
  assert(dupRepo.getResults({ examId: 'e-src' }).length === 1, 'original result kept');
  assert(dupRepo.getResults({ examId: 'e-dup' }).length === 0, 'results not copied to duplicate');
  assert(dupRepo.getQuestionsByExam('e-dup')[0].id !== 'q-src-1', 'saved duplicate has new question ids');

  // 33. 학생 시험 추이 정렬
  const trendQs = {
    e1: [{ id: 'a1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' }],
    e2: [{ id: 'b1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' }],
    e3: [{ id: 'c1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' }],
  };
  const trendExams = [
    { id: 'e2', title: 'Mid', date: '2026-02-10' },
    { id: 'e3', title: 'Late', date: '2026-03-10' },
    { id: 'e1', title: 'Early', date: '2026-01-10' },
    { id: 'e4', title: 'No result', date: '2026-04-10' },
  ];
  const trendResults = [
    { examId: 'e3', answers: { c1: '2' } },
    { examId: 'e1', answers: { a1: '1' } },
    { examId: 'e2', answers: { b1: '1' } },
  ];
  const trend = SAT.getStudentExamTrend(trendResults, trendExams, trendQs);
  assert(trend.length === 3, 'exams without results omitted');
  assert(trend.map((t) => t.examId).join(',') === 'e1,e2,e3', 'trend sorted by exam date');
  assert(trend[0].percentage === 1 && trend[1].percentage === 1 && trend[2].percentage === 0, 'trend percentages');
  assert(SAT.getStudentExamTrend([], trendExams, trendQs).length === 0, 'empty results yield empty trend');

  // 34. 반 평균 — 응시 percentage 산술평균
  const avgQs = [
    { id: 'q1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' },
    { id: 'q2', number: 2, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' },
  ];
  const avgResults = [
    { answers: { q1: '1', q2: '1' } },
    { answers: { q1: '1', q2: '2' } },
  ];
  const classAvg = SAT.getClassAverageForExam(avgResults, avgQs);
  assert(classAvg === 0.75, 'class average is arithmetic mean of exam percentages');
  assert(SAT.getClassAverageForExam([], avgQs) === null, 'no results → null average');

  // 35. 장기 집계 A/B 구분 + 중분류 누적
  const longAgg = SAT.aggregateStudentResultsAcrossExams(
    [
      { examId: 'e1', answers: { q1: '1' } },
      { examId: 'e2', answers: { x1: '1', x2: '2', x3: '2' } },
    ],
    {
      e1: [{ id: 'q1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: 'Tense' }],
      e2: [
        { id: 'x1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: 'Tense' },
        { id: 'x2', number: 2, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' },
        { id: 'x3', number: 3, correctAnswer: '1', points: 1, majorCategory: 'R', middleCategory: 'Main Idea' },
      ],
    }
  );
  assert(longAgg.percentage === 0.5, 'cumulative rate = earned/totalPoints');
  assert(longAgg.avgExamPercentage === (1 + 1 / 3) / 2, 'exam-average rate is mean of per-exam percentages');
  assert(longAgg.percentage !== longAgg.avgExamPercentage, 'A and B remain distinct');
  const tenseKey = SAT.makeMiddleKey('G', 'Tense');
  assert(longAgg.categoryStats.middle[tenseKey].correct === 2, 'same middle accumulates across exams');
  assert(longAgg.categoryStats.middle[tenseKey].total === 2, 'middle total across exams');
  const emptyMiddleKey = SAT.makeMiddleKey('G', '');
  assert(longAgg.categoryStats.middle[emptyMiddleKey].total === 1, 'empty middle still aggregated');
  assert(SAT.getMiddleDisplayName('') === '미분류', 'empty middle display name');

  // 36. schemaVersion 1 import 회귀
  const v1Payload = {
    schemaVersion: 1,
    settings: { ignoreCase: true, lastBackupAt: null },
    classes: [{ id: 'c-keep', name: 'Keep', level: 'DSA', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    students: [
      {
        id: 's-keep',
        classId: 'c-keep',
        name: 'Lee',
        englishName: 'Lee',
        active: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
    exams: [
      {
        id: 'e-keep',
        classId: 'c-keep',
        title: 'CQ1',
        examType: 'CQ',
        date: '2026-01-01',
        questionCount: 1,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
    questions: [
      {
        id: 'q-keep',
        examId: 'e-keep',
        number: 1,
        correctAnswer: '1',
        points: 1,
        majorCategory: 'Grammar',
        middleCategory: 'Tense',
        note: '',
      },
    ],
    results: [
      {
        id: 'r-keep',
        examId: 'e-keep',
        studentId: 's-keep',
        answers: { 'q-keep': '1' },
        correctCount: 1,
        earnedPoints: 1,
        totalPoints: 1,
        percentage: 1,
        submittedAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
  };
  const v1Store = createMockStorage();
  const v1Repo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(v1Store),
  });
  const v1Ready = SATStorage.validateImportReadiness(v1Payload);
  assert(v1Ready.status === 'repairable', 'v1 missing assessmentTemplates is repairable');
  const v1Prepared = SATStorage.prepareImportPayload(v1Payload);
  assert(v1Prepared.ok, 'v1 prepare/normalize path succeeds');
  assert(
    Array.isArray(v1Prepared.payload.assessmentTemplates) && v1Prepared.payload.assessmentTemplates.length === 0,
    'missing templates become []'
  );
  const v1Imported = v1Repo.importData(v1Prepared.payload);
  assert(v1Imported.ok, 'repaired v1 import succeeds');
  const v1Loaded = v1Repo.loadAll();
  assert(v1Loaded.schemaVersion === 2, 'v1 migrates to schemaVersion 2');
  assert(Array.isArray(v1Loaded.assessmentTemplates) && v1Loaded.assessmentTemplates.length === 0, 'missing templates become []');
  assert(v1Loaded.classes[0].id === 'c-keep', 'class id preserved');
  assert(v1Loaded.students[0].id === 's-keep', 'student id preserved');
  assert(v1Loaded.exams[0].id === 'e-keep', 'exam id preserved');
  assert(v1Loaded.questions[0].id === 'q-keep', 'question id preserved');
  assert(v1Loaded.results[0].id === 'r-keep', 'result id preserved');
  assert(v1Loaded.questions[0].middleCategory === 'Tense', 'academic fields preserved');

  // 37. Counseling / Teacher display presets
  const counseling = SAT.getCounselingStudentResultDisplay();
  const teacher = SAT.getTeacherStudentResultDisplay();
  assert(counseling.showClassAverage === false, 'counseling hides class average');
  assert(teacher.showClassAverage === true, 'teacher shows class average');
  ['showExamMetrics', 'showTrendChart', 'showMajorCategoryRates', 'showMiddleCategoryRates', 'showTeacherComment'].forEach((key) => {
    assert(counseling[key] === true, `counseling keeps ${key}`);
    assert(teacher[key] === true, `teacher keeps ${key}`);
  });
  assert(SAT.normalizeStudentResultView(undefined) === 'counseling', 'default view is counseling');
  const presetCounseling = SAT.getStudentResultDisplayPreset('counseling');
  const presetTeacher = SAT.getStudentResultDisplayPreset('teacher');
  assert(presetCounseling.showClassAverage === false && presetTeacher.showClassAverage === true, 'preset by view');
  assert(SAT.getStudentResultPrintKicker('counseling').includes('학생 학습 추이'), 'counseling print kicker');
  assert(SAT.getStudentResultPrintKicker('teacher').includes('학생 성취 분석'), 'teacher print kicker');
  const legacy = SAT.normalizeStudentResultDisplay({ showExamMetrics: true });
  assert(legacy.showClassAverage === false, 'legacy display does not imply class average');
  assert(legacy.showExamMetrics === true, 'legacy exam metrics still on');
  const avgBefore = SAT.getClassAverageForExam(avgResults, avgQs);
  assert(avgBefore === 0.75, 'class average unchanged by view presets');
  const gradedSame = SAT.gradeAnswers(avgQs, avgResults[0].answers);
  assert(gradedSame.percentage === 1, 'view presets do not change scoring');

  // 38. CQ Blueprint
  const dscBp = SAT.getCqBlueprintForLevel('DSC');
  assert(dscBp.supported === true && dscBp.blueprint.id === 'dsc', 'DSC blueprint supported');
  const dscQs = SAT.buildCqBlueprintQuestions('DSC');
  assert(dscQs.length === 20, 'DSC question count 20');
  assert(dscQs.every((q, i) => q.number === i + 1), 'DSC question numbers 1–20');
  assert(dscQs.slice(0, 10).every((q) => q.majorCategory === 'Story Comprehension'), 'DSC 1–10 Story Comprehension');
  assert(dscQs.slice(10, 16).every((q) => q.majorCategory === 'Dialogue'), 'DSC 11–16 Dialogue');
  assert(dscQs.slice(16, 20).every((q) => q.majorCategory === 'Grammar'), 'DSC 17–20 Grammar');
  assert(dscQs.every((q) => q.middleCategory === ''), 'DSC middle empty');
  assert(dscQs.every((q) => q.correctAnswer === ''), 'DSC answers empty');
  assert(dscQs.every((q) => q.points === 1), 'DSC default points');

  const dsdQs = SAT.buildCqBlueprintQuestions('DSD');
  const lsaQs = SAT.buildCqBlueprintQuestions('LSA');
  assert(dsdQs.length === 20 && lsaQs.length === 20, 'DSD+ question count');
  assert(SAT.getCqBlueprintForLevel('DSD').blueprint.id === 'dsd-plus', 'DSD uses DSD+ blueprint');
  assert(SAT.getCqBlueprintForLevel('LSA').blueprint.id === 'dsd-plus', 'LSA uses DSD+ blueprint');
  assert(dsdQs.slice(0, 16).every((q) => q.majorCategory === 'Story Comprehension'), 'DSD 1–16 Story Comprehension');
  assert(dsdQs.slice(16, 20).every((q) => q.majorCategory === 'Grammar'), 'DSD 17–20 Grammar');
  assert(lsaQs.slice(0, 16).every((q) => q.majorCategory === 'Story Comprehension'), 'LSA 1–16 Story Comprehension');
  assert(lsaQs.slice(16, 20).every((q) => q.majorCategory === 'Grammar'), 'LSA 17–20 Grammar');
  assert(dsdQs.every((q) => q.middleCategory === ''), 'DSD+ middle empty');

  assert(SAT.getCqBlueprintForLevel('DSA').supported === false, 'DSA CQ unsupported');
  assert(SAT.getCqBlueprintForLevel('DSB').supported === false, 'DSB CQ unsupported');
  assert(SAT.buildCqBlueprintQuestions('DSA') === null, 'DSA does not invent questions');
  assert(SAT.getCqBlueprintForLevel('ASCENT').supported === false, 'ASCENT not guessed');

  const copyA = SAT.buildCqBlueprintQuestions('DSC');
  const copyB = SAT.buildCqBlueprintQuestions('DSC');
  assert(copyA !== copyB && copyA[0] !== copyB[0], 'blueprint copies are isolated');
  copyA[0].majorCategory = 'CHANGED';
  assert(copyB[0].majorCategory === 'Story Comprehension', 'mutating one copy does not affect another');

  const dsaStill = SAT.buildPresetAssessmentTemplate('dsa-phonics');
  assert(dsaStill.questions[0].majorCategory === 'Listen & Match', 'DSA Phonics preset unchanged');

  // 39. CQ Quick Answers
  const validPacked = SAT.parseCqQuickAnswers('21432214312413214231');
  const validPackedCheck = SAT.validateCqQuickAnswers(validPacked, 20);
  assert(validPackedCheck.valid && validPackedCheck.answers.length === 20, 'packed 20 answers valid');
  assert(validPackedCheck.answers.every((a) => ['1', '2', '3', '4'].includes(a)), 'packed answers are 1–4');

  const validSpaced = SAT.parseCqQuickAnswers('2 1 4 3 2 2 1 4 3 1 2 4 1 3 2 1 4 2 3 1');
  assert(SAT.validateCqQuickAnswers(validSpaced, 20).valid, 'spaced 20 answers valid');

  assert(!SAT.validateCqQuickAnswers(SAT.parseCqQuickAnswers('2143221431241321423'), 20).valid, '19 answers rejected');
  assert(!SAT.validateCqQuickAnswers(SAT.parseCqQuickAnswers('214322143124132142311'), 20).valid, '21 answers rejected');
  assert(!SAT.validateCqQuickAnswers(SAT.parseCqQuickAnswers('21432214312413214235'), 20).valid, '5 rejected');
  assert(!SAT.validateCqQuickAnswers(SAT.parseCqQuickAnswers('2143221431241321423A'), 20).valid, 'A rejected');
  assert(!SAT.validateCqQuickAnswers(SAT.parseCqQuickAnswers(''), 20).valid, 'empty rejected');

  const genericStill = SAT.parseBulkAnswerInput('12345', 'numeric');
  assert(genericStill.join('') === '12345', 'generic bulk parser still accepts 1–5');

  return 39;
}

function makeResultWriteClient(capture, returnedRow) {
  return {
    from(table) {
      capture.table = table;
      return {
        insert(payload) {
          capture.op = 'insert';
          capture.payload = payload;
          return {
            select() {
              return Promise.resolve({ data: [returnedRow], error: null });
            },
          };
        },
        update(payload) {
          capture.op = 'update';
          capture.payload = payload;
          return {
            eq() {
              return {
                select() {
                  return Promise.resolve({ data: capture.empty ? [] : [returnedRow], error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

function runP4bFoundationTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/cloud-repository.js',
  ]);

  const app = SAT.mapDbRowToApp({
    owner_id: 'own-1',
    term_id: 'term-1',
    teacher_comment: 'ok',
    created_at: '2026-01-01T00:00:00Z',
    assessment_version_id: 'ver-1',
    answers: { q1: '1' },
  });
  assert(app.ownerId === 'own-1', 'db owner_id -> ownerId');
  assert(app.termId === 'term-1', 'db term_id -> termId');
  assert(app.teacherComment === 'ok', 'db teacher_comment -> teacherComment');
  assert(app.createdAt === '2026-01-01T00:00:00Z', 'db created_at -> createdAt');
  assert(app.assessmentVersionId === 'ver-1', 'db assessment_version_id -> assessmentVersionId');
  assert(app.answers.q1 === '1', 'answers JSON preserved');

  const dbPatch = SAT.mapAppPatchToDb(
    { name: 'A', ownerId: 'x', termId: 't' },
    ['name', 'archived']
  );
  assert(dbPatch.name === 'A', 'allowed class name maps');
  assert(dbPatch.owner_id === undefined, 'ownerId omitted from class update patch');
  assert(dbPatch.term_id === undefined, 'termId omitted from class update patch');

  const insertPayload = SAT.pickResultInsertPayload({
    examInstanceId: 'ei-1',
    studentId: 'st-1',
    answers: { q1: '2' },
    teacherComment: 'note',
    submittedAt: '2026-01-02T00:00:00Z',
    correctCount: 99,
    earnedPoints: 99,
    totalPoints: 100,
    percentage: 1,
    id: 'should-not-write',
  });
  assert(insertPayload.exam_instance_id === 'ei-1', 'result insert exam_instance_id');
  assert(insertPayload.student_id === 'st-1', 'result insert student_id');
  assert(insertPayload.answers.q1 === '2', 'result insert answers');
  assert(insertPayload.teacher_comment === 'note', 'result insert teacher_comment');
  assert(insertPayload.submitted_at === '2026-01-02T00:00:00Z', 'result insert submitted_at');
  assert(insertPayload.correct_count === undefined, 'result insert strips correct_count');
  assert(insertPayload.earned_points === undefined, 'result insert strips earned_points');
  assert(insertPayload.total_points === undefined, 'result insert strips total_points');
  assert(insertPayload.percentage === undefined, 'result insert strips percentage');
  assert(insertPayload.id === undefined, 'result insert strips id');

  const updatePayload = SAT.pickResultUpdatePayload({
    answers: { q1: '1' },
    teacherComment: 'u',
    submittedAt: 't',
    examInstanceId: 'ei-1',
    correctCount: 1,
  });
  assert(updatePayload.answers.q1 === '1', 'result update answers');
  assert(updatePayload.exam_instance_id === undefined, 'result update forbids examInstanceId');
  assert(updatePayload.correct_count === undefined, 'result update strips scalar');

  let scalarThrew = false;
  try {
    SAT.assertNoResultScalarWrites({ answers: {}, correct_count: 1 });
  } catch (err) {
    scalarThrew = SAT.isRepositoryError(err) && err.code === 'VALIDATION';
  }
  assert(scalarThrew, 'assertNoResultScalarWrites rejects derived scalars');

  const perm = SAT.createRepositoryError({ message: 'permission denied for table', code: '42501' }, 'x');
  assert(perm.code === SAT.RepositoryErrorCodes.RLS_OR_PERMISSION, '42501 -> RLS_OR_PERMISSION');
  const missing = SAT.createRepositoryError({ message: 'no rows', code: 'PGRST116' }, 'x');
  assert(missing.code === SAT.RepositoryErrorCodes.NOT_FOUND, 'PGRST116 -> NOT_FOUND');
  const emptyMut = SAT.createRepositoryError({ code: 'MUTATION_EMPTY', message: 'none' }, 'x');
  assert(emptyMut.code === SAT.RepositoryErrorCodes.MUTATION_EMPTY, 'MUTATION_EMPTY preserved');

  assert(SAT.isAdmin({ role: 'admin', active: false }) === true, 'isAdmin is role only');
  assert(SAT.isAdmin({ role: 'teacher', active: true }) === false, 'teacher is not admin');
  assert(SAT.isActiveUser({ active: true }) === true, 'active user');
  assert(SAT.isActiveUser({ active: false }) === false, 'inactive user');
  assert(
    SAT.canEditCurriculum({ role: 'admin', active: true, can_edit_curriculum: false }) === true,
    'admin can edit curriculum regardless of flag'
  );
  assert(
    SAT.canEditCurriculum({ role: 'teacher', active: true, can_edit_curriculum: true }) === false,
    'teacher with deprecated flag still cannot edit curriculum'
  );
  assert(
    SAT.canEditCurriculum({ role: 'teacher', active: true, can_edit_curriculum: false }) === false,
    'teacher without flag cannot edit curriculum'
  );
  assert(
    SAT.canEditCurriculum({ role: 'teacher', active: false, can_edit_curriculum: true }) === false,
    'inactive cannot edit curriculum'
  );
  assert(
    SAT.canEditCurriculum({ role: 'admin', active: false, can_edit_curriculum: true }) === false,
    'inactive admin cannot edit curriculum'
  );

  const capture = {};
  const returned = {
    id: 'r1',
    exam_instance_id: 'ei-1',
    student_id: 'st-1',
    answers: { q1: '2' },
    teacher_comment: 'note',
    submitted_at: 't',
    correct_count: 1,
    earned_points: 1,
    total_points: 2,
    percentage: 0.5,
  };
  const repo = new SAT.CloudRepository(makeResultWriteClient(capture, returned));
  return repo.createResult({
    examInstanceId: 'ei-1',
    studentId: 'st-1',
    answers: { q1: '2' },
    teacherComment: 'note',
    submittedAt: 't',
    correctCount: 77,
    percentage: 1,
  }).then((row) => {
    assert(capture.op === 'insert', 'createResult uses insert');
    assert(capture.payload.correct_count === undefined, 'createResult does not send correct_count');
    assert(capture.payload.percentage === undefined, 'createResult does not send percentage');
    assert(capture.payload.exam_instance_id === 'ei-1', 'createResult sends exam_instance_id');
    assert(row.correctCount === 1, 'createResult returns DB-calculated scalars');
    return repo.updateResult('r1', {
      answers: { q1: '1' },
      teacherComment: 'u',
      correctCount: 5,
    });
  }).then((row) => {
    assert(capture.op === 'update', 'updateResult uses update');
    assert(capture.payload.correct_count === undefined, 'updateResult does not send scalars');
    assert(capture.payload.answers.q1 === '1', 'updateResult sends answers');
    assert(row.correctCount === 1, 'updateResult returns DB row');
    const emptyCapture = { empty: true };
    const emptyRepo = new SAT.CloudRepository(makeResultWriteClient(emptyCapture, returned));
    return emptyRepo.updateResult('r1', { teacherComment: 'x' }).then(
      () => {
        throw new Error('zero-row update must not succeed');
      },
      (err) => {
        assert(err.code === SAT.RepositoryErrorCodes.MUTATION_EMPTY, 'zero-row update -> MUTATION_EMPTY');
      }
    );
  });
}

function runP5aLogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/cloud-repository.js',
    'js/enrollment-view.js',
    'js/cloud-academic-store.js',
  ]);

  const enrollments = [
    { id: 'e-old', studentId: 's1', classId: 'c-old', startDate: '2025-01-01', endDate: '2025-06-30' },
    { id: 'e-open', studentId: 's1', classId: 'c-now', startDate: '2025-07-01', endDate: null },
    { id: 'e-closed-only', studentId: 's2', classId: 'c-old', startDate: '2025-01-01', endDate: '2025-06-30' },
    { id: 'e-newer-open', studentId: 's3', classId: 'c-b', startDate: '2026-02-01', endDate: null },
    { id: 'e-older-open', studentId: 's3', classId: 'c-a', startDate: '2026-01-01', endDate: '' },
  ];

  assert(SAT.deriveStudentClassId(enrollments, 's1') === 'c-now', 'open enrollment derives classId');
  assert(SAT.deriveStudentClassId(enrollments, 's2') === null, 'closed-only enrollment has null classId');
  assert(SAT.deriveStudentClassId(enrollments, 's3') === 'c-b', 'multiple open enrollments pick latest startDate');
  assert(SAT.deriveStudentClassId(enrollments, 'missing') === null, 'unknown student classId is null');

  const composed = SAT.composeStudentsWithEnrollment(
    [
      { id: 's1', name: 'A', currentClassId: 'should-not-win', classId: 'stale' },
      { id: 's2', name: 'B', currentClassId: 'c-old' },
    ],
    enrollments
  );
  assert(composed[0].classId === 'c-now', 'composed classId comes from open enrollment');
  assert(composed[0].currentClassId === undefined, 'currentClassId is not kept on UI student');
  assert(composed[1].classId === null, 'student without open enrollment has null classId');

  assert(SAT.normalizeCloudUiState('ready') === 'ready', 'normalize ready');
  assert(SAT.normalizeCloudUiState('loading') === 'loading', 'normalize loading');
  assert(SAT.normalizeCloudUiState('empty') === 'empty', 'normalize empty');
  assert(SAT.normalizeCloudUiState('nope') === 'error', 'unknown status becomes error');

  const mixedView = {
    terms: [{ id: 't1' }],
    classes: [{ id: 'c1' }, { id: 'c2' }],
    students: [{ id: 's1', active: true }, { id: 's2', active: false }],
    enrollments: [{ id: 'e1' }],
    exams: [{ id: 'local-exam' }, { id: 'local-exam-2' }],
    results: [{ id: 'local-result' }],
  };
  const counts = SAT.cloudDashboardCounts(mixedView);
  assert(counts.classes === 2, 'dashboard class count');
  assert(counts.students === 1, 'dashboard active student count');
  assert(counts.exams === 0, 'cloud dashboard never counts exams');
  assert(counts.results === 0, 'cloud dashboard never counts results');

  const fakeStorage = {
    getItem(key) {
      assert(key === SAT.STORAGE_KEY, 'legacy inspect uses STORAGE_KEY only');
      return JSON.stringify({ classes: [{ id: 'x' }], students: [], exams: [], results: [] });
    },
  };
  const legacy = SAT.inspectLegacyLocalAcademicData(fakeStorage);
  assert(legacy.present === true, 'legacy local academic data detected');
  assert(legacy.counts.classes === 1, 'legacy class count');

  const holder = {};
  let ran = 0;
  const p1 = SAT.withMutationGuard(holder, 'k', async () => {
    ran += 1;
    await Promise.resolve();
    return 'ok';
  });
  const p2 = SAT.withMutationGuard(holder, 'k', async () => {
    ran += 1;
    return 'second';
  });
  return Promise.all([p1, p2]).then(([a, b]) => {
    assert(a.skipped === false && a.value === 'ok', 'first mutation runs');
    assert(b.skipped === true, 'duplicate mutation is skipped');
    assert(ran === 1, 'guarded fn ran once');

    const fakeAuth = { getState: () => ({ user: { id: 'u1' }, profile: { role: 'admin', active: true } }) };
    const fakeRepo = {
      students: [],
      enrollments: [],
      deleted: [],
      async createStudent(data) {
        const row = { id: 'stu-1', ...data };
        this.students.push(row);
        return row;
      },
      async createEnrollment() {
        throw SAT.createRepositoryError({ code: 'VALIDATION', message: 'enroll fail' }, 'enrollments.create');
      },
      async deleteStudent(id) {
        this.deleted.push(id);
        this.students = this.students.filter((s) => s.id !== id);
      },
      async listTerms() { return []; },
      async listClasses() { return []; },
      async listEnrollments() { return this.enrollments; },
      async listStudents() { return this.students; },
    };
    const store = new SAT.CloudAcademicStore(fakeRepo, fakeAuth);
    return store.createStudentInClass({ name: 'Pat', englishName: 'Test', classId: 'cls-1' }).then(
      () => {
        throw new Error('partial enrollment failure must not look successful');
      },
      (err) => {
        assert(SAT.isRepositoryError(err), 'partial failure is RepositoryError');
        assert(err.cleaned === true, 'student cleaned after enrollment failure');
        assert(fakeRepo.students.length === 0, 'cleaned student is not left in repo');
        assert(fakeRepo.deleted[0] === 'stu-1', 'cleanup deleteStudent called');
      }
    ).then(() => {
      const uncleanRepo = {
        students: [],
        async createStudent(data) {
          const row = { id: 'stu-2', ...data };
          this.students.push(row);
          return row;
        },
        async createEnrollment() {
          throw SAT.createRepositoryError({ code: 'RLS_OR_PERMISSION', message: 'nope' }, 'enrollments.create');
        },
        async deleteStudent() {
          throw SAT.createRepositoryError({ code: 'RLS_OR_PERMISSION', message: 'cannot delete' }, 'students.delete');
        },
        async listTerms() { return []; },
        async listClasses() { return []; },
        async listEnrollments() { return []; },
        async listStudents() { return this.students; },
      };
      const uncleanStore = new SAT.CloudAcademicStore(uncleanRepo, fakeAuth);
      return uncleanStore.createStudentInClass({ name: 'Left', classId: 'cls-1' }).then(
        () => {
          throw new Error('unclean partial failure must throw');
        },
        (err) => {
          assert(err.partial === true, 'cleanup failure marked partial');
          assert(err.cleaned === false, 'student remains when cleanup fails');
          assert(uncleanRepo.students.length === 1, 'orphan student remains in repo');
        }
      );
    }).then(() => {
      store.terms = [{ id: 't' }];
      store.classes = [{ id: 'c' }];
      store.studentsRaw = [{ id: 's', name: 'Keep' }];
      store.enrollments = [{ id: 'e', studentId: 's', classId: 'c', endDate: null }];
      store.status = SAT.CLOUD_UI_STATES.READY;
      store.clear();
      const emptied = store.loadAll();
      assert(emptied.students.length === 0, 'logout/clear drops in-memory students');
      assert(emptied.classes.length === 0, 'logout/clear drops in-memory classes');
      assert(emptied.exams.length === 0, 'cloud view never carries exams');
      assert(emptied.results.length === 0, 'cloud view never carries results');
    });
  });
}

async function runP5bLogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/cloud-repository.js',
    'js/enrollment-view.js',
    'js/cloud-academic-store.js',
    'js/assessment-view.js',
    'js/cloud-assessment-store.js',
  ]);

  const dsc = SAT.cloudQuestionsFromCqBlueprint('DSC');
  assert(dsc && dsc.length === 20, 'DSC blueprint 20 questions');
  assert(dsc.slice(0, 10).every((q) => q.majorCategory === 'Story Comprehension'), 'DSC 1-10 Story');
  assert(dsc.slice(10, 16).every((q) => q.majorCategory === 'Dialogue'), 'DSC 11-16 Dialogue');
  assert(dsc.slice(16, 20).every((q) => q.majorCategory === 'Grammar'), 'DSC 17-20 Grammar');
  assert(dsc.every((q) => q.gradingType === 'choice'), 'CQ blueprint questions are choice');

  ['DSD', 'LSA', 'LSB', 'LSC', 'LSD', 'MSA', 'MSB'].forEach((lv) => {
    const qs = SAT.cloudQuestionsFromCqBlueprint(lv);
    assert(qs.length === 20, `${lv} 20Q`);
    assert(qs.slice(0, 16).every((q) => q.majorCategory === 'Story Comprehension'), `${lv} 1-16 Story`);
    assert(qs.slice(16, 20).every((q) => q.majorCategory === 'Grammar'), `${lv} 17-20 Grammar`);
  });

  assert(SAT.cloudQuestionsFromCqBlueprint('DSA') === null, 'DSA CQ not guessed');
  assert(SAT.cloudQuestionsFromCqBlueprint('DSB') === null, 'DSB CQ not guessed');
  assert(SAT.getCqBlueprintForLevel('DSA').supported === false, 'DSA unsupported');

  assert(SAT.MANUAL_BINARY_CORRECT === '1', 'manual_binary correct is 1');
  assert(SAT.MANUAL_BINARY_INCORRECT === '2', 'manual_binary incorrect is 2');
  assert(SAT.manualBinaryUiLabel('1') === '정답', 'label 정답');
  assert(SAT.manualBinaryUiLabel('2') === '오답', 'label 오답');
  const mb = SAT.normalizeCloudQuestion({ number: 1, gradingType: 'manual_binary', correctAnswer: '2' }, 1);
  assert(mb.correctAnswer === '1', 'authoring manual_binary always stores 1');

  const published = { id: 'v1', status: 'published' };
  assert(SAT.canEditAssessmentVersion(published) === false, 'published edit disabled');
  assert(SAT.canEditAssessmentVersion({ status: 'draft' }) === true, 'draft editable');

  assert(SAT.nextAssessmentVersionNumber([]) === 1, 'first version is 1');
  assert(SAT.nextAssessmentVersionNumber([{ versionNumber: 2 }, { versionNumber: 1 }]) === 3, 'next after max');

  const publishedQs = [{ id: 'pq1', number: 1, gradingType: 'choice', correctAnswer: '3', points: 1, majorCategory: 'Grammar' }];
  const copied = SAT.copyQuestionsForNewDraft(publishedQs);
  assert(copied[0].id === undefined, 'copy has no id');
  assert(copied[0].correctAnswer === '3', 'copy keeps answer');
  assert(publishedQs[0].id === 'pq1', 'source published row not mutated');

  const mismatch = SAT.canAssignVersionToClass(
    { level: 'DSC' },
    { status: 'published' },
    { level: 'LSA' }
  );
  assert(mismatch.ok === false, 'level mismatch rejected');
  const match = SAT.canAssignVersionToClass(
    { level: 'DSC' },
    { status: 'published' },
    { level: 'DSC' }
  );
  assert(match.ok === true, 'matching level allowed');
  const draftAssign = SAT.canAssignVersionToClass(
    { level: 'DSC' },
    { status: 'draft' },
    { level: 'DSC' }
  );
  assert(draftAssign.ok === false, 'draft version not assignable');

  const dups = SAT.findDuplicateAssignments(
    [{ classId: 'c1', assessmentVersionId: 'v1' }],
    'c1',
    'v1'
  );
  assert(dups.length === 1, 'duplicate assignment is warning data, not hard block');
  assert(SAT.findDuplicateAssignments([], 'c1', 'v1').length === 0, 'first assign not duplicate');

  const patch = SAT.examInstanceWritablePatch({
    administeredDate: '2026-09-19',
    classId: 'nope',
    assessmentVersionId: 'nope',
    createdBy: 'nope',
  });
  assert(patch.administeredDate === '2026-09-19', 'date writable');
  assert(patch.classId === undefined, 'classId not in writable patch');
  assert(patch.assessmentVersionId === undefined, 'version not in writable patch');

  assert(typeof SAT.CloudAssessmentStore.prototype.createResult !== 'function', 'store has no createResult');
  assert(typeof SAT.CloudAssessmentStore.prototype.assignToClass === 'function', 'assign exists');
  const createExamSrc = String(SAT.CloudRepository.prototype.createExamInstance);
  assert(
    /insert\(payload\)\s*\.select\(\)/.test(createExamSrc),
    'createExamInstance keeps insert().select() RETURNING'
  );

  const cqCheck = SAT.validateCqPublish('DSC', dsc.map((q, i) => ({ ...q, correctAnswer: String((i % 4) + 1) })));
  assert(cqCheck.ok === true, 'complete DSC CQ validates');
  const missingKey = SAT.validateCqPublish('DSC', dsc);
  assert(missingKey.ok === false, 'empty keys fail CQ publish validation');
  const short = SAT.validateCqPublish('DSC', dsc.slice(0, 10));
  assert(short.ok === false, 'not 20 questions fails');

  assert(SAT.isStandardCqAssessment({ assessmentType: 'CQ' }) === true, 'CQ is Standard CQ');
  assert(SAT.isStandardCqAssessment({ assessmentType: 'Generic' }) === false, 'Generic is not Standard CQ');
  ['1', '2', '3', '4'].forEach((ans) => {
    assert(SAT.isStandardCqChoiceAnswer(ans) === true, `CQ answer ${ans} allowed`);
  });
  ['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D'].forEach((ans) => {
    assert(SAT.isStandardCqChoiceAnswer(ans) === false, `CQ answer ${ans} blocked`);
  });
  const cqLetters = SAT.validateCqPublish('DSC', dsc.map((q) => ({ ...q, correctAnswer: 'a' })));
  assert(cqLetters.ok === false, 'CQ publish blocks a/b/c/d');
  assert(cqLetters.errors.some((e) => e.includes('1–4')), 'CQ letter error mentions 1-4');
  const draftLetter = SAT.validateStandardCqChoiceAnswers(
    [{ number: 1, gradingType: 'choice', correctAnswer: 'b' }],
    { requireFilled: false }
  );
  assert(draftLetter.ok === false, 'CQ draft save blocks b');
  const draftEmpty = SAT.validateStandardCqChoiceAnswers(
    [{ number: 1, gradingType: 'choice', correctAnswer: '' }],
    { requireFilled: false }
  );
  assert(draftEmpty.ok === true, 'CQ draft allows empty until publish');
  const draftOk = SAT.validateStandardCqChoiceAnswers(
    [{ number: 1, gradingType: 'choice', correctAnswer: '4' }],
    { requireFilled: false }
  );
  assert(draftOk.ok === true, 'CQ draft allows 1-4');
  const genericKept = SAT.normalizeCloudQuestion({ number: 1, gradingType: 'choice', correctAnswer: 'B' }, 1);
  assert(genericKept.correctAnswer === 'B', 'generic choice keeps free string B');
  assert(SAT.answersMatch('1', 'a', { ignoreCase: true }) === false, 'no global a→1 mapping');
  const copiedLetters = SAT.copyQuestionsForNewDraft([{ id: 'pq', number: 1, gradingType: 'choice', correctAnswer: 'a' }]);
  assert(copiedLetters[0].correctAnswer === 'a', 'copy does not rewrite published a/b/c/d');
  assert(SAT.hasNonCanonicalCqChoiceAnswers([{ gradingType: 'choice', correctAnswer: 'a' }]) === true, 'legacy letter answers detected');
  assert(SAT.hasNonCanonicalCqChoiceAnswers([{ gradingType: 'choice', correctAnswer: '1' }]) === false, 'canonical 1-4 not flagged');

  const sqlHelpers = readFileSync(join(root, 'supabase/migrations/003_domain_helpers.sql'), 'utf8');
  const matchFn = sqlHelpers.slice(
    sqlHelpers.indexOf('create or replace function public.sat_answers_match'),
    sqlHelpers.indexOf('create or replace function public.sat_guard_profile_row')
  );
  assert(!/translate\(|replace\(|'a'\s*,\s*'1'|a\s*→\s*1/i.test(matchFn), 'sat_answers_match has no global a→1 mapping');

  const letterStore = new SAT.CloudAssessmentStore({
    async updateAssessmentQuestion() { throw new Error('must not write letter answers'); },
    async createAssessmentQuestion() { throw new Error('must not write letter answers'); },
  }, { getState: () => ({ user: { id: 'u1' }, profile: { role: 'admin', active: true } }) });
  letterStore.assessments = [{ id: 'a1', assessmentType: 'CQ' }];
  letterStore.versions = [{ id: 'v1', assessmentId: 'a1', status: 'draft' }];
  let blocked = false;
  try {
    await letterStore.saveDraftQuestions('v1', [{ id: 'q1', number: 1, gradingType: 'choice', correctAnswer: 'a' }]);
  } catch (err) {
    blocked = /1–4/.test(err.message || '');
  }
  assert(blocked, 'CQ store save rejects a');

  const genericWrites = [];
  const genericStore = new SAT.CloudAssessmentStore({
    async updateAssessmentQuestion(id, q) { genericWrites.push(q); return q; },
    async createAssessmentQuestion(q) { genericWrites.push(q); return q; },
  }, { getState: () => ({ user: { id: 'u1' }, profile: { role: 'admin', active: true } }) });
  genericStore.assessments = [{ id: 'g1', assessmentType: 'Generic' }];
  genericStore.versions = [{ id: 'gv1', assessmentId: 'g1', status: 'draft', choiceCount: 4 }];
  await genericStore.saveDraftQuestions('gv1', [{ id: 'gq1', number: 1, gradingType: 'choice', correctAnswer: '4' }]);
  assert(genericWrites[0].correctAnswer === '4', 'Generic 4-choice numeric answer is saved');
  let genericBlocked = false;
  try {
    await genericStore.saveDraftQuestions('gv1', [{ id: 'gq1', number: 1, gradingType: 'choice', correctAnswer: 'B' }]);
  } catch (err) {
    genericBlocked = /1–4/.test(err.message || '');
  }
  assert(genericBlocked, 'Generic 4-choice rejects letter B');

  const academic = new SAT.CloudAcademicStore({
    async listTerms() { return []; },
    async listClasses() { return []; },
    async listEnrollments() { return []; },
    async listStudents() { return []; },
  }, { getState: () => ({ user: { id: 'u1' }, profile: { role: 'admin', active: true } }) });
  academic.exams = [{ id: 'legacy-should-not-appear' }];
  const view = academic.loadAll();
  assert(view.exams.length === 0, 'academic loadAll exams stay empty');
  const counts = SAT.cloudDashboardCounts({
    ...view,
    exams: [{ id: 'local-exam' }],
    results: [{ id: 'local-result' }],
  });
  assert(counts.exams === 0 && counts.results === 0, 'dashboard ignores local exams/results');

  const aStore = new SAT.CloudAssessmentStore({
    async listAssessments() { return [{ id: 'a1', title: 'keep' }]; },
    async listAllAssessmentVersions() { return [{ id: 'v1', assessmentId: 'a1', status: 'published', versionNumber: 1 }]; },
    async listExamInstances() { return [{ id: 'ei1' }]; },
  }, { getState: () => ({ user: { id: 'u1' }, profile: { role: 'admin', active: true } }) });
  aStore.assessments = [{ id: 'a1' }];
  aStore.versions = [{ id: 'v1' }];
  aStore.examInstances = [{ id: 'ei1' }];
  aStore.questionsByVersionId.v1 = [{ id: 'q1' }];
  aStore.clear();
  assert(aStore.assessments.length === 0, 'logout clears assessments');
  assert(aStore.examInstances.length === 0, 'logout clears exam instances');
  assert(Object.keys(aStore.questionsByVersionId).length === 0, 'logout clears questions');

  const holder = {};
  let ran = 0;
  const p1 = SAT.withMutationGuard(holder, 'p5b', async () => {
    ran += 1;
    await Promise.resolve();
    return 'ok';
  });
  const p2 = SAT.withMutationGuard(holder, 'p5b', async () => {
    ran += 1;
    return 'second';
  });
  const [a, b] = await Promise.all([p1, p2]);
  assert(a.skipped === false, 'first mutation runs');
  assert(b.skipped === true, 'duplicate mutation skipped');
  assert(ran === 1, 'guard ran once');
}

function runP5c1LogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/cloud-repository.js',
    'js/enrollment-view.js',
    'js/p8-ux-contract.js',
    'js/cloud-academic-store.js',
    'js/assessment-view.js',
    'js/cloud-assessment-store.js',
    'js/result-view.js',
    'js/cloud-result-store.js',
  ]);

  const q1 = { id: '11111111-1111-1111-1111-111111111111', number: 1, gradingType: 'choice', correctAnswer: '1', points: 1 };
  const q2 = { id: '22222222-2222-2222-2222-222222222222', number: 2, gradingType: 'manual_binary', correctAnswer: '1', points: 1 };
  const answers = SAT.buildCloudResultAnswers([q1, q2], {
    [q1.id]: '1',
    [q2.id]: SAT.MANUAL_BINARY_INCORRECT,
    2: 'should-not-use-number-key',
  });
  assert(answers[q1.id] === '1', 'answers keep question UUID key');
  assert(answers[q2.id] === '2', 'manual_binary 오답 stores 2');
  assert(answers[2] === undefined, 'question number is not an answers key');
  assert(SAT.cloudAnswerValue({ 1: '3', [q1.id]: '4' }, q1) === '4', 'cloudAnswerValue ignores number keys');

  const insertPayload = SAT.pickResultInsertPayload({
    examInstanceId: 'ei',
    studentId: 'st',
    answers,
    teacherComment: 'P5C_TEST_COMMENT',
    submittedAt: 't',
    correctCount: 9,
    earnedPoints: 9,
    totalPoints: 10,
    percentage: 0.9,
  });
  assert(insertPayload.correct_count === undefined, 'insert omits correct_count');
  assert(insertPayload.earned_points === undefined, 'insert omits earned_points');
  assert(insertPayload.total_points === undefined, 'insert omits total_points');
  assert(insertPayload.percentage === undefined, 'insert omits percentage');

  const updatePayload = SAT.pickResultUpdatePayload({
    answers,
    teacherComment: 'u',
    submittedAt: 't2',
    examInstanceId: 'ei',
    studentId: 'st',
    correctCount: 1,
    id: 'r1',
  });
  assert(updatePayload.exam_instance_id === undefined, 'update omits identity');
  assert(updatePayload.student_id === undefined, 'update omits studentId');
  assert(updatePayload.correct_count === undefined, 'update omits scalars');
  assert(updatePayload.teacher_comment === 'u', 'update keeps teacherComment');

  const createSrc = String(SAT.CloudRepository.prototype.createResult);
  const updateSrc = String(SAT.CloudRepository.prototype.updateResult);
  assert(/insert\(payload\)\s*\.select\(\)/.test(createSrc), 'createResult keeps insert().select()');
  assert(/update\(payload\)[\s\S]*\.select\(\)/.test(updateSrc), 'updateResult keeps update().select()');

  assert(SAT.manualBinaryUiLabel('1') === '정답', 'manual_binary UI 정답');
  assert(SAT.manualBinaryUiLabel('2') === '오답', 'manual_binary UI 오답');
  assert(SAT.displayCloudAnswer(q2, { [q2.id]: '1' }) === '정답', 'grid shows 정답 not 1');
  assert(SAT.displayCloudAnswer(q2, { [q2.id]: '2' }) === '오답', 'grid shows 오답 not 2');

  const mixedGrade = SAT.previewCloudGrade([q1, q2], { [q1.id]: '1', [q2.id]: '2' });
  assert(mixedGrade.correctCount === 1, 'mixed exam grades choice and manual_binary');
  assert(mixedGrade.percentage === 0.5, 'mixed exam percentage 0.5');

  const generic = SAT.buildCloudResultAnswers([q1], { [q1.id]: 'B' });
  assert(generic[q1.id] === 'B', 'choice generic letter is not forced to 1-4');

  const cqResult = SAT.buildCloudResultAnswers(
    [{ id: q1.id, number: 1, gradingType: 'choice' }],
    { [q1.id]: '3' }
  );
  assert(cqResult[q1.id] === '3', 'CQ result entry stores 1-4');
  const matchSame = SAT.previewCloudGrade(
    [{ ...q1, correctAnswer: '1' }],
    { [q1.id]: '1' }
  );
  assert(matchSame.correctCount === 1, 'matching 1 vs 1 is correct');
  const mismatchLetter = SAT.previewCloudGrade(
    [{ ...q1, correctAnswer: 'a' }],
    { [q1.id]: '1' }
  );
  assert(mismatchLetter.correctCount === 0, '1 vs a stays incorrect; no silent mapping');
  assert(SAT.cloudChoiceQuickOptions('CQ').join(',') === '1,2,3,4', 'CQ result keypad is 1-4');
  assert(SAT.cloudChoiceQuickOptions('Generic', { choiceCount: 5 }).join(',') === '1,2,3,4,5', '5-choice keypad is 1-5');

  assert(typeof SAT.allQuestionsChoice === 'function', 'allQuestionsChoice is a function');
  assert(SAT.allQuestionsChoice([{ gradingType: 'choice' }, { gradingType: 'choice' }]) === true, 'all-choice exam is true');
  assert(SAT.allQuestionsChoice([q1, q2]) === false, 'mixed choice/manual_binary is false');
  assert(SAT.allQuestionsChoice([{ gradingType: 'manual_binary' }]) === false, 'manual_binary only is false');
  assert(SAT.allQuestionsChoice([]) === false, 'empty questions is false so bulk UI stays hidden');
  assert(SAT.allQuestionsChoice(null) === false, 'null questions is false');
  SAT.allQuestionsChoice([q1, q2]);

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  const openStart = appSrc.indexOf('async openAnswerEntry(');
  const openEnd = appSrc.indexOf('\n  hydrateAnswerDraftFromExisting(', openStart);
  const openFn = appSrc.slice(openStart, openEnd);
  assert(openFn.includes('ensureAnswerEntryLoaded'), 'openAnswerEntry loads answer context');
  assert(!openFn.includes("navigate('answer-entry')"), 'openAnswerEntry does not also navigate (would double-render/toast)');
  assert(appSrc.includes('this._answerEntryLoadPromise'), 'answer-entry load is coalesced');

  const instance = { id: 'ei', classId: 'c1', administeredDate: '2026-03-10' };
  const students = [
    { id: 's1', name: 'In', active: true },
    { id: 's2', name: 'Inactive', active: false },
    { id: 's3', name: 'Out', active: true },
  ];
  const enrollments = [
    { studentId: 's1', classId: 'c1', startDate: '2026-03-01', endDate: '2026-03-31' },
    { studentId: 's2', classId: 'c1', startDate: '2026-03-01', endDate: null },
    { studentId: 's3', classId: 'c1', startDate: '2026-04-01', endDate: null },
  ];
  const eligible = SAT.eligibleStudentsForExamInstance(students, enrollments, instance);
  const ids = eligible.map((s) => s.id).sort();
  assert(ids.join(',') === 's1,s2', 'eligibility includes inactive and open enrollment, excludes later start');
  assert(SAT.isEnrollmentActiveOnDate(enrollments[0], '2026-03-10') === true, 'inclusive mid range');
  assert(SAT.isEnrollmentActiveOnDate(enrollments[0], '2026-03-01') === true, 'inclusive start');
  assert(SAT.isEnrollmentActiveOnDate(enrollments[0], '2026-03-31') === true, 'inclusive end');
  assert(SAT.isEnrollmentActiveOnDate(enrollments[1], '2026-03-10') === true, 'open enrollment null end');

  const counts = SAT.resultCompletionCounts(eligible, [{ studentId: 's1', examInstanceId: 'ei' }]);
  assert(counts.eligibleCount === 2, 'two eligible');
  assert(counts.completedCount === 1, 'one completed');
  assert(counts.missingCount === 1, 'one missing is not scored as zero');
  assert(SAT.formatCloudScoreLine(null) === SAT.RESULT_MISSING_LABEL, 'missing result is 미입력');
  assert(SAT.formatDbPercentage(0.95) === '95%', 'DB 0.95 displays 95%');

  const sql = readFileSync(join(root, 'supabase/migrations/003_domain_helpers.sql'), 'utf8');
  const selectFn = sql.slice(sql.indexOf('create or replace function public.sat_can_select_result'), sql.indexOf('create or replace function public.sat_normalize_answer'));
  assert(selectFn.includes('p_exam_instance_id uuid'), 'sat_can_select_result uses current-row args');
  assert(selectFn.includes('p_student_id uuid'), 'sat_can_select_result takes student_id');
  assert(!/from public\.results/i.test(selectFn), 'sat_can_select_result does not self-query results');
  assert(selectFn.includes('owns_student(p_student_id)'), 'historical student ownership preserved');
  assert(selectFn.includes('from public.exam_instances'), 'class owner path uses exam_instances not results');

  const policySql = readFileSync(join(root, 'supabase/migrations/004_rls_policies.sql'), 'utf8');
  assert(policySql.includes('sat_can_select_result(exam_instance_id, student_id)'), 'SELECT policy uses current-row columns');

  const normalizeParity = SAT.normalizeAnswer(' 01 ', { ignoreCase: true }) === '1'
    && SAT.answersMatch('', '', { ignoreCase: true }) === false
    && SAT.answersMatch('a', 'A', { ignoreCase: true }) === true;
  assert(normalizeParity, 'client normalize matches DB trim/upper/numeric/blank rules');

  const academic = new SAT.CloudAcademicStore({
    async listTerms() { return []; },
    async listClasses() { return []; },
    async listEnrollments() { return []; },
    async listStudents() { return []; },
  }, { getState: () => ({ user: { id: 'u1' }, profile: { role: 'admin', active: true } }) });
  academic.results = [{ id: 'local-should-not-appear' }];
  const view = academic.loadAll();
  assert(view.results.length === 0, 'academic loadAll never mixes local results');
  assert(view.exams.length === 0, 'academic loadAll never mixes local exams');

  const capture = {};
  const returned = {
    id: 'r-new',
    exam_instance_id: 'ei',
    student_id: 's1',
    answers: { [q1.id]: '1' },
    teacher_comment: 'P5C_TEST_COMMENT',
    submitted_at: 'now',
    correct_count: 1,
    earned_points: 1,
    total_points: 2,
    percentage: 0.5,
  };
  const fakeRepo = {
    results: [],
    async listResults() { return this.results; },
    async createResult(data) {
      capture.op = 'create';
      capture.payload = SAT.pickResultInsertPayload(data);
      const row = SAT.mapDbRowToApp(returned);
      this.results.push(row);
      return row;
    },
    async updateResult(id, patch) {
      capture.op = 'update';
      capture.payload = SAT.pickResultUpdatePayload(patch);
      const row = SAT.mapDbRowToApp({ ...returned, id, teacher_comment: patch.teacherComment, answers: patch.answers });
      this.results = [row];
      return row;
    },
  };
  const store = new SAT.CloudResultStore(fakeRepo, { getState: () => ({ user: { id: 'u1' } }) });
  return store.saveStudentAnswers({
    examInstanceId: 'ei',
    studentId: 's1',
    answers: { [q1.id]: '1' },
    teacherComment: 'P5C_TEST_COMMENT',
    questions: [q1, q2],
  }).then((row) => {
    assert(capture.op === 'create', 'first save creates');
    assert(capture.payload.correct_count === undefined, 'store create omits scalars');
    assert(row.teacherComment === 'P5C_TEST_COMMENT', 'teacherComment round-trip');
    assert(row.submittedAt, 'submittedAt set on save');
    assert(row.percentage === 0.5, 'DB returned percentage is authoritative');
    return store.saveStudentAnswers({
      examInstanceId: 'ei',
      studentId: 's1',
      answers: { [q1.id]: '2' },
      teacherComment: 'updated',
      questions: [q1, q2],
    });
  }).then((row) => {
    assert(capture.op === 'update', 'second save updates existing');
    assert(store.results.length === 1, 'duplicate result rows are not kept');
    assert(row.teacherComment === 'updated', 'teacherComment updated');
    store.clear();
    assert(store.results.length === 0, 'logout clears result store');
  }).then(() => {
    const holder = {};
    let ran = 0;
    const p1 = SAT.withMutationGuard(holder, 'p5c1', async () => {
      ran += 1;
      await Promise.resolve();
    });
    const p2 = SAT.withMutationGuard(holder, 'p5c1', async () => {
      ran += 1;
    });
    return Promise.all([p1, p2]).then(([a, b]) => {
      assert(a.skipped === false, 'first result mutation runs');
      assert(b.skipped === true, 'duplicate result mutation skipped');
      assert(ran === 1, 'result guard ran once');
    });
  });
}

async function runP5c2LogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/cloud-repository.js',
    'js/enrollment-view.js',
    'js/p8-ux-contract.js',
    'js/cloud-academic-store.js',
    'js/assessment-view.js',
    'js/cloud-assessment-store.js',
    'js/result-view.js',
    'js/cloud-result-store.js',
    'js/cloud-analytics.js',
    'js/chart-manager.js',
  ]);

  const qGrammar = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    number: 1,
    gradingType: 'choice',
    correctAnswer: '1',
    points: 1,
    majorCategory: 'Grammar',
    middleCategory: 'Tense',
    assessmentVersionId: 'ver-1',
  };
  const qStory = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    number: 2,
    gradingType: 'choice',
    correctAnswer: '2',
    points: 9,
    majorCategory: 'Story Comprehension',
    middleCategory: '',
    assessmentVersionId: 'ver-1',
  };
  const qManual = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    number: 3,
    gradingType: 'manual_binary',
    correctAnswer: '1',
    points: 2,
    majorCategory: 'Grammar',
    middleCategory: 'Tense',
    assessmentVersionId: 'ver-1',
  };
  const qGeneric = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    number: 1,
    gradingType: 'choice',
    correctAnswer: 'B',
    points: 1,
    majorCategory: 'Dialogue',
    middleCategory: 'Situation',
    assessmentVersionId: 'ver-2',
  };
  const qV2Only = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
    number: 1,
    gradingType: 'choice',
    correctAnswer: '3',
    points: 1,
    majorCategory: 'Dialogue',
    middleCategory: 'Intention',
    assessmentVersionId: 'ver-2',
  };

  assert(SAT.formatCloudAnalyticsPercent(0.75) === '75.0%', 'DB 0.75 displays 75.0%');
  assert(SAT.formatCloudAnalyticsPercent(0.76666) === '76.7%', 'display rounding is one decimal');
  assert(SAT.formatCloudAnalyticsPercent(0) === '0.0%', 'actual 0% Result displays 0.0%');
  assert(SAT.formatCloudAnalyticsPercent(null) === '데이터 없음', 'null ratio is no data not 0');
  assert(SAT.cloudPointsRatio(0, 0) === null, 'no category questions is null not 0');

  const missingQ = SAT.cloudQuestionIsCorrect(qGrammar, { [qGrammar.id]: '' });
  assert(missingQ === false, 'blank answer in existing Result is incorrect');
  assert(SAT.cloudQuestionIsCorrect(qManual, { [qManual.id]: '1' }) === true, 'manual_binary 1 is correct');
  assert(SAT.cloudQuestionIsCorrect(qManual, { [qManual.id]: '2' }) === false, 'manual_binary 2 is incorrect');
  assert(SAT.cloudQuestionIsCorrect(qGeneric, { [qGeneric.id]: 'b' }) === true, 'generic choice ignoreCase parity');
  assert(SAT.cloudQuestionIsCorrect(qGeneric, { [qGeneric.id]: '2' }) === false, 'generic B is not mapped to 2');

  const examAStats = SAT.computeCloudResultCategoryStats(
    [qGrammar, qStory],
    { [qGrammar.id]: '1', [qStory.id]: '9' }
  );
  assert(examAStats.major.Grammar.earnedPoints === 1, 'exam A grammar earned 1');
  assert(examAStats.major.Grammar.totalPoints === 1, 'exam A grammar total 1');
  assert(examAStats.major['Story Comprehension'].earnedPoints === 0, 'wrong story is 0 earned');
  assert(examAStats.middle['Grammar::Tense'], 'named middle exists');
  assert(examAStats.middle['Story Comprehension::'] === undefined, 'empty middle is not a fake category');
  assert(!Object.keys(examAStats.middle).some((k) => k.endsWith('::')), 'no empty-middle keys');

  const examBStats = SAT.computeCloudResultCategoryStats(
    [{ ...qGrammar, points: 9, id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' }],
    { 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1': '2' }
  );
  const merged = SAT.mergeCloudCategoryStats([examAStats, examBStats]);
  assert(merged.major.Grammar.earnedPoints === 1, 'weighted earned 1');
  assert(merged.major.Grammar.totalPoints === 10, 'weighted total 10');
  assert(merged.major.Grammar.percentage === 0.1, 'aggregate is 10% not 50% mean');

  const fakeLegacy = SAT.computeCloudResultCategoryStats(
    [qGrammar],
    { [qGrammar.id]: '1', categoryStats: { major: { Fake: { total: 99 } } } }
  );
  assert(fakeLegacy.major.Fake === undefined, 'legacy categoryStats object is not a question');
  assert(fakeLegacy.major.Grammar.percentage === 1, 'cloud stats come from answers + questions');

  const terms = [{ id: 'term-old', name: '2026-1' }, { id: 'term-new', name: '2026-2' }];
  const classes = [
    { id: 'class-a', name: 'DSC A', termId: 'term-old', level: 'DSC' },
    { id: 'class-b', name: 'LSA B', termId: 'term-new', level: 'LSA' },
  ];
  const assessments = [{ id: 'asmt-1', title: 'DSC CQ Lesson 1-2', assessmentType: 'CQ', level: 'DSC' }];
  const versions = [
    { id: 'ver-1', assessmentId: 'asmt-1', versionNumber: 1, status: 'published' },
    { id: 'ver-2', assessmentId: 'asmt-1', versionNumber: 2, status: 'published' },
  ];
  const examInstances = [
    { id: 'ei-1', classId: 'class-a', assessmentVersionId: 'ver-1', administeredDate: '2026-03-10' },
    { id: 'ei-retest', classId: 'class-a', assessmentVersionId: 'ver-1', administeredDate: '2026-03-20' },
    { id: 'ei-v2', classId: 'class-a', assessmentVersionId: 'ver-2', administeredDate: '2026-04-01' },
    { id: 'ei-missing', classId: 'class-a', assessmentVersionId: 'ver-1', administeredDate: '2026-04-10' },
  ];
  const questionsByVersionId = {
    'ver-1': [qGrammar, qStory, qManual],
    'ver-2': [qV2Only],
  };
  const studentResults = [
    {
      id: 'r-1',
      studentId: 'stu-1',
      examInstanceId: 'ei-1',
      answers: { [qGrammar.id]: '1', [qStory.id]: '2', [qManual.id]: '1' },
      correctCount: 3,
      earnedPoints: 12,
      totalPoints: 12,
      percentage: 1,
      teacherComment: '첫 시험',
      categoryStats: { major: { ShouldIgnore: { total: 1 } } },
    },
    {
      id: 'r-retest',
      studentId: 'stu-1',
      examInstanceId: 'ei-retest',
      answers: { [qGrammar.id]: '1', [qStory.id]: '9' },
      correctCount: 1,
      earnedPoints: 1,
      totalPoints: 12,
      percentage: 0,
      teacherComment: '',
    },
    {
      id: 'r-v2',
      studentId: 'stu-1',
      examInstanceId: 'ei-v2',
      answers: { [qV2Only.id]: '3' },
      correctCount: 1,
      earnedPoints: 1,
      totalPoints: 1,
      percentage: 0.8,
      teacherComment: 'v2',
    },
  ];

  const history = SAT.buildCloudStudentHistoryRows({
    results: studentResults,
    examInstances,
    versions,
    assessments,
    classes,
    terms,
    questionsByVersionId,
  });
  assert(history.length === 3, 'only existing Results become history rows');
  assert(!history.some((row) => row.examInstanceId === 'ei-missing'), 'missing Result is not a 0-point row');
  const datesAsc = SAT.sortCloudHistoryByDateAsc(history).map((row) => row.administeredDate);
  assert(datesAsc.join(',') === '2026-03-10,2026-03-20,2026-04-01', 'chart sort is administeredDate asc');
  const datesDesc = SAT.sortCloudHistoryByDateDesc(history).map((row) => row.administeredDate);
  assert(datesDesc[0] === '2026-04-01', 'history list is date desc');
  assert(history.filter((row) => row.assessmentVersionId === 'ver-1').length === 2, 'same version retest is not deduped');
  const oldRow = history.find((row) => row.examInstanceId === 'ei-1');
  assert(oldRow.className === 'DSC A' && oldRow.termName === '2026-1' && oldRow.level === 'DSC', 'historical class/term/level kept');
  assert(oldRow.versionNumber === 1, 'version label available');
  assert(oldRow.percentage === 1, 'overall score uses Result scalar');
  assert(oldRow.categoryStats.major.ShouldIgnore === undefined, 'stored categoryStats is not used');
  const v2Row = history.find((row) => row.examInstanceId === 'ei-v2');
  assert(v2Row.categoryStats.major.Dialogue, 'v2 uses v2 questions');
  assert(v2Row.categoryStats.major.Grammar === undefined, 'v1 Grammar questions are not mixed into v2');
  assert(history.find((row) => row.percentage === 0), 'actual 0% Result stays in history');

  const zeroTrend = SAT.buildCloudOverallTrend([history.find((row) => row.percentage === 0)]);
  assert(zeroTrend.length === 1 && zeroTrend[0].percentage === 0, '0% is a real point');
  assert(SAT.describeCloudScoreSequence(zeroTrend) === '', 'one result does not invent a trend sentence');
  assert(SAT.describeCloudScoreSequence(SAT.buildCloudOverallTrend(history)).includes('→'), 'two+ results may list numbers only');

  const students = [
    { id: 'stu-1', name: 'Test 1' },
    { id: 'stu-2', name: 'A' },
    { id: 'stu-3', name: 'B' },
    { id: 'stu-4', name: 'C' },
    { id: 'stu-5', name: 'D' },
    { id: 'stu-6', name: 'E' },
    { id: 'stu-7', name: 'F' },
    { id: 'stu-8', name: 'G' },
  ];
  const enrollments = students.map((s) => ({
    studentId: s.id,
    classId: 'class-a',
    startDate: '2026-03-01',
    endDate: null,
  }));
  const classResults = [
    ...studentResults.filter((row) => row.examInstanceId === 'ei-1'),
    { id: 'r-s2', studentId: 'stu-2', examInstanceId: 'ei-1', answers: {}, percentage: 0.5, earnedPoints: 6, totalPoints: 12, correctCount: 1 },
    { id: 'r-s3', studentId: 'stu-3', examInstanceId: 'ei-1', answers: {}, percentage: 0.4, earnedPoints: 4, totalPoints: 12, correctCount: 1 },
    { id: 'r-s4', studentId: 'stu-4', examInstanceId: 'ei-1', answers: {}, percentage: 0.6, earnedPoints: 7, totalPoints: 12, correctCount: 1 },
    { id: 'r-s5', studentId: 'stu-5', examInstanceId: 'ei-1', answers: {}, percentage: 0.2, earnedPoints: 2, totalPoints: 12, correctCount: 0 },
  ];
  const summary = SAT.computeCloudExamInstanceSummary({
    eligibleStudents: students,
    results: classResults,
    questions: questionsByVersionId['ver-1'],
  });
  assert(summary.eligibleCount === 8, 'eligible 8');
  assert(summary.completedCount === 5, 'submitted 5');
  assert(summary.sampleSize === 5, 'average denominator is 5');
  assert(Math.abs(summary.averagePercentage - ((1 + 0.5 + 0.4 + 0.6 + 0.2) / 5)) < 1e-9, 'class average uses submitted Results only');

  const classTrend = SAT.buildCloudClassAverageTrend({
    instances: examInstances.map((row) => ({ ...row, assessmentTitle: 'CQ' })),
    results: classResults,
    enrollments,
    students,
  });
  assert(classTrend.every((row) => row.submittedCount > 0), 'class trend omits exams with no Results');
  const overlay = SAT.buildCloudStudentVsClassOverlay(
    SAT.buildCloudOverallTrend(history.filter((row) => row.examInstanceId === 'ei-1')),
    classTrend
  );
  assert(overlay[0].classSampleSize === 5, 'overlay n is submitted count');
  assert(!overlay.some((row) => row.examInstanceId === 'ei-missing'), 'missing Result is not in overlay');

  const counseling = SAT.buildCloudStudentAnalyticsView({
    studentId: 'stu-1',
    results: studentResults,
    examInstances,
    versions,
    assessments,
    classes,
    terms,
    questionsByVersionId,
    enrollments,
    students,
    filters: {},
    isTeacher: false,
  });
  assert(counseling.showClassAverage === false, 'counseling hides class average');
  assert(counseling.classTrend.length === 0, 'counseling has no class trend');
  assert(counseling.overlay.length === 0, 'counseling has no overlay');
  const teacherView = SAT.buildCloudStudentAnalyticsView({
    studentId: 'stu-1',
    results: studentResults,
    examInstances,
    versions,
    assessments,
    classes,
    terms,
    questionsByVersionId,
    enrollments,
    students,
    filters: {},
    isTeacher: true,
  });
  assert(teacherView.showClassAverage === true, 'teacher may use class average');
  assert(teacherView.emptyKind === '', 'student with results is not empty');

  const emptyView = SAT.buildCloudStudentAnalyticsView({
    studentId: 'nobody',
    results: studentResults,
    examInstances,
    versions,
    assessments,
    classes,
    terms,
    questionsByVersionId,
    enrollments,
    students,
    filters: {},
    isTeacher: false,
  });
  assert(emptyView.emptyKind === 'results', 'no Result is empty state not 0%');
  assert(emptyView.overallTrend.length === 0, 'empty filter does not seed a 0% chart');

  const filteredNone = SAT.buildCloudStudentAnalyticsView({
    studentId: 'stu-1',
    results: studentResults,
    examInstances,
    versions,
    assessments,
    classes,
    terms,
    questionsByVersionId,
    enrollments,
    students,
    filters: { level: 'ZZZ' },
    isTeacher: false,
  });
  assert(filteredNone.emptyKind === '' || filteredNone.filters.level === '', 'unknown level is sanitized away');

  let fetchCalls = 0;
  const fetchedIds = [];
  const aStore = new SAT.CloudAssessmentStore({
    async listQuestionsForVersions(ids) {
      fetchCalls += 1;
      fetchedIds.push(ids.slice().sort().join(','));
      return [...questionsByVersionId['ver-1'], ...questionsByVersionId['ver-2']];
    },
  }, { getState: () => ({ user: { id: 'u1' }, profile: { role: 'admin', active: true } }) });
  await aStore.ensureQuestionsForVersions(['ver-1', 'ver-2', 'ver-1']);
  await aStore.ensureQuestionsForVersions(['ver-1', 'ver-2']);
  assert(fetchCalls === 1, 'same versions are fetched once per analytics load cache');
  assert(aStore.questionsFor('ver-1').length === 3, 'v1 questions cached');
  assert(aStore.questionsFor('ver-2').length === 1, 'v2 questions cached separately');

  const repoSrc = String(SAT.CloudRepository.prototype.listQuestionsForVersions);
  assert(repoSrc.includes('assessment_version_id'), 'batch question read uses version ids');
  const createSrc = String(SAT.CloudRepository.prototype.createResult);
  assert(/insert\(payload\)\s*\.select\(\)/.test(createSrc), 'P5C-1 createResult write contract unchanged');

  const container = { innerHTML: '', classList: { add() {} }, querySelector() { return null; } };
  SAT.renderCloudPercentTrendChart(container, [], 't1');
  assert(container.innerHTML.includes('아직 입력된 CQ 결과가 없습니다.'), 'empty chart is empty state');
  SAT.renderCloudPercentTrendChart(container, [{ title: 'A', date: '2026-01-01', percentage: 0 }], 't1');
  assert(container.innerHTML.includes('0.0%'), '0% Result appears after empty render');
  SAT.destroyAllCharts();
  SAT.renderCloudPercentTrendChart(container, [], 't1');
  assert(container.innerHTML.includes('아직 입력된'), 'chart cleanup allows rerender');

  const analyticsSrc = readFileSync(join(root, 'js/cloud-analytics.js'), 'utf8');
  assert(!/localStorage\.(getItem|setItem)/.test(analyticsSrc), 'cloud analytics has no localStorage I/O');
  assert(!analyticsSrc.includes('studentAchievementTrackerData'), 'cloud analytics does not read legacy storage key');
  assert(!analyticsSrc.includes('supabase.from'), 'cloud analytics has no direct supabase');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert(html.includes('js/cloud-analytics.js'), 'cloud-analytics.js is loaded');
}

function runP7bLogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/cloud-repository.js',
    'js/enrollment-view.js',
    'js/cloud-academic-store.js',
    'js/p7-audit-contract.js',
  ]);

  assert(SAT.P7B_TRANSFER.rpc === 'transfer_student_to_class', 'P7B RPC name');
  assert(SAT.P7B_TRANSFER.adminOnly === true, 'P7B is admin-only');
  assert(SAT.P7B_TRANSFER.ownerDerivedFromClass === true, 'new owner comes from destination class');
  assert(SAT.P7B_TRANSFER.callerTeacherIdParam === false, 'no caller teacher-id parameter');
  assert(SAT.P7B_TRANSFER.currentClassId === null, 'current_class_id stays unused');
  assert(SAT.P7B_TRANSFER.openOwnerMustMatch === true, 'open enrollment owner must match');
  assert(SAT.P7B_TRANSFER.closedOwnerMismatchAllowed === true, 'closed historical mismatch is allowed');
  assert(SAT.P7B_TRANSFER.studentSelectWidenedForOldClassOwner === false, 'Student SELECT not widened');
  assert(SAT.P7B_TRANSFER.teacherSelfService === false, 'no teacher self-service transfer');

  const sameDay = SAT.computeTransferEnrollmentDates('2026-09-22', '2026-09-22');
  assert(sameDay.rejected === true, 'same-day transfer rejected');
  const okDates = SAT.computeTransferEnrollmentDates('2026-09-01', '2026-09-23');
  assert(okDates.rejected === false, 'later start accepted');
  assert(okDates.oldEndDate === '2026-09-22', 'old enrollment closes D-1');
  assert(okDates.newStartDate === '2026-09-23', 'new enrollment starts D');
  const noOpen = SAT.computeTransferEnrollmentDates(null, '2026-09-23');
  assert(noOpen.rejected === false && noOpen.oldEndDate === null, 'student without open enrollment can transfer');

  const helpers = readFileSync(join(root, 'supabase/migrations/003_domain_helpers.sql'), 'utf8');
  const policies = readFileSync(join(root, 'supabase/migrations/004_rls_policies.sql'), 'utf8');
  const patch = readFileSync(join(root, 'P7B_STUDENT_TRANSFER_PATCH.sql'), 'utf8');
  const verifySql = readFileSync(join(root, 'P4_FOUNDATION_VERIFY.sql'), 'utf8');
  const smokeSql = readFileSync(join(root, 'P4_FOUNDATION_INVARIANT_SMOKE.sql'), 'utf8');
  const smokeHtml = readFileSync(join(root, 'p4-rls-smoke.html'), 'utf8');
  const repoSrc = String(SAT.CloudRepository.prototype.transferStudentToClass);
  const storeSrc = String(SAT.CloudAcademicStore.prototype.transferStudentToClass);
  const updateStudentSrc = String(SAT.CloudRepository.prototype.updateStudent);
  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');

  const rpcStart = helpers.indexOf('create or replace function public.transfer_student_to_class');
  assert(rpcStart >= 0, 'canonical helpers include transfer RPC');
  const rpcSrc = helpers.slice(rpcStart);
  assert(rpcSrc.includes('is_tracker_admin()'), 'RPC checks admin');
  assert(rpcSrc.includes('security definer'), 'RPC is SECURITY DEFINER');
  assert(rpcSrc.includes('set search_path = public'), 'RPC pins search_path');
  assert(!/p_new_teacher|p_new_owner_id/i.test(rpcSrc), 'RPC does not take a teacher id');
  assert(rpcSrc.includes('v_class.owner_id'), 'new owner derived from destination class');
  assert(rpcSrc.includes('p_new_start_date - 1'), 'old enrollment closes D-1');
  const guardStart = helpers.indexOf('create or replace function public.sat_guard_student_row()');
  const guardSrc = helpers.slice(guardStart, helpers.indexOf('create trigger trg_students_cache_identity'));
  assert(guardSrc.includes('security invoker'), 'student guard is SECURITY INVOKER');
  assert(!/security\s+definer/i.test(guardSrc), 'student guard is not SECURITY DEFINER');
  assert(guardSrc.includes("current_user in ('authenticated', 'anon')"), 'owner trigger blocks client current_user');
  assert(!guardSrc.includes('session_user'), 'student guard does not key off session_user');
  assert(patch.includes('security invoker'), 'P7B patch sets student guard INVOKER');
  assert(verifySql.includes('student_transfer_guard_is_security_invoker'), 'VERIFY checks student guard INVOKER');
  assert(verifySql.includes('student_transfer_no_other_definer_owner_update'), 'VERIFY checks no other DEFINER student UPDATE');
  assert(!rpcSrc.includes('update public.classes'), 'RPC does not rewrite classes');
  assert(!rpcSrc.includes('update public.exam_instances'), 'RPC does not rewrite exam_instances');
  assert(!rpcSrc.includes('update public.results'), 'RPC does not rewrite results');
  assert(!/set\s+current_class_id/i.test(rpcSrc), 'RPC does not set current_class_id');

  assert(policies.includes('grant execute on function public.transfer_student_to_class'), 'authenticated EXECUTE granted');
  assert(policies.includes('revoke all on function public.transfer_student_to_class(uuid, uuid, date) from anon'), 'anon EXECUTE revoked');
  assert(policies.includes('grant update (name, english_name, active)'), 'student UPDATE grant unchanged');
  assert(policies.includes('revoke insert on table public.students from authenticated'), '004 revokes table-level students INSERT');
  assert(policies.includes('grant insert (owner_id, name, english_name, active)'), '004 students INSERT is column-limited');
  const studentInsertGrant = policies.slice(
    policies.indexOf('revoke insert on table public.students from authenticated'),
    policies.indexOf('grant update (name, english_name, active)')
  );
  assert(studentInsertGrant.includes('owner_id, name, english_name, active'), 'student INSERT columns are owner/name/english/active');
  assert(!studentInsertGrant.includes('current_class_id'), 'student INSERT grant omits current_class_id');
  assert(!studentInsertGrant.includes('created_at'), 'student INSERT grant omits created_at');
  const studentGrant = policies.slice(
    policies.indexOf('grant update (name, english_name, active)'),
    policies.indexOf('grant select, insert on table public.enrollments')
  );
  assert(!studentGrant.includes('owner_id'), 'student UPDATE grant still omits owner_id');

  const insertPrivPatch = readFileSync(join(root, 'P7B_STUDENT_INSERT_PRIVILEGE_RECONCILE.sql'), 'utf8');
  assert(insertPrivPatch.includes('begin;'), 'students INSERT privilege patch is transactional');
  assert(insertPrivPatch.includes('commit;'), 'students INSERT privilege patch commits');
  assert(insertPrivPatch.includes('revoke insert on table public.students from authenticated'), 'P7B insert patch revokes table-level students INSERT');
  assert(insertPrivPatch.includes('grant insert ('), 'P7B insert patch re-grants column INSERT');
  assert(!/revoke insert on table public\.(classes|results|enrollments)/i.test(insertPrivPatch), 'P7B insert patch does not touch other tables');
  assert(!/create or replace function/i.test(insertPrivPatch), 'P7B insert patch does not change RPC');
  assert(!/create policy/i.test(insertPrivPatch), 'P7B insert patch does not change RLS');

  const reconcile = readFileSync(join(root, 'P4_REMOTE_PRIVILEGE_RECONCILE.sql'), 'utf8');
  assert(reconcile.includes('Not a P7B required step'), 'broader reconcile is not a P7B requirement');
  assert(verifySql.includes('students_client_insert_columns'), 'VERIFY checks students INSERT column contract');
  assert(verifySql.includes('students_no_table_level_insert'), 'VERIFY checks table-level students INSERT is absent');
  assert(verifySql.includes('students_any_column_insert'), 'VERIFY checks has_any_column_privilege INSERT');
  assert(verifySql.includes('has_table_privilege'), 'VERIFY uses has_table_privilege');
  assert(verifySql.includes('has_any_column_privilege'), 'VERIFY uses has_any_column_privilege');
  assert(verifySql.includes("has_column_privilege("), 'VERIFY uses has_column_privilege for student INSERT');
  assert(smokeSql.includes("has_table_privilege('authenticated', 'public.students'::regclass, 'INSERT')"), 'smoke checks table-level students INSERT');
  assert(smokeSql.includes("has_any_column_privilege('authenticated', 'public.students'::regclass, 'INSERT')"), 'smoke checks any-column students INSERT');

  assert(patch.includes('begin;'), 'P7B patch is transactional');
  assert(patch.includes('commit;'), 'P7B patch commits as one unit');
  assert(!/drop[\s\S]*cascade/i.test(patch), 'P7B patch has no CASCADE');
  assert(!/to service_role/i.test(patch), 'P7B patch does not grant to service_role');
  assert(!/create policy[\s\S]{0,200}using\s+\(\s*true\s*\)/i.test(patch), 'P7B patch has no USING true policy');
  assert(!/disable row level security/i.test(patch), 'P7B patch does not disable RLS');
  assert(!/grant update \(.*owner_id/i.test(patch), 'P7B patch does not grant owner_id UPDATE');

  assert(verifySql.includes('student_transfer_rpc_exists'), 'VERIFY has transfer RPC check');
  assert(verifySql.includes('student_transfer_open_enrollment_owner_contract'), 'VERIFY open-owner contract');
  assert(verifySql.includes('student_transfer_direct_owner_update_still_blocked'), 'VERIFY direct owner update still blocked');
  assert(smokeSql.includes('SMOKE 21 FAIL'), 'invariant smoke has case 21');
  assert(smokeSql.includes('Closed historical Enrollment owner mismatch is allowed'), 'smoke does not fail closed mismatch');
  assert(smokeHtml.includes('student-transfer'), 'Run J harness exists');
  assert(smokeHtml.includes('이 페이지에서 remote patch를 실행하지 말 것'), 'harness must not auto-run remote SQL');
  const runJSrc = smokeHtml.slice(
    smokeHtml.indexOf('async function runStudentTransfer'),
    smokeHtml.indexOf("const runners = {")
  );
  assert(runJSrc.length > 100, 'Run J function is present');
  assert(!runJSrc.includes('ZERO_UUID'), 'Run J does not fall back to dummy UUID');
  assert(runJSrc.includes('Student ID와 Destination Class ID를 입력하세요.'), 'Run J requires real student and dest class IDs');
  assert(smokeHtml.includes('id="transfer-student-id"'), 'Run J has Student ID field');
  assert(smokeHtml.includes('id="transfer-dest-class-id"'), 'Run J has Destination Class ID field');
  assert(smokeHtml.includes('id="transfer-start-date"'), 'Run J has start date field');
  const jSection = smokeHtml.slice(
    smokeHtml.indexOf('<legend>J. Student transfer (P7B)</legend>'),
    smokeHtml.indexOf('data-run="student-transfer"')
  );
  assert(jSection.includes('transfer-student-id'), 'Student ID field is inside Run J section');
  assert(jSection.includes('transfer-dest-class-id'), 'Destination Class ID field is inside Run J section');

  assert(repoSrc.includes("transfer_student_to_class"), 'repository calls transfer RPC');
  assert(storeSrc.includes('refresh()'), 'store reloads after transfer');
  assert(updateStudentSrc.includes("['name', 'englishName', 'active']"), 'direct student update allowlist unchanged');
  assert(rendererSrc.includes('data-action="transfer-student"'), 'admin transfer action exists');
  assert(rendererSrc.includes('this.app.isCloudAdmin()'), 'transfer control is admin-gated');
  assert(appSrc.includes('submitTransferStudent'), 'app submits transfer form');
  assert(appSrc.includes("rpc('transfer_student_to_class'") === false, 'app does not call RPC directly');
}

function runP7aLogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/cloud-repository.js',
    'js/result-view.js',
    'js/cloud-analytics.js',
    'js/p7-audit-contract.js',
  ]);

  const entities = [
    'profiles',
    'terms',
    'classes',
    'students',
    'enrollments',
    'assessments',
    'assessment_versions',
    'assessment_questions',
    'exam_instances',
    'results',
  ];
  const actors = SAT.P7A_ROLES;
  assert(Array.isArray(actors) && actors.includes('admin') && actors.includes('anon'), 'P7A actors include admin/anon');
  entities.forEach((entity) => {
    const row = SAT.P7A_PERMISSION_MATRIX[entity];
    assert(row, `permission matrix has ${entity}`);
    ['admin', 'teacherA', 'teacherB', 'inactiveTeacher', 'anon'].forEach((actor) => {
      assert(row[actor], `${entity}.${actor} cell exists`);
      assert(row[actor].select, `${entity}.${actor}.select`);
      assert(row[actor].insert, `${entity}.${actor}.insert`);
      assert(row[actor].update, `${entity}.${actor}.update`);
      assert(row[actor].delete, `${entity}.${actor}.delete`);
    });
  });
  assert(SAT.P7A_PERMISSION_MATRIX.students.teacherA.select === 'own-owner-id-only', 'teacher student SELECT is own owner_id');
  assert(SAT.P7A_PERMISSION_MATRIX.classes.teacherB.update === 'own-name-archived', 'teacher class UPDATE is own name/archived');
  assert(SAT.P7A_PERMISSION_MATRIX.results.anon.select === 'no', 'anon has no result SELECT');
  assert(SAT.P7A_HANDOVER_TARGET.enrollmentMoveSeparate === false, 'P7B transfer is atomic owner + enrollment');
  assert(SAT.P7A_HANDOVER_TARGET.rpc === 'transfer_student_to_class', 'handover RPC is transfer_student_to_class');
  assert(SAT.P7A_HANDOVER_TARGET.adminOnly === true, 'handover is admin-only');
  assert(SAT.P7A_HANDOVER_TARGET.changes.includes('students.owner_id'), 'handover changes student owner_id');
  assert(SAT.P7A_HANDOVER_TARGET.changes.includes('enrollments.close+insert'), 'handover closes and inserts enrollment');

  const repoSrc = String(SAT.CloudRepository.prototype.updateClass)
    + '\n'
    + String(SAT.CloudRepository.prototype.updateStudent);
  assert(repoSrc.includes("['name', 'archived']"), 'updateClass allowlist is name/archived');
  assert(repoSrc.includes("['name', 'englishName', 'active']"), 'updateStudent allowlist is name/englishName/active');
  assert(!/mapAppPatchToDb\([^)]*ownerId/.test(repoSrc), 'teacher update payloads do not map ownerId');

  const mapperClass = SAT.mapAppPatchToDb({ name: 'X', ownerId: 'spoof' }, ['name', 'archived']);
  const mapperStu = SAT.mapAppPatchToDb({ name: 'Y', ownerId: 'spoof', currentClassId: 'c' }, ['name', 'englishName', 'active']);
  assert(mapperClass.owner_id === undefined, 'class update patch omits owner_id');
  assert(mapperStu.owner_id === undefined, 'student update patch omits owner_id');
  assert(mapperStu.current_class_id === undefined, 'student update patch omits current_class_id');

  const oldClass = { id: 'class-old', name: 'Old', termId: 'term-1', level: 'DSC', ownerId: 'teacher-a' };
  const newClass = { id: 'class-new', name: 'New', termId: 'term-2', level: 'DSD', ownerId: 'teacher-b' };
  const terms = [
    { id: 'term-1', name: '2026-1' },
    { id: 'term-2', name: '2026-2' },
  ];
  const examOld = {
    id: 'ei-old',
    classId: 'class-old',
    assessmentVersionId: 'ver-1',
    administeredDate: '2026-03-10',
    assessmentTitle: 'Old CQ',
  };
  const examNew = {
    id: 'ei-new',
    classId: 'class-new',
    assessmentVersionId: 'ver-1',
    administeredDate: '2026-09-10',
    assessmentTitle: 'New CQ',
  };
  const resultOld = {
    id: 'r-old',
    studentId: 'stu-x',
    examInstanceId: 'ei-old',
    answers: {},
    percentage: 0.8,
    earnedPoints: 8,
    totalPoints: 10,
    correctCount: 8,
  };
  const resultFuture = {
    id: 'r-new',
    studentId: 'stu-x',
    examInstanceId: 'ei-new',
    answers: {},
    percentage: 0.5,
    earnedPoints: 5,
    totalPoints: 10,
    correctCount: 5,
  };
  const currentEnrollmentOnly = [{
    studentId: 'stu-x',
    classId: 'class-new',
    startDate: '2026-09-01',
    endDate: null,
  }];
  const questionsByVersionId = { 'ver-1': [] };
  const studentView = SAT.buildCloudStudentAnalyticsView({
    studentId: 'stu-x',
    results: [resultOld, resultFuture],
    examInstances: [examOld, examNew],
    versions: [{ id: 'ver-1', assessmentId: 'a1', versionNumber: 1, status: 'published' }],
    assessments: [{ id: 'a1', title: 'CQ', assessmentType: 'CQ', level: 'DSC' }],
    classes: [oldClass, newClass],
    terms,
    questionsByVersionId,
    enrollments: currentEnrollmentOnly,
    students: [{ id: 'stu-x', name: 'X', ownerId: 'teacher-b' }],
    filters: {},
    isTeacher: false,
  });
  assert(studentView.overallTrend.length === 2, 'student analytics uses Result history not current Enrollment');
  assert(studentView.overallTrend.some((row) => row.examInstanceId === 'ei-old'), 'longitudinal includes old class Result');
  assert(studentView.historyDesc.some((row) => row.classId === 'class-old'), 'history class comes from ExamInstance not current class');

  const remainingRoster = [{ id: 'stu-keep', name: 'Keep' }];
  const classResults = [
    resultOld,
    { id: 'r-keep', studentId: 'stu-keep', examInstanceId: 'ei-old', answers: {}, percentage: 0.4, earnedPoints: 4, totalPoints: 10, correctCount: 4 },
  ];
  const summaryAfterHandover = SAT.computeCloudExamInstanceSummary({
    eligibleStudents: remainingRoster,
    results: classResults,
    questions: [],
  });
  assert(summaryAfterHandover.sampleSize === 2, 'class average keeps historical Result after student leaves eligible roster');
  assert(Math.abs(summaryAfterHandover.averagePercentage - 0.6) < 1e-9, 'handover does not drop old class Result from average');

  const trendAfterHandover = SAT.buildCloudClassAverageTrend({
    instances: [examOld],
    results: classResults,
    enrollments: [
      { studentId: 'stu-keep', classId: 'class-old', startDate: '2026-03-01', endDate: null },
    ],
    students: remainingRoster,
  });
  assert(trendAfterHandover[0].submittedCount === 2, 'class trend submittedCount is Result rows not current owner roster');

  const vis = SAT.simulateP7aHandoverVisibility({
    studentId: 'stu-x',
    oldOwnerId: 'teacher-a',
    newOwnerId: 'teacher-b',
    unrelatedId: 'teacher-c',
    resultOld: { ...resultOld, classId: 'class-old' },
    resultFuture: { ...resultFuture, classId: 'class-new' },
    oldClassId: 'class-old',
    newClassId: 'class-new',
  });
  assert(vis.teacherB.some((row) => row.id === 'r-old') && vis.teacherB.some((row) => row.id === 'r-new'), 'new owner sees longitudinal results (simulation, not live RLS)');
  assert(vis.teacherA.some((row) => row.id === 'r-old'), 'old class owner keeps old class Result (simulation)');
  assert(!vis.teacherA.some((row) => row.id === 'r-new'), 'old class owner does not see future other-class Result (simulation)');
  assert(vis.teacherC.length === 0, 'unrelated teacher sees no Result (simulation)');

  const helpers = readFileSync(join(root, 'supabase/migrations/003_domain_helpers.sql'), 'utf8');
  const policies = readFileSync(join(root, 'supabase/migrations/004_rls_policies.sql'), 'utf8');
  const examSelect = helpers.slice(
    helpers.indexOf('create or replace function public.can_select_exam_instance('),
    helpers.indexOf('create or replace function public.sat_version_is_draft')
  );
  assert(examSelect.includes('owns_class(p_class_id)'), 'ExamInstance SELECT allows class owner');
  assert(examSelect.includes('from public.results r'), 'ExamInstance SELECT allows historical owned-student Result');
  assert(policies.includes('using (public.can_select_exam_instance(id, class_id))'), 'SELECT policy uses can_select_exam_instance');
  const updatePol = policies.slice(
    policies.indexOf('create policy sat_exam_instances_update'),
    policies.indexOf('create policy sat_exam_instances_delete')
  );
  const deletePol = policies.slice(
    policies.indexOf('create policy sat_exam_instances_delete'),
    policies.indexOf('create policy sat_results_select')
  );
  assert(updatePol.includes('owns_class(class_id)'), 'ExamInstance UPDATE requires owns_class');
  assert(!updatePol.includes('can_select_exam_instance'), 'ExamInstance UPDATE does not use SELECT helper');
  assert(deletePol.includes('owns_class(class_id)'), 'ExamInstance DELETE requires owns_class');
  assert(!deletePol.includes('can_select_exam_instance'), 'ExamInstance DELETE does not use SELECT helper');

  const authSrc = readFileSync(join(root, 'js/auth-manager.js'), 'utf8');
  const gateSrc = readFileSync(join(root, 'js/auth-gate.js'), 'utf8');
  assert(authSrc.includes('AUTHENTICATED_INACTIVE'), 'inactive auth state exists');
  assert(authSrc.includes('profile.active !== true'), 'inactive profile is not AUTHENTICATED_ACTIVE');
  assert(gateSrc.includes('AUTHENTICATED_INACTIVE'), 'gate handles inactive');
  assert(gateSrc.includes('startLegacyTrackerApp'), 'active gate boots tracker');
  assert(gateSrc.includes("snapshot.state === AUTH_STATES.AUTHENTICATED_INACTIVE"), 'inactive does not keep academic boot');

  const curriculumFn = helpers.slice(
    helpers.indexOf('create or replace function public.can_edit_tracker_curriculum()'),
    helpers.indexOf('create or replace function public.owns_class')
  );
  assert(curriculumFn.includes('public.is_tracker_admin()'), 'curriculum helper is admin-only');
  assert(!curriculumFn.includes('p.can_edit_curriculum'), 'curriculum helper does not read capability flag');
  assert(SAT.canEditCurriculum({ role: 'admin', active: true, can_edit_curriculum: false }) === true, 'client admin curriculum true without flag');
  assert(SAT.canEditCurriculum({ role: 'teacher', active: true, can_edit_curriculum: true }) === false, 'client teacher + flag cannot author');
  assert(SAT.canEditCurriculum({ role: 'teacher', active: true, can_edit_curriculum: false }) === false, 'client teacher without flag cannot author');
  assert(SAT.canEditCurriculum({ role: 'teacher', active: false, can_edit_curriculum: true }) === false, 'inactive cannot author');
  assert(policies.includes('using (public.can_edit_tracker_curriculum())'), 'curriculum write policies still use helper');
  const publishFn = helpers.slice(
    helpers.indexOf('create or replace function public.publish_assessment_version'),
    helpers.indexOf('comment on function public.set_current_term')
  );
  assert(publishFn.includes('can_edit_tracker_curriculum()'), 'publish RPC uses curriculum helper');
  assert(!publishFn.includes('p.can_edit_curriculum'), 'publish RPC does not read capability flag');
  const versionSelect = helpers.slice(
    helpers.indexOf('create or replace function public.sat_can_select_version'),
    helpers.indexOf('create or replace function public.sat_can_select_assessment')
  );
  assert(versionSelect.includes("'published', 'archived'"), 'teacher published/archived version read remains');
  assert(!/create or replace function public\.handover_student/i.test(helpers), 'owner-only handover_student RPC is not implemented');
  assert(/create or replace function public\.transfer_student_to_class/i.test(helpers), 'transfer_student_to_class exists in helpers');

  const grants = policies.slice(policies.indexOf('grant update (name, archived)'), policies.indexOf('grant select, delete on table public.students'));
  assert(grants.includes('grant update (name, archived)'), 'classes UPDATE grant is name/archived');
  assert(!grants.includes('owner_id'), 'classes UPDATE grant omits owner_id');
  assert(helpers.includes('students.owner_id is immutable on client UPDATE'), 'student owner trigger blocks client handover');

  const smokeHtml = readFileSync(join(root, 'p4-rls-smoke.html'), 'utf8');
  assert(smokeHtml.includes('enrollment-boundary'), 'P7A smoke G enrollment boundary exists');
  assert(smokeHtml.includes('result-isolation'), 'P7A smoke H result isolation exists');
  assert(smokeHtml.includes('curriculum-admin-only'), 'P7 smoke I curriculum admin-only exists');
  assert(smokeHtml.includes('student-transfer'), 'P7B smoke J student transfer exists');
  assert(smokeHtml.includes('service_role 금지'), 'smoke page forbids service_role');
  assert(smokeHtml.includes('Teacher Class INSERT and Teacher Student INSERT must both PASS'), 'smoke checklist includes Teacher Class/Student INSERT RETURNING');

  const createClassSrc = String(SAT.CloudRepository.prototype.createClass);
  assert(/insert\(payload\)\s*\.select\(\)/.test(createClassSrc), 'createClass keeps insert().select()');
  assert(!createClassSrc.includes('.insert(payload);'), 'createClass does not drop RETURNING');

  const classSelect = helpers.slice(
    helpers.indexOf('create or replace function public.can_select_class('),
    helpers.indexOf('create or replace function public.can_select_exam_instance(')
  );
  assert(classSelect.includes('p_class_id uuid'), '2-arg can_select_class has class id');
  assert(classSelect.includes('p_owner_id uuid'), '2-arg can_select_class has owner id');
  assert(classSelect.includes('p_owner_id = auth.uid()'), 'helper uses current-row owner_id');
  assert(classSelect.includes('from public.enrollments e'), 'historical enrollment path remains');
  assert(classSelect.includes('s.owner_id = auth.uid()'), 'historical path is current student owner');
  assert(!classSelect.includes('owns_class(p_class_id)'), 'SELECT helper does not call owns_class for owner path');
  assert(!/from public\.classes/i.test(classSelect), 'SELECT helper does not self-query classes');
  assert(!/create or replace function public\.can_select_class\(\s*p_class_id uuid\s*\)/.test(helpers), 'canonical SQL has no 1-arg can_select_class');
  assert(policies.includes('using (public.can_select_class(id, owner_id))'), 'sat_classes_select uses current-row owner_id');
  assert(!policies.includes('using (public.can_select_class(id));'), 'old 1-arg classes SELECT policy is gone');
  const classUpdate = policies.slice(
    policies.indexOf('create policy sat_classes_update'),
    policies.indexOf('create policy sat_classes_delete')
  );
  const classDelete = policies.slice(
    policies.indexOf('create policy sat_classes_delete'),
    policies.indexOf('create policy sat_students_select')
  );
  assert(classUpdate.includes('owns_class(id)'), 'Class UPDATE still uses owns_class');
  assert(!classUpdate.includes('can_select_class'), 'Class UPDATE does not use SELECT helper');
  assert(classDelete.includes('owns_class(id)'), 'Class DELETE still uses owns_class');
  assert(!classDelete.includes('can_select_class'), 'Class DELETE does not use SELECT helper');
  assert(!/create policy sat_classes_select[\s\S]*using \(true\)/i.test(policies), 'classes SELECT is not USING true');
  assert(helpers.includes('enable row level security') === false, '003 helpers file is not where RLS is enabled');
  const schemaSql = readFileSync(join(root, 'supabase/migrations/001_cloud_core_schema.sql'), 'utf8');
  assert(schemaSql.includes('alter table public.classes enable row level security'), 'classes RLS stays enabled');
  const patchSql = readFileSync(join(root, 'P7_CLASS_SELECT_RLS_PATCH.sql'), 'utf8');
  assert(patchSql.includes('begin;'), 'class select patch is transactional');
  assert(patchSql.includes('commit;'), 'class select patch commits as one unit');
  assert(patchSql.includes('drop function if exists public.can_select_class(uuid);'), 'patch drops 1-arg last');
  assert(!/drop function[\s\S]*cascade/i.test(patchSql), 'class select patch has no CASCADE');

  const createStudentSrc = String(SAT.CloudRepository.prototype.createStudent);
  assert(/insert\(payload\)\s*\.select\(\)/.test(createStudentSrc), 'createStudent keeps insert().select()');
  assert(!createStudentSrc.includes('.insert(payload);'), 'createStudent does not drop RETURNING');

  const studentSelect = helpers.slice(
    helpers.indexOf('create or replace function public.can_select_student('),
    helpers.indexOf('create or replace function public.can_select_class(')
  );
  assert(studentSelect.includes('p_student_id uuid'), 'can_select_student has student id');
  assert(studentSelect.includes('p_owner_id uuid'), 'can_select_student has owner id');
  assert(studentSelect.includes('p_owner_id = auth.uid()'), 'student SELECT helper uses current-row owner_id');
  assert(studentSelect.includes('public.is_tracker_admin()'), 'admin Student SELECT path exists');
  assert(studentSelect.includes('not public.is_tracker_user()'), 'inactive tracker user cannot SELECT student');
  assert(studentSelect.includes('else false'), 'unrelated teacher Student SELECT is false');
  assert(!studentSelect.includes('owns_student(p_student_id)'), 'student SELECT helper does not call owns_student');
  assert(!/from public\.students/i.test(studentSelect), 'student SELECT helper does not self-query students');
  assert(helpers.includes('create or replace function public.owns_student(p_student_id uuid)'), 'owns_student(uuid) remains');
  assert(policies.includes('using (public.can_select_student(id, owner_id))'), 'sat_students_select uses current-row owner_id');
  const studentSelectPol = policies.slice(
    policies.indexOf('create policy sat_students_select'),
    policies.indexOf('create policy sat_students_insert')
  );
  assert(studentSelectPol.includes('can_select_student(id, owner_id)'), 'students SELECT policy uses current-row helper');
  assert(!studentSelectPol.includes('owns_student'), 'students SELECT policy does not call owns_student');
  const studentUpdate = policies.slice(
    policies.indexOf('create policy sat_students_update'),
    policies.indexOf('create policy sat_students_delete')
  );
  const studentDelete = policies.slice(
    policies.indexOf('create policy sat_students_delete'),
    policies.indexOf('create policy sat_enrollments_select')
  );
  assert(studentUpdate.includes('owns_student(id)'), 'Student UPDATE still uses owns_student');
  assert(!studentUpdate.includes('can_select_student'), 'Student UPDATE does not use SELECT helper');
  assert(studentDelete.includes('owns_student(id)'), 'Student DELETE still uses owns_student');
  assert(!studentDelete.includes('can_select_student'), 'Student DELETE does not use SELECT helper');
  assert(!/create policy sat_students_select[\s\S]*using \(true\)/i.test(policies), 'students SELECT is not USING true');
  assert(schemaSql.includes('alter table public.students enable row level security'), 'students RLS stays enabled');
  const studentPatchSql = readFileSync(join(root, 'P7_STUDENT_SELECT_RLS_PATCH.sql'), 'utf8');
  assert(studentPatchSql.includes('begin;'), 'student select patch is transactional');
  assert(studentPatchSql.includes('commit;'), 'student select patch commits as one unit');
  assert(!studentPatchSql.includes('drop function if exists public.owns_student'), 'student patch does not drop owns_student');
  assert(!/drop function[\s\S]*cascade/i.test(studentPatchSql), 'student select patch has no CASCADE');

  const currPatch = readFileSync(join(root, 'P7_CURRICULUM_ADMIN_ONLY_PATCH.sql'), 'utf8');
  assert(currPatch.includes('begin;'), 'curriculum patch is transactional');
  assert(currPatch.includes('commit;'), 'curriculum patch commits as one unit');
  assert(currPatch.includes('select public.is_tracker_admin();'), 'curriculum patch is admin-only');
  assert(!/drop column/i.test(currPatch), 'curriculum patch does not drop can_edit_curriculum');
  assert(!/drop table/i.test(currPatch), 'curriculum patch does not drop tables');
  assert(schemaSql.includes('can_edit_curriculum boolean not null default false'), 'capability column remains on profiles');
  const examInsert = policies.slice(
    policies.indexOf('create policy sat_exam_instances_insert'),
    policies.indexOf('create policy sat_exam_instances_update')
  );
  assert(examInsert.includes('owns_class(class_id)'), 'ExamInstance INSERT still owns_class; Teacher assignment unchanged');
  assert(!examInsert.includes('can_edit_tracker_curriculum'), 'ExamInstance INSERT is not curriculum-gated');
}

function runP8LogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/cloud-repository.js',
    'js/enrollment-view.js',
    'js/p8-ux-contract.js',
    'js/cloud-academic-store.js',
    'js/assessment-view.js',
    'js/cloud-assessment-store.js',
    'js/result-view.js',
    'js/cloud-result-store.js',
    'js/cloud-analytics.js',
  ]);

  assert(SAT.CURRENT_CLASS_LABEL === '현재 반', 'current class label');
  assert(SAT.HISTORICAL_EXAM_CLASS_LABEL === '시험 당시 반', 'historical exam class label');
  assert(SAT.P8_MULTI_DEVICE.realtime === false, 'Realtime stays off');
  assert(SAT.P8_MULTI_DEVICE.navigationRefetch === false, 'navigation does not refetch');
  assert(SAT.P8_MULTI_DEVICE.explicitRefresh === true, 'explicit refresh is the multi-device path');
  assert(SAT.P8_MULTI_DEVICE.staleOverwriteGuard === true, 'stale overwrite guard is on');

  const oldClass = { id: 'class-old', name: 'DSC4 화목', termId: 'term-1', level: 'DSC' };
  const newClass = { id: 'class-new', name: 'LSA1 월수금', termId: 'term-2', level: 'LSA' };
  const terms = [
    { id: 'term-1', name: '2026-1' },
    { id: 'term-2', name: '2026-2' },
  ];
  const student = SAT.composeStudentsWithEnrollment(
    [{ id: 'stu-x', name: 'X', ownerId: 'teacher-b', currentClassId: 'class-old' }],
    [{ studentId: 'stu-x', classId: 'class-new', startDate: '2026-09-01', endDate: null }]
  )[0];
  assert(student.classId === 'class-new', 'current classId comes from open Enrollment');
  assert(student.currentClassId === undefined, 'current_class_id is not attached as academic truth');
  assert(SAT.formatCurrentClassCaption(student, [oldClass, newClass]) === '현재 반: LSA1 월수금', 'header uses current class');
  assert(SAT.formatHistoricalClassCaption('DSC4 화목') === '시험 당시 반: DSC4 화목', 'historical label keeps exam class');

  const examOld = {
    id: 'ei-old',
    classId: 'class-old',
    assessmentVersionId: 'ver-1',
    administeredDate: '2026-03-10',
  };
  const examNew = {
    id: 'ei-new',
    classId: 'class-new',
    assessmentVersionId: 'ver-1',
    administeredDate: '2026-09-10',
  };
  const studentView = SAT.buildCloudStudentAnalyticsView({
    studentId: 'stu-x',
    results: [
      {
        id: 'r-old',
        studentId: 'stu-x',
        examInstanceId: 'ei-old',
        answers: {},
        percentage: 0.8,
        earnedPoints: 8,
        totalPoints: 10,
        correctCount: 8,
      },
      {
        id: 'r-new',
        studentId: 'stu-x',
        examInstanceId: 'ei-new',
        answers: {},
        percentage: 0.5,
        earnedPoints: 5,
        totalPoints: 10,
        correctCount: 5,
      },
    ],
    examInstances: [examOld, examNew],
    versions: [{ id: 'ver-1', assessmentId: 'a1', versionNumber: 1, status: 'published' }],
    assessments: [{ id: 'a1', title: 'CQ', assessmentType: 'CQ', level: 'DSC' }],
    classes: [oldClass, newClass],
    terms,
    questionsByVersionId: { 'ver-1': [] },
    enrollments: [{ studentId: 'stu-x', classId: 'class-new', startDate: '2026-09-01', endDate: null }],
    students: [student],
    filters: {},
    isTeacher: false,
  });
  const oldHistory = studentView.historyDesc.find((row) => row.resultId === 'r-old');
  const newHistory = studentView.historyDesc.find((row) => row.resultId === 'r-new');
  assert(oldHistory.classId === 'class-old' && oldHistory.className === 'DSC4 화목', 'old Result keeps ExamInstance class');
  assert(newHistory.classId === 'class-new' && newHistory.className === 'LSA1 월수금', 'new Result uses exam class not remapped');
  assert(SAT.resolveCurrentClassName(student, [oldClass, newClass]) !== oldHistory.className, 'current class and historical exam class stay distinct');

  assert(SAT.shouldResetCloudSessionOnBootKeyChange(null, 'user-b') === true, 'first active boot resets');
  assert(SAT.shouldResetCloudSessionOnBootKeyChange('user-a', 'user-b') === true, 'account switch resets');
  assert(SAT.shouldResetCloudSessionOnBootKeyChange('user-a', 'user-a') === false, 'same account does not reset');
  assert(SAT.shouldRerenderAfterBackgroundRefresh('classes', 'visibility') === true, 'visibility refresh rerenders roster views');
  assert(SAT.shouldRerenderAfterBackgroundRefresh('answer-entry', 'visibility') === false, 'visibility refresh does not remount answer draft');
  assert(SAT.shouldRerenderAfterBackgroundRefresh('answer-entry', 'manual') === true, 'manual refresh rerenders current view');

  const academic = new SAT.CloudAcademicStore({
    async listTerms() { return []; },
    async listClasses() { return []; },
    async listEnrollments() { return []; },
    async listStudents() { return []; },
  }, { getState: () => ({ user: { id: 'u1' }, profile: { role: 'teacher', active: true } }) });
  academic.studentsRaw = [{ id: 'leak', name: 'Prev Account' }];
  academic.classes = [{ id: 'old-class' }];
  academic.enrollments = [{ id: 'old-enroll' }];
  academic.clear();
  assert(academic.studentsRaw.length === 0, 'account reset clears students');
  assert(academic.classes.length === 0, 'account reset clears classes');
  assert(academic.enrollments.length === 0, 'account reset clears enrollments');

  const results = new SAT.CloudResultStore({
    async listResults() { return []; },
  }, { getState: () => ({ user: { id: 'u1' } }) });
  results.results = [{ id: 'stale-result' }];
  results.clear();
  assert(results.results.length === 0, 'account reset clears result store');

  assert(SAT.isResultUpdatedAtStale(
    { updatedAt: '2026-09-23T01:00:00.000Z' },
    { updatedAt: '2026-09-23T02:00:00.000Z' }
  ) === true, 'updatedAt mismatch is stale');
  assert(SAT.isResultUpdatedAtStale(
    { updatedAt: '2026-09-23T01:00:00.000Z' },
    { updatedAt: '2026-09-23T01:00:00.000Z' }
  ) === false, 'same updatedAt is not stale');
  assert(SAT.isResultUpdatedAtStale({ id: 'r1' }, { id: 'r1', updatedAt: 't' }) === false, 'missing local marker is not treated as stale');

  const staleErr = SAT.createResultStaleConflictError();
  assert(staleErr.code === SAT.RepositoryErrorCodes.STALE, 'stale error uses STALE code');
  assert(SAT.formatRepositoryUserMessage(staleErr) === SAT.RESULT_STALE_MESSAGE, 'stale error asks for reload');

  const q1 = { id: '11111111-1111-1111-1111-111111111111', number: 1, gradingType: 'choice', correctAnswer: '1', points: 1 };
  const capture = {};
  const fakeRepo = {
    remote: {
      id: 'r-1',
      examInstanceId: 'ei',
      studentId: 's1',
      answers: { [q1.id]: '1' },
      teacherComment: 'old',
      updatedAt: 't1',
    },
    async getResult() { return { ...this.remote }; },
    async updateResult(id, patch, options) {
      capture.id = id;
      capture.patch = patch;
      capture.options = options;
      return { ...this.remote, ...patch, updatedAt: 't2' };
    },
    async createResult() { throw new Error('create must not run when remote exists'); },
  };
  const store = new SAT.CloudResultStore(fakeRepo, { getState: () => ({ user: { id: 'u1' } }) });
  store.results = [{ ...fakeRepo.remote }];
  return store.saveStudentAnswers({
    examInstanceId: 'ei',
    studentId: 's1',
    answers: { [q1.id]: '2' },
    teacherComment: 'new',
    questions: [q1],
  }).then((row) => {
    assert(capture.options.expectedUpdatedAt === 't1', 'update sends expectedUpdatedAt');
    assert(row.teacherComment === 'new', 'fresh save updates comment');
    store.results = [{ id: 'r-1', examInstanceId: 'ei', studentId: 's1', answers: {}, updatedAt: 't1' }];
    fakeRepo.remote.updatedAt = 't-other';
    return store.saveStudentAnswers({
      examInstanceId: 'ei',
      studentId: 's1',
      answers: { [q1.id]: '3' },
      teacherComment: 'stale',
      questions: [q1],
    }).then(
      () => { throw new Error('stale save must fail'); },
      (err) => {
        assert(err.code === SAT.RepositoryErrorCodes.STALE, 'stale store save is rejected');
      }
    );
  }).then(() => {
    const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
    assert(rendererSrc.includes('SAT.CURRENT_CLASS_LABEL'), 'student results uses current class label');
    assert(rendererSrc.includes('SAT.HISTORICAL_EXAM_CLASS_LABEL'), 'history table uses historical class label');
    assert(rendererSrc.includes('SAT.formatCurrentClassCaption'), 'student header prints current class');
    assert(!/class_id\s*=\s*.*current/.test(rendererSrc), 'renderer does not remap historical class_id');

    const analyticsSrc = readFileSync(join(root, 'js/cloud-analytics.js'), 'utf8');
    assert(analyticsSrc.includes('className: context.className'), 'history className stays on ExamInstance context');

    const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
    assert(appSrc.includes('refreshCloudStores'), 'explicit cloud refresh exists');
    assert(appSrc.includes("reason: 'visibility'"), 'visibility refresh exists');
    assert(appSrc.includes("reason: 'manual'"), 'header refresh exists');
    assert(!/supabase\.channel|realtime/i.test(appSrc), 'app does not add Realtime');

    const gateSrc = readFileSync(join(root, 'js/auth-gate.js'), 'utf8');
    assert(gateSrc.includes('isolateCloudSession'), 'account switch isolates session');
    assert(gateSrc.includes('shouldResetCloudSessionOnBootKeyChange'), 'boot key change resets before init');

    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert(html.includes('js/p8-ux-contract.js'), 'p8 contract is loaded');
    assert(html.includes('data-action="refresh-cloud"'), 'header has refresh control');

    const repoSrc = readFileSync(join(root, 'js/cloud-repository.js'), 'utf8');
    assert(repoSrc.includes('expectedUpdatedAt'), 'updateResult can pin updated_at');
    assert(!/service_role/.test(repoSrc), 'repository still has no service_role');
  });
}

async function runP8cLogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/cloud-repository.js',
    'js/enrollment-view.js',
    'js/p8-ux-contract.js',
    'js/cloud-academic-store.js',
    'js/assessment-view.js',
    'js/cloud-assessment-store.js',
    'js/result-view.js',
    'js/cloud-result-store.js',
  ]);

  const q1 = { id: '11111111-1111-1111-1111-111111111111', number: 1, gradingType: 'choice', correctAnswer: '1', points: 1 };

  assert(SAT.shouldPinAnswerDraftBase(null) === true, 'first hydrate pins draft base');
  assert(SAT.shouldPinAnswerDraftBase({ q: '1' }) === false, 'later hydrate does not repin');
  assert(SAT.resolveDraftBaseUpdatedAt({ updatedAt: 't1' }) === 't1', 'existing result pins T1');
  assert(SAT.resolveDraftBaseUpdatedAt(null) === null, 'new result pin is null');

  const pinned = SAT.keepAnswerDraftAfterStoreRefresh(
    { currentAnswers: { q: 'draft-t1' }, draftBaseUpdatedAt: 't1' },
    { updatedAt: 't2', answers: { q: 'store-t2' } }
  );
  assert(pinned.draftBaseUpdatedAt === 't1', 'background store T2 does not promote draft base');
  assert(pinned.currentAnswers.q === 'draft-t1', 'background store T2 does not replace draft answers');
  assert(pinned.storeUpdatedAt === 't2', 'store may still hold T2');

  const capture = { updates: [] };
  const fakeRepo = {
    remote: {
      id: 'r-1',
      examInstanceId: 'ei',
      studentId: 's1',
      answers: { [q1.id]: '1' },
      teacherComment: 'old',
      updatedAt: 't1',
    },
    async getResult() { return { ...this.remote }; },
    async updateResult(id, patch, options) {
      capture.updates.push({ id, patch, options });
      if (options?.expectedUpdatedAt && options.expectedUpdatedAt !== this.remote.updatedAt) {
        throw SAT.createResultStaleConflictError();
      }
      this.remote = { ...this.remote, ...patch, updatedAt: 't2' };
      return { ...this.remote };
    },
    async createResult(data) {
      capture.created = data;
      return {
        id: 'r-new',
        examInstanceId: data.examInstanceId,
        studentId: data.studentId,
        answers: data.answers,
        teacherComment: data.teacherComment,
        updatedAt: 't-created',
      };
    },
  };

  const store = new SAT.CloudResultStore(fakeRepo, { getState: () => ({ user: { id: 'u1' } }) });
  store.results = [{ ...fakeRepo.remote, updatedAt: 't2' }];
  fakeRepo.remote.updatedAt = 't2';
  await store.saveStudentAnswers({
    examInstanceId: 'ei',
    studentId: 's1',
    answers: { [q1.id]: '9' },
    teacherComment: 'stale-draft',
    questions: [q1],
    draftBaseUpdatedAt: 't1',
  }).then(
    () => { throw new Error('refresh then save must be STALE'); },
    (err) => {
      assert(err.code === SAT.RepositoryErrorCodes.STALE, 'draft T1 vs remote T2 is STALE');
      assert(capture.updates.length === 0, 'stale draft does not UPDATE with T2 token');
    }
  );

  store.results = [{ id: 'r-1', examInstanceId: 'ei', studentId: 's1', answers: {}, updatedAt: 't1' }];
  fakeRepo.remote.updatedAt = 't2';
  await store.saveStudentAnswers({
    examInstanceId: 'ei',
    studentId: 's1',
    answers: { [q1.id]: '8' },
    teacherComment: 'stale-no-refresh',
    questions: [q1],
    draftBaseUpdatedAt: 't1',
  }).then(
    () => { throw new Error('store T1 / remote T2 must be STALE'); },
    (err) => {
      assert(err.code === SAT.RepositoryErrorCodes.STALE, 'save without refresh still STALE when remote T2');
    }
  );

  fakeRepo.remote.updatedAt = 't1';
  store.results = [{ ...fakeRepo.remote }];
  const first = await store.saveStudentAnswers({
    examInstanceId: 'ei',
    studentId: 's1',
    answers: { [q1.id]: '2' },
    teacherComment: 'ok',
    questions: [q1],
    draftBaseUpdatedAt: 't1',
  });
  assert(first.updatedAt === 't2', 'normal save returns T2');
  assert(capture.updates.at(-1).options.expectedUpdatedAt === 't1', 'normal save pins T1 on UPDATE');
  assert(SAT.nextDraftBaseUpdatedAtAfterSave(first) === 't2', 'successful save promotes draft base to T2');

  const second = await store.saveStudentAnswers({
    examInstanceId: 'ei',
    studentId: 's1',
    answers: { [q1.id]: '3' },
    teacherComment: 'ok2',
    questions: [q1],
    draftBaseUpdatedAt: 't2',
  });
  assert(capture.updates.at(-1).options.expectedUpdatedAt === 't2', 'second save uses own T2 base');
  assert(second.updatedAt === 't2', 'own follow-up save is accepted');

  const createStore = new SAT.CloudResultStore({
    async createResult(data) {
      return { id: 'r-new', ...data, updatedAt: 't-created' };
    },
    async updateResult() { throw new Error('new result must insert'); },
  }, { getState: () => ({ user: { id: 'u1' } }) });
  const created = await createStore.saveStudentAnswers({
    examInstanceId: 'ei',
    studentId: 's-new',
    answers: { [q1.id]: '1' },
    teacherComment: '',
    questions: [q1],
    draftBaseUpdatedAt: null,
  });
  assert(created.id === 'r-new', 'new result inserts');
  assert(SAT.nextDraftBaseUpdatedAtAfterSave(created) === 't-created', 'new result pin becomes returned updatedAt');

  const teacherA = { id: 'teacher-a', role: 'teacher', active: true };
  const teacherB = { id: 'teacher-b', role: 'teacher', active: true };
  const admin = { id: 'admin-1', role: 'admin', active: true };
  const oldClass = { id: 'class-old', ownerId: 'teacher-a' };
  const newClass = { id: 'class-new', ownerId: 'teacher-b' };
  const sameOwnerOld = { id: 'class-old', ownerId: 'teacher-a' };
  const sameOwnerNew = { id: 'class-new', ownerId: 'teacher-a' };
  const studentNowB = { id: 'stu-x', ownerId: 'teacher-b', classId: 'class-new' };
  const studentSameA = { id: 'stu-y', ownerId: 'teacher-a', classId: 'class-new' };

  assert(SAT.canWriteCloudResult({
    profile: teacherA,
    actorId: 'teacher-a',
    student: studentNowB,
    examClass: oldClass,
  }) === false, 'teacher A cannot write after losing student owner');
  assert(SAT.canWriteCloudResult({
    profile: teacherB,
    actorId: 'teacher-b',
    student: studentNowB,
    examClass: oldClass,
  }) === false, 'teacher B cannot write old class result');
  assert(SAT.canWriteCloudResult({
    profile: admin,
    actorId: 'admin-1',
    student: studentNowB,
    examClass: oldClass,
  }) === true, 'admin can write historical result');
  assert(SAT.canWriteCloudResult({
    profile: teacherA,
    actorId: 'teacher-a',
    student: studentSameA,
    examClass: sameOwnerOld,
  }) === true, 'same-owner class transfer stays writable');
  assert(studentSameA.classId !== sameOwnerOld.id, 'same-owner case still has class mismatch');
  assert(SAT.canWriteCloudResult({
    profile: teacherA,
    actorId: 'teacher-a',
    student: studentSameA,
    examClass: sameOwnerNew,
  }) === true, 'same owner current class remains writable');

  assert(SAT.classifyEmptyResultUpdate({
    baseUpdatedAt: 't1',
    remote: { updatedAt: 't2' },
  }) === SAT.RepositoryErrorCodes.STALE, '0-row + newer remote is STALE');
  assert(SAT.classifyEmptyResultUpdate({
    baseUpdatedAt: 't1',
    remote: { updatedAt: 't1' },
  }) === SAT.RepositoryErrorCodes.WRITE_FORBIDDEN, '0-row + same remote version is WRITE_FORBIDDEN');
  assert(SAT.classifyEmptyResultUpdate({
    baseUpdatedAt: 't1',
    remote: null,
  }) === SAT.RepositoryErrorCodes.NOT_FOUND, '0-row + missing remote is NOT_FOUND');

  const forbidden = SAT.createResultWriteForbiddenError();
  assert(forbidden.code === SAT.RepositoryErrorCodes.WRITE_FORBIDDEN, 'WRITE_FORBIDDEN code');
  assert(SAT.formatRepositoryUserMessage(forbidden) === SAT.RESULT_WRITE_FORBIDDEN_MESSAGE, 'freeze message is read-only not stale');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(rendererSrc.includes('SAT.RESULT_READONLY_HINT'), 'answer entry shows read-only hint');
  assert(rendererSrc.includes('canWriteSelectedResult'), 'answer entry uses owner write check');
  assert(!rendererSrc.includes('currentClassId'), 'read-only does not use current_class_id');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes('draftBaseUpdatedAt: this.state.draftBaseUpdatedAt'), 'save passes pinned draft base');
  assert(appSrc.includes('draftBaseUpdatedAt = SAT.resolveDraftBaseUpdatedAt'), 'hydrate pins existing updatedAt');
  assert(appSrc.includes('detectAnswerEntryRemoteChange'), 'refresh can notice remote change without replacing draft');
}

function runP9aLogicTests() {
  const SAT = loadSat([
    'js/help-guide.js',
    'js/p8-ux-contract.js',
    'js/p9a-ux-contract.js',
  ]);

  assert(SAT.formatRoleDisplayLabel('admin') === '관리자', 'admin role display is Korean');
  assert(SAT.formatRoleDisplayLabel('teacher') === '강사', 'teacher role display is Korean');
  assert(SAT.formatRoleDisplayLabel('admin') !== 'admin', 'raw admin role is not shown');
  assert(SAT.formatSessionLabel('Kim', 'teacher') === 'Kim · 강사', 'session label uses Korean role');

  assert(SAT.formatAssessmentStatusLabel('draft') === '초안', 'draft displays as 초안');
  assert(SAT.formatAssessmentStatusLabel('published') === '공개됨', 'published displays as 공개됨');
  assert(SAT.formatAssessmentStatusLabel('archived') === '보관됨', 'archived displays as 보관됨');
  assert(SAT.formatAssessmentStatusLabel('draft') !== 'draft', 'raw draft status is not shown');

  assert(SAT.normalizeStudentResultView() === SAT.STUDENT_RESULT_VIEW_COUNSELING, 'student result default stays counseling');
  assert(SAT.resolveExamOverviewView({}) === SAT.STUDENT_RESULT_VIEW_TEACHER, 'missing exam view defaults to teacher');
  assert(SAT.resolveExamOverviewView({ examOverviewView: SAT.STUDENT_RESULT_VIEW_TEACHER }) === SAT.STUDENT_RESULT_VIEW_TEACHER, 'exam overview default teacher');
  assert(SAT.resolveExamOverviewView({ examOverviewView: SAT.STUDENT_RESULT_VIEW_COUNSELING }) === SAT.STUDENT_RESULT_VIEW_COUNSELING, 'exam overview can switch to counseling');
  assert(SAT.isExamOverviewTeacherView({ examOverviewView: SAT.STUDENT_RESULT_VIEW_TEACHER }) === true, 'exam overview teacher helper');
  assert(SAT.isTeacherStudentResultView(SAT.STUDENT_RESULT_VIEW_COUNSELING) === false, 'student counseling is not teacher');

  assert(SAT.RESULT_STALE_NOTICE.includes('그대로 남아 있습니다'), 'stale notice says draft stays on screen');
  assert(SAT.RESULT_STALE_REFRESH_HINT.includes('사라집니다'), 'restart hint warns draft will be discarded');
  assert(!SAT.RESULT_STALE_REFRESH_HINT.includes('다시 불러오기'), 'stale recovery does not claim header refresh replaces draft');
  assert(!SAT.RESULT_STALE_REFRESH_HINT.includes('새로고침'), 'stale recovery does not ask for full page reload');
  assert(SAT.RESULT_READONLY_HINT.includes('읽기 전용'), 'read-only hint constant reused');
  assert(!SAT.RESULT_READONLY_STATUS_BODY.includes('항상'), 'read-only body does not say always locked');

  const helpHtml = SAT.renderHelpModalShell();
  assert(!/localStorage에 저장/.test(helpHtml), 'help does not say academic data lives in localStorage');
  assert(!/서버로 전송되지 않습니다/.test(helpHtml), 'help does not say data is not sent to a server');
  assert(!/CSV보내기/.test(helpHtml), 'help does not advertise CSV export');
  assert(!/인쇄 버튼/.test(helpHtml), 'help does not claim print already works');
  assert(helpHtml.includes('Google 계정'), 'help covers Google login');
  assert(helpHtml.includes('다시 불러오기'), 'help covers refresh');
  assert(helpHtml.includes('최신 저장본으로 다시 시작'), 'help conflict recovery uses restart action');
  assert(helpHtml.includes('아직 없습니다'), 'help lists missing features');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(!rendererSrc.includes('Enrollment(등록)'), 'renderer dropped Enrollment jargon');
  assert(!rendererSrc.includes('current_class_id'), 'renderer dropped current_class_id jargon');
  assert(!rendererSrc.includes('Assessment 만들기'), 'renderer dropped Assessment create label');
  assert(!rendererSrc.includes('P5B_TEST'), 'renderer dropped P5B placeholder');
  assert(!rendererSrc.includes('P6에서'), 'renderer dropped P6 copy');
  assert(rendererSrc.includes('status-alert--warning'), 'stale notice uses warning alert');
  assert(rendererSrc.includes('badge--readonly'), 'read-only uses distinct badge');
  assert(rendererSrc.includes('isExamOverviewTeacherView'), 'exam overview uses separate view helper');
  assert(rendererSrc.includes('문제집 만들기'), 'create label is 문제집 만들기');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes('examOverviewView: STUDENT_RESULT_VIEW_TEACHER'), 'exam overview starts as teacher view');
  assert(appSrc.includes('studentResultView: STUDENT_RESULT_VIEW_COUNSELING'), 'student result stays counseling default');

  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert(html.includes('js/p9a-ux-contract.js'), 'p9a contract is loaded');
  assert(html.includes('app-header__tools'), 'header tools group exists');
  assert(!html.includes('장기 분석은 다음 단계'), 'auth hint dropped development copy');
}

async function runP9a1LogicTests() {
  const SAT = loadSat([
    'js/help-guide.js',
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/enrollment-view.js',
    'js/p8-ux-contract.js',
    'js/p9a-ux-contract.js',
    'js/result-view.js',
    'js/cloud-result-store.js',
  ]);

  assert(SAT.shouldShowRestartFromRemoteButton({ notice: false, canWrite: true }) === false, 'no button without stale notice');
  assert(SAT.shouldShowRestartFromRemoteButton({ notice: true, canWrite: true }) === true, 'button when stale and writable');
  assert(SAT.shouldShowRestartFromRemoteButton({ notice: true, canWrite: false }) === false, 'no restart button on read-only');
  assert(SAT.isResultStaleConflictError({ code: SAT.RepositoryErrorCodes.STALE }) === true, 'STALE save error is conflict');
  assert(SAT.isResultStaleConflictError({ code: SAT.RepositoryErrorCodes.WRITE_FORBIDDEN }) === false, 'WRITE_FORBIDDEN is not restart conflict');

  const draft = {
    currentAnswers: { q1: '4' },
    draftBaseUpdatedAt: 't1',
    resultRemoteChangedNotice: true,
  };
  const cancelled = SAT.keepAnswerDraftAfterRestartCancel(draft);
  assert(cancelled.currentAnswers.q1 === '4', 'cancel keeps draft answers');
  assert(cancelled.draftBaseUpdatedAt === 't1', 'cancel keeps draft base');
  assert(cancelled.resultRemoteChangedNotice === true, 'cancel keeps stale notice');

  const failed = SAT.keepAnswerDraftAfterRestartFailure(draft);
  assert(failed.currentAnswers.q1 === '4', 'failed refetch keeps draft');
  assert(failed.draftBaseUpdatedAt === 't1', 'failed refetch keeps base');
  assert(failed.resultRemoteChangedNotice === true, 'failed refetch keeps notice');

  const remote = {
    id: 'r-1',
    examInstanceId: 'ei',
    studentId: 's1',
    answers: { q1: '2' },
    updatedAt: 't2',
  };
  const restarted = SAT.buildRestartedAnswerDraftFromRemote(remote);
  assert(restarted.currentAnswers.q1 === '2', 'success hydrates remote answers');
  assert(restarted.draftBaseUpdatedAt === 't2', 'success pins remote updatedAt');
  assert(restarted.resultRemoteChangedNotice === false, 'success clears notice');
  assert(restarted.currentAnswers !== remote.answers, 'hydrated answers are a copy');

  const q1 = { id: '11111111-1111-1111-1111-111111111111', number: 1, gradingType: 'choice', correctAnswer: '1', points: 1 };
  const otherRow = {
    id: 'r-other',
    examInstanceId: 'ei',
    studentId: 's2',
    answers: { [q1.id]: '3' },
    updatedAt: 'keep',
  };
  const staleRow = {
    id: 'r-1',
    examInstanceId: 'ei',
    studentId: 's1',
    answers: { [q1.id]: '1' },
    updatedAt: 't1',
  };
  const latest = {
    ...staleRow,
    answers: { [q1.id]: '2' },
    updatedAt: 't2',
    teacherComment: 'from A',
  };
  const fakeRepo = {
    latest,
    async getResult(id) {
      if (id !== 'r-1') throw new Error(`unexpected getResult ${id}`);
      return { ...this.latest };
    },
    async getResultForStudentInstance(studentId, examInstanceId) {
      if (studentId === 's1' && examInstanceId === 'ei') return { ...this.latest };
      return null;
    },
    async updateResult(id, patch, options) {
      this.lastUpdate = { id, patch, options };
      return {
        ...this.latest,
        ...patch,
        updatedAt: 't3',
      };
    },
  };
  const store = new SAT.CloudResultStore(fakeRepo, { getState: () => ({ user: { id: 'u1' } }) });
  store.results = [{ ...staleRow }, { ...otherRow }];
  const reloaded = await store.reloadOneResult({
    studentId: 's1',
    examInstanceId: 'ei',
    resultId: 'r-1',
  });
  assert(reloaded.updatedAt === 't2', 'reload returns latest remote');
  assert(store.getResultForStudentInstance('s1', 'ei').updatedAt === 't2', 'store row replaced');
  assert(store.getResultForStudentInstance('s2', 'ei').updatedAt === 'keep', 'other student result untouched');

  const failRepo = {
    async getResult() { return null; },
    async getResultForStudentInstance() { return null; },
  };
  const failStore = new SAT.CloudResultStore(failRepo, { getState: () => ({ user: { id: 'u1' } }) });
  failStore.results = [{ ...staleRow }, { ...otherRow }];
  await failStore.reloadOneResult({
    studentId: 's1',
    examInstanceId: 'ei',
    resultId: 'r-1',
  }).then(
    () => { throw new Error('missing remote must fail'); },
    (err) => {
      assert(err.code === SAT.RepositoryErrorCodes.NOT_FOUND, 'missing remote is NOT_FOUND');
    }
  );
  assert(failStore.getResultForStudentInstance('s1', 'ei').updatedAt === 't1', 'failed reload does not replace row');
  assert(failStore.getResultForStudentInstance('s2', 'ei').updatedAt === 'keep', 'failed reload leaves other rows');

  const saved = await store.saveStudentAnswers({
    examInstanceId: 'ei',
    studentId: 's1',
    answers: { [q1.id]: '4' },
    teacherComment: 'after restart',
    questions: [q1],
    draftBaseUpdatedAt: 't2',
  });
  assert(fakeRepo.lastUpdate.options.expectedUpdatedAt === 't2', 'save after restart uses remote pin');
  assert(saved.updatedAt === 't3', 'save after restart succeeds');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(rendererSrc.includes('restart-answer-from-remote'), 'answer entry has restart action');
  assert(rendererSrc.includes('const restartControls = canWrite'), 'restart markup stays in notice when writable');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes('reloadOneResult'), 'app refetches one result');
  assert(appSrc.includes('RESULT_RESTART_FROM_REMOTE_CONFIRM'), 'app requires confirm');
  assert(appSrc.includes('hydrateAnswerDraftFromExisting()'), 'success reuses hydrate');
  assert(appSrc.includes('revealAnswerEntryStaleConflict'), 'STALE save reveals conflict UI');
  assert(!appSrc.includes('refreshCloudStores({ reason: \'restart\''), 'restart does not use refreshCloudStores');
}

function runP9bLogicTests() {
  const SAT = loadSat([
    'js/p9a-ux-contract.js',
    'js/p9b-ux-contract.js',
  ]);

  const classes = [
    { id: 'class-a', name: 'DSC4 화목', archived: false },
    { id: 'class-b', name: 'LSA1 월수금', archived: false },
    { id: 'class-archived', name: '옛 반', archived: true },
  ];

  assert(SAT.rememberSharedClassId('class-a', classes) === 'class-a', 'accessible class is stored');
  assert(SAT.resolveSharedClassId('class-a', classes) === 'class-a', 'accessible class resolves');

  const toAnswer = SAT.applySharedClassToScreenState({
    view: 'answer-entry',
    sharedClassId: 'class-a',
    classes,
    answerEntry: { classId: '', examId: '', studentId: '' },
    studentResults: { classId: '', studentId: 'stu-keep' },
    examOverviewFilters: { classId: '', level: '' },
  });
  assert(toAnswer.answerEntry.classId === 'class-a', 'answer entry uses shared class');
  assert(toAnswer.answerEntry.examId === '', 'exam id is not auto-shared');
  assert(toAnswer.answerEntry.studentId === '', 'student id is not auto-shared');
  assert(toAnswer.studentResults.studentId === 'stu-keep', 'other screen student stays until that view applies');

  const toStudent = SAT.applySharedClassToScreenState({
    view: 'student-results',
    sharedClassId: 'class-a',
    classes,
    answerEntry: { classId: 'class-a', examId: 'exam-1', studentId: 'stu-1' },
    studentResults: { classId: '', studentId: '' },
    examOverviewFilters: { classId: '', level: '' },
  });
  assert(toStudent.studentResults.classId === 'class-a', 'student results uses shared class');
  assert(toStudent.studentResults.studentId === '', 'student results does not copy student id');
  assert(toStudent.answerEntry.examId === 'exam-1', 'answer exam stays on its own screen state');

  const toExam = SAT.applySharedClassToScreenState({
    view: 'exam-overview',
    sharedClassId: 'class-a',
    classes,
    answerEntry: { classId: 'class-a', examId: 'exam-1', studentId: 'stu-1' },
    studentResults: { classId: 'class-a', studentId: 'stu-1' },
    examOverviewFilters: { classId: '', level: '' },
  });
  assert(toExam.examOverviewFilters.classId === 'class-a', 'exam overview uses shared class');
  assert(toExam.examOverviewClassChanged === true, 'exam overview class change is flagged');
  assert(toExam.studentResults.studentId === 'stu-1', 'student id is not copied into exam overview');

  const archived = SAT.applySharedClassToScreenState({
    view: 'answer-entry',
    sharedClassId: 'class-archived',
    classes,
    answerEntry: { classId: 'class-b', examId: 'exam-b', studentId: '' },
  });
  assert(SAT.isAccessibleSharedClass('class-archived', classes) === false, 'archived class is inaccessible');
  assert(archived.selectedClassId === null, 'archived shared class is cleared');
  assert(archived.answerEntry.classId === 'class-b', 'inaccessible shared falls back to current screen class');

  const missing = SAT.applySharedClassToScreenState({
    view: 'student-results',
    sharedClassId: 'class-gone',
    classes,
    studentResults: { classId: 'class-gone', studentId: 'stu-x' },
  });
  assert(missing.selectedClassId === null, 'missing class is not reused');
  assert(missing.studentResults.classId === '', 'inaccessible screen class falls back empty');
  assert(missing.studentResults.studentId === '', 'fallback clears student on that screen');

  const reset = SAT.clearSharedClassOnSessionReset({
    selectedClassId: 'class-a',
    examOverviewFilters: { classId: 'class-a', level: 'DSC' },
  });
  assert(reset.selectedClassId === null, 'session reset clears shared class');
  assert(reset.answerEntry.classId === '', 'session reset clears answer class');
  assert(reset.studentResults.classId === '', 'session reset clears student-results class');
  assert(reset.examOverviewFilters.classId === '', 'session reset clears exam-overview class');

  const draftKept = SAT.applySharedClassToScreenState({
    view: 'answer-entry',
    sharedClassId: 'class-b',
    classes,
    answerEntry: { classId: 'class-a', examId: 'exam-1', studentId: 'stu-1' },
    draft: {
      currentAnswers: { q1: '2' },
      draftBaseUpdatedAt: 't1',
      studentId: 'stu-1',
    },
  });
  assert(draftKept.answerEntry.classId === 'class-a', 'shared class does not overwrite draft class');
  assert(draftKept.answerEntry.examId === 'exam-1', 'shared class does not overwrite draft exam');
  assert(draftKept.answerEntry.studentId === 'stu-1', 'shared class does not overwrite draft student');
  assert(draftKept.selectedClassId === 'class-b', 'shared class can still remember the other class');

  const pinKept = SAT.applySharedClassToScreenState({
    view: 'answer-entry',
    sharedClassId: 'class-b',
    classes,
    answerEntry: { classId: 'class-a', examId: 'exam-1', studentId: '' },
    draft: { currentAnswers: null, draftBaseUpdatedAt: 't1', studentId: '' },
  });
  assert(pinKept.answerEntry.classId === 'class-a', 'pinned draft base blocks shared class overwrite');
  assert(pinKept.answerEntry.examId === 'exam-1', 'pinned draft keeps exam');

  assert(SAT.shouldShowTermManagementPanel({ isAdmin: false }) === false, 'teacher does not get term management');
  assert(SAT.shouldShowTermManagementPanel({ isAdmin: true }) === true, 'admin can manage terms');
  assert(SAT.dashboardWorkClasses(classes).every((c) => c.archived !== true), 'dashboard work classes exclude archived');
  assert(SAT.pageTitleForView('exams') === '시험 설정', 'exam page title matches nav');
  assert(SAT.pageTitleForView('backup') === '백업', 'backup page title matches nav');
  assert(SAT.pageTitleForView('classes') === '반·학생', 'classes page title matches nav');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(rendererSrc.includes('DASHBOARD_MY_CLASSES_TITLE'), 'dashboard shows my classes');
  assert(rendererSrc.includes('shouldShowTermManagementPanel'), 'term panel is admin-gated');
  assert(!/renderClasses[\s\S]{0,400}renderTermsPanel/.test(rendererSrc), 'classes page does not embed term table');
  assert(rendererSrc.includes('PAGE_TITLE_EXAMS'), 'exam page uses nav title');
  assert(rendererSrc.includes('PAGE_TITLE_BACKUP'), 'backup page uses nav title');
  assert(rendererSrc.includes('open-dashboard-answer-entry'), 'dashboard has answer-entry CTA');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes('applySharedClassContext'), 'navigate applies shared class');
  assert(appSrc.includes('rememberSharedClass'), 'screen class changes update shared class');
  assert(appSrc.includes('examOverviewFilters = { ...DEFAULT_UI_PREFS.examOverviewFilters }'), 'account reset clears exam overview class');
  assert(appSrc.includes('draftBaseUpdatedAt: this.state.draftBaseUpdatedAt'), 'shared apply receives draft pin');

  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert(html.includes('js/p9b-ux-contract.js'), 'p9b contract is loaded');
  assert(html.includes('data-view="exams">시험 설정'), 'nav label is 시험 설정');
  assert(html.includes('data-view="backup">백업'), 'nav label is 백업');
}

function runP9c1LogicTests() {
  const SAT = loadSat([
    'js/p9b-ux-contract.js',
    'js/p9c1-ux-contract.js',
  ]);

  const ws = SAT.normalizeClassWorkspace();
  assert(ws.showAddClass === false, 'add-class form starts closed');
  assert(ws.showClassManage === false, 'class management starts closed');
  assert(ws.showAddStudent === false, 'add-student form starts closed');
  assert(ws.managingStudentId === null, 'student management starts closed');

  const selected = SAT.classSelectorState({ classId: 'a', selectedClassId: 'a', archived: false });
  assert(selected.selected === true, 'selector marks current class selected');
  assert(SAT.classSelectorModifier(selected).includes('class-selector--selected'), 'selected visual class exists');
  const archived = SAT.classSelectorState({ classId: 'b', selectedClassId: 'a', archived: true });
  assert(archived.selected === false, 'other class is not selected');
  assert(SAT.classSelectorModifier(archived).includes('class-selector--archived'), 'archived visual class exists');

  const sorted = SAT.sortClassesForSelector([
    { id: 'old', name: '옛 반', archived: true },
    { id: 'new', name: '새 반', archived: false },
  ]);
  assert(sorted[0].id === 'new', 'active classes come before archived');

  assert(SAT.classRosterStudentCount([
    { id: 's1', classId: 'a', active: true },
    { id: 's2', classId: 'a', active: false },
    { id: 's3', classId: 'b', active: true },
  ], 'a') === 1, 'roster count uses active students in the selected class');

  assert(SAT.canAddStudentToSelectedClass({ archived: false }) === true, 'active class can add students');
  assert(SAT.canAddStudentToSelectedClass({ archived: true }) === false, 'archived class cannot add students');
  assert(SAT.shouldShowAddStudentForm({ showAddStudent: true }, { archived: true }) === false, 'archived class hides add-student form');
  assert(SAT.shouldShowStudentTransferAction({ isAdmin: false }) === false, 'teacher does not see transfer');
  assert(SAT.shouldShowStudentTransferAction({ isAdmin: true }) === true, 'admin sees transfer');
  assert(SAT.toggleStudentManageId({ managingStudentId: null }, 's1') === 's1', 'manage opens one student');
  assert(SAT.toggleStudentManageId({ managingStudentId: 's1' }, 's1') === null, 'manage toggles closed');

  const reset = SAT.classWorkspaceAfterSessionReset();
  assert(reset.showAddClass === false && reset.managingStudentId === null, 'session reset closes workspace panels');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(rendererSrc.includes('class-selector'), 'classes page uses class selector');
  assert(rendererSrc.includes('aria-pressed'), 'selector exposes pressed state');
  assert(rendererSrc.includes('toggle-class-manage'), 'class manage is secondary');
  assert(rendererSrc.includes('toggle-add-class'), 'add-class is behind a toggle');
  assert(rendererSrc.includes('toggle-add-student'), 'add-student is behind a toggle');
  assert(rendererSrc.includes('toggle-student-manage'), 'student manage is behind a toggle');
  assert(rendererSrc.includes('shouldShowStudentTransferAction'), 'transfer action stays admin-gated');
  assert(rendererSrc.includes('data-action="edit-class"'), 'edit-class action reused');
  assert(rendererSrc.includes('data-action="archive-class"'), 'archive-class action reused');
  assert(rendererSrc.includes('data-action="delete-class"'), 'delete-class action reused');
  assert(rendererSrc.includes('data-action="transfer-student"'), 'transfer-student action reused');
  assert(!/renderClasses[\s\S]{0,800}<table class="data-table">[\s\S]{0,200}이름 수정/.test(rendererSrc), 'class CRUD table is not the default list');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes('this.state.selectedClassId = id'), 'selector still writes selectedClassId');
  assert(appSrc.includes('classWorkspaceAfterSessionReset'), 'account switch resets workspace panels');
  assert(appSrc.includes('createClass({'), 'add class still uses createClass');
  assert(appSrc.includes('createStudentInClass({'), 'add student still uses createStudentInClass');
  assert(appSrc.includes('updateClassName(id'), 'edit class still uses updateClassName');
  assert(appSrc.includes('archiveClass(id, !cls.archived)'), 'archive class meaning unchanged');
  assert(appSrc.includes('deleteClass(id)'), 'delete class meaning unchanged');
  assert(appSrc.includes('transferStudentToClass({'), 'transfer handler meaning unchanged');
  assert(appSrc.includes('classWorkspaceAfterSelectClass'), 'switching class closes management panels');
  assert(!/selectClass\([\s\S]{0,240}currentAnswers/.test(appSrc), 'class select does not touch answer draft');

  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert(html.includes('js/p9c1-ux-contract.js'), 'p9c1 contract is loaded');
}

function runP9c2LogicTests() {
  const SAT = loadSat(['js/p9c2-ux-contract.js']);

  assert(SAT.shouldStartTeacherCommentCollapsed() === true, 'comment starts collapsed');
  assert(SAT.hasTeacherCommentText('') === false, 'empty comment is not present');
  assert(SAT.hasTeacherCommentText('잘했어요') === true, 'existing comment is detected');
  assert(SAT.teacherCommentToggleLabel({ hasComment: false, open: false }) === '교사 코멘트', 'closed empty comment label');
  assert(SAT.teacherCommentToggleLabel({ hasComment: true, open: false }) === '교사 코멘트 있음', 'closed existing comment label');
  assert(SAT.teacherCommentToggleLabel({ hasComment: true, open: true }) === '교사 코멘트 접기', 'open comment label');
  assert(SAT.ANSWER_PREV_QUESTION_LABEL === '이전 문항', 'prev label is question');
  assert(SAT.ANSWER_NEXT_QUESTION_LABEL === '다음 문항', 'next label is question');

  const progress = SAT.answerQuestionProgress(
    [{ id: 'q1', number: 1 }, { id: 'q2', number: 2 }],
    { q1: '2', q2: '' }
  );
  assert(progress.filled === 1 && progress.total === 2, 'progress counts filled answers');

  const fresh = SAT.answerEntrySaveStatus({ saved: null });
  assert(fresh.kind === 'new' && fresh.badge === '새 결과', 'new result status kept');
  const stored = SAT.answerEntrySaveStatus({ saved: { id: 'r1' }, scoreLine: '18/20' });
  assert(stored.kind === 'saved' && stored.badge === '저장됨', 'saved result status kept');
  assert(!String(stored.text).includes('updated'), 'status does not expose updated_at');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(rendererSrc.includes('answer-workspace'), 'answer entry uses compact workspace');
  assert(rendererSrc.includes('answer-comment-panel'), 'comment panel exists');
  assert(rendererSrc.includes('toggle-teacher-comment'), 'comment is collapsible');
  assert(rendererSrc.includes('ANSWER_PREV_QUESTION_LABEL'), 'prev question label used');
  assert(rendererSrc.includes('ANSWER_NEXT_QUESTION_LABEL'), 'next question label used');
  assert(rendererSrc.includes('restart-answer-from-remote'), 'stale recovery action remains');
  assert(rendererSrc.includes('status-alert--warning'), 'stale alert remains');
  assert(rendererSrc.includes('status-alert--readonly'), 'read-only alert remains');
  assert(rendererSrc.includes('badge--readonly'), 'read-only badge remains');
  assert(rendererSrc.includes('answer-mode-fast'), 'quick mode remains');
  assert(rendererSrc.includes('answer-mode-bulk'), 'bulk mode remains');
  assert(rendererSrc.includes('data-action="save-answers"'), 'save action remains');
  assert(rendererSrc.includes('data-action="save-and-next-student"'), 'save-next action remains');
  assert(rendererSrc.includes('result-teacher-comment'), 'comment field remains');
  assert(rendererSrc.includes('disabled'), 'read-only comment still can disable');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes('teacherCommentOpen: false'), 'comment open state defaults closed');
  assert(appSrc.includes('toggleTeacherCommentPanel'), 'comment toggle exists');
  assert(appSrc.includes('draftBaseUpdatedAt: this.state.draftBaseUpdatedAt'), 'save still pins draft base');
  assert(appSrc.includes('draftBaseUpdatedAt = SAT.resolveDraftBaseUpdatedAt'), 'hydrate pin unchanged');
  assert(!appSrc.includes('currentAnswers = SAT.answerQuestionProgress'), 'compact helpers do not rewrite answers');

  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert(html.includes('js/p9c2-ux-contract.js'), 'p9c2 contract is loaded');
}

function runP9dLogicTests() {
  const SAT = loadSat([
    'js/p8-ux-contract.js',
    'js/student-result-display-utils.js',
    'js/cloud-analytics.js',
    'js/p9d-ux-contract.js',
  ]);

  assert(SAT.PRINT_ACTION_LABEL === '인쇄', 'print action label is 인쇄');
  assert(SAT.formatPrintViewModeLabel(SAT.STUDENT_RESULT_VIEW_COUNSELING) === '상담용', 'counseling print mode');
  assert(SAT.formatPrintViewModeLabel(SAT.STUDENT_RESULT_VIEW_TEACHER) === '교사용', 'teacher print mode');
  assert(SAT.shouldIncludeClassAverageInPrint(SAT.STUDENT_RESULT_VIEW_COUNSELING) === false, 'counseling print hides class average');
  assert(SAT.shouldIncludeClassAverageInPrint(SAT.STUDENT_RESULT_VIEW_TEACHER) === true, 'teacher print allows comparison');

  const transferred = { id: 's1', name: '민수', englishName: 'Min', classId: 'cls-new' };
  const classes = [
    { id: 'cls-old', name: 'DSC4 화목' },
    { id: 'cls-new', name: 'LSA1 월수금' },
  ];
  const meta = SAT.buildStudentResultPrintMeta({
    student: transferred,
    classes,
    termName: '2026-2',
    view: SAT.STUDENT_RESULT_VIEW_COUNSELING,
    printedAt: new Date('2026-09-25T00:00:00'),
  });
  assert(meta.displayName === '민수 (Min)', 'print name includes english name');
  assert(meta.currentClassName === 'LSA1 월수금', 'print header uses current class');
  assert(meta.currentClassCaption === '현재 반: LSA1 월수금', 'current class caption stays on enrollment');
  assert(meta.includeClassAverage === false, 'counseling meta has no class average');
  assert(meta.printedAt === '2026-09-25', 'print date is formatted');

  const teacherMeta = SAT.buildStudentResultPrintMeta({
    student: transferred,
    classes,
    view: SAT.STUDENT_RESULT_VIEW_TEACHER,
  });
  assert(teacherMeta.includeClassAverage === true, 'teacher print meta allows comparison');
  assert(SAT.keepHistoricalExamClass('DSC4 화목') === 'DSC4 화목', 'historical class is kept');
  assert(SAT.keepHistoricalExamClass('DSC4 화목') !== meta.currentClassName, 'historical class is not rewritten to current class');
  assert(SAT.formatPrintHistoryLine({
    administeredDate: '2026-09-10',
    className: 'DSC4 화목',
  }, '85점') === '2026-09-10 · DSC4 화목 · 85점', 'history line keeps exam-time class');

  assert(SAT.shouldShowStudentPrintAction({ student: transferred }) === true, 'print action visible for selected student');
  assert(SAT.shouldShowStudentPrintAction({}) === false, 'print action hidden without student');
  assert(SAT.shouldShowExamPrintAction({ instance: { id: 'ei-1' } }) === true, 'exam print visible when instance selected');
  assert(SAT.shouldShowExamPrintAction({}) === false, 'exam print hidden without instance');

  assert(SAT.isPrintHiddenControl('btn btn-primary no-print') === true, 'no-print control is filtered');
  assert(SAT.isPrintHiddenControl('app-nav') === true, 'nav is print-hidden');
  assert(SAT.isPrintHiddenControl('card student-results-print') === false, 'result content is not print-hidden');

  assert(SAT.shouldPrintOverallTrend(0) === false, '0 results hide print trend');
  assert(SAT.shouldPrintOverallTrend(1) === false, '1 result hides print trend');
  assert(SAT.shouldPrintOverallTrend(2) === true, '2+ results show print trend');
  assert(SAT.shouldPrintSecondaryCategorySection([]) === false, 'empty middle section is print-hidden');
  assert(SAT.shouldPrintSecondaryCategorySection([{ middle: 'Tense', totalPoints: 4 }]) === true, 'filled middle section prints');
  assert(SAT.shouldPrintMajorTrendChart() === false, 'major trend chart is excluded from print');
  assert(SAT.shouldPrepareChartWrapperForPrint('chart-wrapper print-omit') === false, 'print-omit wrapper is not exported');
  assert(SAT.shouldPrepareChartWrapperForPrint('chart-wrapper') === true, 'visible chart wrapper can print');
  assert(SAT.PRINT_BROWSER_HEADER_HINT.includes('머리글과 바닥글'), 'browser header/footer hint exists');

  assert(SAT.shouldShowPrintCommentSection([]) === false, 'empty comment section stays hidden');
  assert(SAT.shouldShowPrintCommentSection([{ teacherComment: '   ' }]) === false, 'whitespace comment is empty');
  assert(SAT.shouldShowPrintCommentSection([{ teacherComment: '잘했어요' }]) === true, 'non-empty comment is included');

  const history = [
    { resultId: 'r-old', className: 'DSC4 화목', studentId: 's1' },
    { resultId: 'r-new', className: 'LSA1 월수금', studentId: 's1' },
  ];
  assert(SAT.resolvePrintSelectedHistoryRow(history, 'r-old')?.className === 'DSC4 화목', 'selected historical class stays exam-time class');
  assert(SAT.resolvePrintSelectedHistoryRow(history, 'missing') === null, 'unknown selection is ignored');
  assert(SAT.resolvePrintSelectedHistoryRow(history, null) === null, 'no selection stays history-centric');

  const examMeta = SAT.buildExamResultPrintMeta({
    instance: { assessmentTitle: 'CQ 9월', administeredDate: '2026-09-24' },
    className: 'LSA1 월수금',
    view: SAT.STUDENT_RESULT_VIEW_TEACHER,
    printedAt: new Date('2026-09-25T00:00:00'),
  });
  assert(examMeta.includeClassAverage === true, 'exam teacher print can include averages');
  assert(SAT.buildExamResultPrintMeta({
    instance: { assessmentTitle: 'CQ 9월' },
    view: SAT.STUDENT_RESULT_VIEW_COUNSELING,
  }).includeClassAverage === false, 'exam counseling print hides averages');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(rendererSrc.includes("renderPrintActionButton('print-results')"), 'student result has print action');
  assert(rendererSrc.includes("renderPrintActionButton('print-exam-overview')"), 'exam result has print action');
  assert(rendererSrc.includes('student-results-print'), 'student result uses print wrapper');
  assert(rendererSrc.includes('print-header--student'), 'student print header exists');
  assert(rendererSrc.includes('exam-overview-print'), 'exam result uses print class');
  assert(rendererSrc.includes('SAT.formatCurrentClassCaption'), 'student header still uses current class');
  assert(rendererSrc.includes('SAT.HISTORICAL_EXAM_CLASS_LABEL'), 'history table still uses exam-time class');
  assert(rendererSrc.includes('shouldShowPrintCommentSection'), 'empty teacher comment section is gated');
  assert(rendererSrc.includes('shouldPrintOverallTrend'), 'print trend uses min-result helper');
  assert(rendererSrc.includes('shouldPrintSecondaryCategorySection'), 'empty middle section uses print helper');
  assert(rendererSrc.includes('shouldPrintMajorTrendChart'), 'major trend print exclusion is wired');
  assert(rendererSrc.includes('PRINT_BROWSER_HEADER_HINT'), 'print button carries browser header hint');
  assert(rendererSrc.includes('class="btn btn-primary no-print" data-action="open-answer-entry"'), 'exam action button is no-print');
  assert(!/class_id\s*=\s*.*current/.test(rendererSrc), 'renderer does not remap historical class_id');

  const chartSrc = readFileSync(join(root, 'js/chart-manager.js'), 'utf8');
  assert(chartSrc.includes('student-results-print'), 'chart print helper marks cloud student print');
  assert(chartSrc.includes('prepareChartsForPrint'), 'existing chart print helper reused');
  assert(chartSrc.includes('shouldPrepareChartWrapperForPrint'), 'chart export skips print-omit wrappers');

  const css = readFileSync(join(root, 'css/styles.css'), 'utf8');
  assert(css.includes('@media print'), 'print stylesheet exists');
  assert(css.includes('.no-print'), 'no-print hide rule exists');
  assert(css.includes('size: A4 portrait'), 'A4 portrait print page');
  assert(css.includes('.print-omit'), 'print-omit hides empty or duplicate print blocks');

  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert(html.includes('js/p9d-ux-contract.js'), 'p9d contract is loaded');
  assert(html.includes('class="app-header no-print"'), 'global header stays no-print');
}

function runP99LogicTests() {
  const SAT = loadSat([
    'js/auth-manager.js',
    'js/p9a-ux-contract.js',
    'js/p9b-ux-contract.js',
    'js/p9c1-ux-contract.js',
  ]);

  assert(SAT.isAdminRole('admin') === true, 'admin is an admin role');
  assert(SAT.isAdminRole('system_admin') === true, 'system_admin is an admin role');
  assert(SAT.isAdminRole('teacher') === false, 'teacher is not an admin role');
  assert(SAT.isAdmin({ role: 'admin', active: false }) === true, 'isAdmin stays role-only for admin');
  assert(SAT.isAdmin({ role: 'system_admin', active: false }) === true, 'isAdmin is role-only for system_admin');
  assert(SAT.isAdmin({ role: 'teacher', active: true }) === false, 'teacher is not admin');

  assert(SAT.canEditCurriculum({ role: 'admin', active: true }) === true, 'admin curriculum visible');
  assert(SAT.canEditCurriculum({ role: 'system_admin', active: true }) === true, 'system_admin curriculum visible');
  assert(SAT.canEditCurriculum({ role: 'teacher', active: true, can_edit_curriculum: true }) === false, 'teacher curriculum hidden');
  assert(SAT.canEditCurriculum({ role: 'system_admin', active: false }) === false, 'inactive system_admin cannot author');

  assert(SAT.shouldShowTermManagementPanel({ isAdmin: SAT.isAdmin({ role: 'system_admin' }) }) === true, 'system_admin sees term panel');
  assert(SAT.shouldShowStudentTransferAction({ isAdmin: SAT.isAdmin({ role: 'system_admin' }) }) === true, 'system_admin sees transfer');
  assert(SAT.shouldShowStudentTransferAction({ isAdmin: SAT.isAdmin({ role: 'teacher' }) }) === false, 'teacher transfer stays hidden');
  assert(SAT.shouldShowTermManagementPanel({ isAdmin: SAT.isAdmin({ role: 'admin' }) }) === true, 'admin term panel unchanged');

  assert(SAT.formatRoleDisplayLabel('system_admin') === '시스템 관리자', 'system_admin label is Korean');
  assert(SAT.formatRoleDisplayLabel('admin') === '관리자', 'admin label unchanged');
  assert(SAT.formatRoleDisplayLabel('teacher') === '강사', 'teacher label unchanged');
  assert(SAT.formatSessionLabel('Kim', 'system_admin') === 'Kim · 시스템 관리자', 'session shows 시스템 관리자');
  assert(!SAT.formatRoleDisplayLabel('system_admin').includes('system_admin'), 'raw system_admin is not shown');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(!rendererSrc.includes('system_admin'), 'renderer does not print raw system_admin');
  assert(rendererSrc.includes('isCloudAdmin'), 'admin UI still uses isCloudAdmin');
  assert(rendererSrc.includes('canEditCurriculum'), 'curriculum UI still uses canEditCurriculum');
  assert(rendererSrc.includes('shouldShowStudentTransferAction'), 'transfer UI stays helper-gated');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes('resetCloudSession'), 'account switch still resets cloud session');
  assert(appSrc.includes('SAT.isAdmin(this.store?.currentProfile?.())'), 'isCloudAdmin follows current profile');

  const gateSrc = readFileSync(join(root, 'js/auth-gate.js'), 'utf8');
  assert(gateSrc.includes('isolateCloudSession'), 'role switch isolates session');
  assert(gateSrc.includes('formatSessionLabel'), 'header uses display label helper');

  const helpers = readFileSync(join(root, 'supabase/migrations/003_domain_helpers.sql'), 'utf8');
  const adminFn = helpers.slice(
    helpers.indexOf('create or replace function public.is_tracker_admin()'),
    helpers.indexOf('create or replace function public.can_edit_tracker_curriculum()')
  );
  assert(adminFn.includes("role in ('admin', 'system_admin')"), 'canonical is_tracker_admin includes system_admin');
  assert(adminFn.includes('p.active = true'), 'admin helper keeps active gate');
  assert(!adminFn.includes('service_role'), 'admin helper does not mention service_role');
  assert(helpers.includes('select public.is_tracker_admin();'), 'curriculum helper still delegates');

  const schema = readFileSync(join(root, 'supabase/migrations/001_cloud_core_schema.sql'), 'utf8');
  assert(schema.includes("role in ('admin', 'teacher', 'system_admin')"), 'canonical role check includes system_admin');

  const patch = readFileSync(join(root, 'P9_9_SYSTEM_ADMIN_ROLE_PATCH.sql'), 'utf8');
  assert(patch.includes("role in ('admin', 'system_admin')"), 'remote patch updates admin helper');
  assert(!/service_role/i.test(patch.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')), 'patch body does not use service_role');
}

async function runP995LogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/enrollment-view.js',
    'js/assessment-view.js',
    'js/cloud-assessment-store.js',
    'js/result-view.js',
    'js/p9a-ux-contract.js',
  ]);

  assert(SAT.normalizeChoiceCount(4) === 4, 'choice count 4');
  assert(SAT.normalizeChoiceCount(5) === 5, 'choice count 5');
  assert(SAT.normalizeChoiceCount('ACE') === 4, 'unknown choice count defaults to 4');
  assert(SAT.choiceOptionsForCount(4).join(',') === '1,2,3,4', '4-choice options');
  assert(SAT.choiceOptionsForCount(5).join(',') === '1,2,3,4,5', '5-choice options');
  ['1', '2', '3', '4'].forEach((ans) => {
    assert(SAT.isValidChoiceAnswer(ans, 4) === true, `4-choice allows ${ans}`);
    assert(SAT.isValidChoiceAnswer(ans, 5) === true, `5-choice allows ${ans}`);
  });
  assert(SAT.isValidChoiceAnswer('5', 4) === false, '4-choice rejects 5');
  assert(SAT.isValidChoiceAnswer('5', 5) === true, '5-choice allows 5');
  assert(SAT.isValidChoiceAnswer('a', 5) === false, 'no a/b/c/d/e conversion');

  const fourOk = SAT.validateChoiceAnswers(
    ['1', '2', '3', '4'].map((ans, i) => ({ number: i + 1, gradingType: 'choice', correctAnswer: ans })),
    { choiceCount: 4, requireFilled: true }
  );
  assert(fourOk.ok === true, '4-choice 1-4 publish ok');
  const fourBad = SAT.validateChoiceAnswers(
    [{ number: 1, gradingType: 'choice', correctAnswer: '5' }],
    { choiceCount: 4, requireFilled: true }
  );
  assert(fourBad.ok === false, '4-choice rejects 5');
  const fiveOk = SAT.validateChoiceAnswers(
    ['1', '2', '3', '4', '5'].map((ans, i) => ({ number: i + 1, gradingType: 'choice', correctAnswer: ans })),
    { choiceCount: 5, requireFilled: true }
  );
  assert(fiveOk.ok === true, '5-choice 1-5 publish ok');

  const spaced = SAT.parseAuthoringBulkAnswers('1 2 4 3');
  const commas = SAT.parseAuthoringBulkAnswers('1,2,4,3');
  const slashes = SAT.parseAuthoringBulkAnswers('1/2/4/3');
  const lines = SAT.parseAuthoringBulkAnswers('1\n2\n4\n3');
  const tabs = SAT.parseAuthoringBulkAnswers('1\t2\t4\t3');
  assert(spaced.join(',') === '1,2,4,3', 'bulk space parse');
  assert(commas.join(',') === '1,2,4,3', 'bulk comma parse');
  assert(slashes.join(',') === '1,2,4,3', 'bulk slash parse');
  assert(lines.join(',') === '1,2,4,3', 'bulk newline parse');
  assert(tabs.join(',') === '1,2,4,3', 'bulk tab parse');

  const shortBulk = SAT.validateAuthoringBulkAnswers(['1', '2'], 20, 4);
  assert(shortBulk.ok === false, 'bulk short is blocked');
  assert(shortBulk.errors.some((e) => e.message.includes('20문항 중 2개의 정답만')), 'bulk short message');
  const longBulk = SAT.validateAuthoringBulkAnswers(Array.from({ length: 21 }, () => '1'), 20, 4);
  assert(longBulk.ok === false, 'bulk long is blocked');
  assert(longBulk.errors.some((e) => e.message.includes('20문항인데 21개의 값')), 'bulk long message');
  const exactBulk = SAT.validateAuthoringBulkAnswers(Array.from({ length: 20 }, () => '1'), 20, 4);
  assert(exactBulk.ok === true, 'bulk exact count applies');
  const fiveInFour = SAT.validateAuthoringBulkAnswers(['1', '5'], 2, 4);
  assert(fiveInFour.ok === false, 'bulk 5 rejected on 4-choice');
  const fiveInFive = SAT.validateAuthoringBulkAnswers(['1', '5'], 2, 5);
  assert(fiveInFive.ok === true, 'bulk 5 allowed on 5-choice');

  const binary = SAT.normalizeCloudQuestion({
    number: 1,
    gradingType: 'manual_binary',
    correctAnswer: '2',
  }, 1);
  assert(binary.correctAnswer === '1', 'manual_binary stays internal 1');
  assert(SAT.manualBinaryUiLabel('1') === '정답', 'manual_binary UI 정답');
  assert(SAT.manualBinaryUiLabel('2') === '오답', 'manual_binary UI 오답');
  const binaryPublish = SAT.validateManualPublish([binary], { choiceCount: 5 });
  assert(binaryPublish.ok === true, 'manual_binary publish ignores 1-5 keypad');

  const dsc = SAT.cloudQuestionsFromCqBlueprint('DSC');
  assert(dsc.length === 20, 'standard blueprint still 20');
  assert(dsc.slice(0, 10).every((q) => q.majorCategory === 'Story Comprehension'), 'DSC 1-10 unchanged');
  assert(dsc.slice(10, 16).every((q) => q.majorCategory === 'Dialogue'), 'DSC 11-16 unchanged');
  assert(dsc.slice(16, 20).every((q) => q.majorCategory === 'Grammar'), 'DSC 17-20 unchanged');
  assert(SAT.hasStandardCqBlueprint({ assessmentType: 'CQ', level: 'DSC' }) === true, 'DSC CQ is standard');
  assert(SAT.hasStandardCqBlueprint({ assessmentType: 'CQ', level: 'IS' }) === false, 'IS CQ is manual');
  assert(SAT.canMutateDraftQuestionCount({ assessmentType: 'CQ', level: 'DSC' }, { status: 'draft' }) === true, 'DSC CQ draft can add/delete');
  assert(SAT.canMutateDraftQuestionCount({ assessmentType: 'CQ', level: 'IS' }, { status: 'draft' }) === true, 'manual draft can add/delete');
  assert(SAT.canMutateDraftQuestionCount({ assessmentType: 'CQ', level: 'IS' }, { status: 'published' }) === false, 'published is immutable');

  const blanks = SAT.buildBlankCloudQuestions(10);
  assert(blanks.length === 10, 'manual create 10 questions');
  assert(blanks[0].number === 1 && blanks[9].number === 10, 'blank numbers 1-10');
  assert(blanks.every((q) => q.gradingType === 'choice' && q.points === 1 && q.correctAnswer === ''), 'blank defaults');
  assert(SAT.buildBlankCloudQuestions(0).length === 0, 'zero count rejected');
  assert(SAT.buildBlankCloudQuestions(101).length === 0, 'over 100 rejected');
  assert(SAT.validateManualQuestionCount(20).ok === true, '20 is valid count');
  assert(SAT.validateManualQuestionCount(0).ok === false, '0 is invalid count');

  const emptyPublish = SAT.validateManualPublish([], { choiceCount: 4 });
  assert(emptyPublish.ok === false, 'empty manual version cannot publish');
  const missingAns = SAT.validateManualPublish(
    [{ number: 5, gradingType: 'choice', correctAnswer: '', points: 1 }],
    { choiceCount: 4, requireFilled: true }
  );
  assert(missingAns.ok === false && missingAns.errors.some((e) => e.includes('5번 문항의 정답이 없습니다')), 'missing answer names the question');

  assert(SAT.canEditCurriculum({ role: 'admin', active: true }) === true, 'admin authoring true');
  assert(SAT.canEditCurriculum({ role: 'system_admin', active: true }) === true, 'system_admin authoring true');
  assert(SAT.canEditCurriculum({ role: 'teacher', active: true, can_edit_curriculum: true }) === false, 'teacher authoring false');

  assert(SAT.resolveChoiceCount({
    assessment: { assessmentType: 'CQ', level: 'DSC' },
    version: { choiceCount: 5 },
  }) === 5, 'DSC CQ draft honors stored choiceCount 5');
  assert(SAT.resolveChoiceCount({
    assessment: { assessmentType: 'CQ', level: 'IS' },
    version: { choiceCount: 5 },
  }) === 5, 'manual version honors stored 5');
  assert(SAT.resolveChoiceCount({
    assessment: { assessmentType: 'Generic', level: 'ACE' },
    version: {},
    questions: [{ gradingType: 'choice', correctAnswer: '5' }],
  }) === 5, 'missing column infers 5 from answers, not from ACE name');

  const created = [];
  const store = new SAT.CloudAssessmentStore({
    async createAssessmentQuestions(versionId, questions) {
      created.push(...questions);
      return questions.map((q, i) => ({ ...q, id: `q${i + 1}`, assessmentVersionId: versionId }));
    },
    async createAssessmentQuestion(q) {
      created.push(q);
      return { ...q, id: `q${created.length}` };
    },
    async updateAssessmentQuestion(id, q) { return { ...q, id }; },
    async deleteAssessmentQuestion() { return { id: 'q2' }; },
    async updateDraftAssessmentVersion(id, patch) { return { id, assessmentId: 'is1', status: 'draft', ...patch }; },
  }, { getState: () => ({ user: { id: 'u1' }, profile: { role: 'admin', active: true } }) });
  store.assessments = [{ id: 'is1', assessmentType: 'CQ', level: 'IS' }];
  store.versions = [{ id: 'isv1', assessmentId: 'is1', status: 'draft', choiceCount: 4 }];
  store.questionsByVersionId.isv1 = [];
  const made = await store.createBlankQuestions('isv1', 10, { choiceCount: 4 });
  assert(made.length === 10, 'store creates 10 blank questions');
  assert(store.questionsFor('isv1').length === 10, 'store keeps blank questions');

  store.questionsByVersionId.isv1 = SAT.buildBlankCloudQuestions(3).map((q, i) => ({ ...q, id: `d${i + 1}` }));
  const afterDelete = await store.deleteDraftQuestion('isv1', 'd2');
  assert(afterDelete.map((q) => q.number).join(',') === '1,2', 'delete renumbers');
  assert(afterDelete.every((q) => q.id !== 'd2'), 'deleted id is gone');

  store.versions = [{ id: 'pub1', assessmentId: 'is1', status: 'published', choiceCount: 4 }];
  store.questionsByVersionId.pub1 = [{ id: 'pq', number: 1, gradingType: 'choice', correctAnswer: '1' }];
  let publishedBlocked = false;
  try {
    await store.createBlankQuestions('pub1', 5);
  } catch (err) {
    publishedBlocked = /공개된 버전/.test(err.message || '');
  }
  assert(publishedBlocked, 'published version cannot create blanks');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(rendererSrc.includes('authoring-table'), 'compact authoring table exists');
  assert(rendererSrc.includes('authoring-answer-opts'), 'horizontal answer options exist');
  assert(rendererSrc.includes('create-blank-questions'), 'manual blank create path exists');
  assert(rendererSrc.includes('EMPTY_MANUAL_AUTHORING_NOTICE'), 'empty manual copy uses helper');
  assert(!rendererSrc.includes('지원하지 않는 레벨'), 'UI dropped blocked unsupported wording');
  assert(rendererSrc.includes('apply-authoring-bulk'), 'authoring bulk apply exists');
  assert(!/if\s*\(\s*level\s*===\s*['"]ACE['"]/.test(rendererSrc), 'no ACE level hardcode');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes('applyAuthoringBulkAnswers'), 'bulk apply stays in UI draft');
  assert(appSrc.includes('submitCreateBlankQuestions'), 'blank create is wired');
  assert(appSrc.includes('getAnswerEntryChoiceCount'), 'answer entry reads choice count');

  const schema = readFileSync(join(root, 'supabase/migrations/001_cloud_core_schema.sql'), 'utf8');
  assert(schema.includes('choice_count integer not null default 4'), 'canonical schema has choice_count');
  const helpers = readFileSync(join(root, 'supabase/migrations/003_domain_helpers.sql'), 'utf8');
  assert(helpers.includes('choice_count is immutable after publish'), 'published choice_count is guarded');
  const patch = readFileSync(join(root, 'P9_95_ADMIN_AUTHORING_PATCH.sql'), 'utf8');
  assert(patch.includes('add column if not exists choice_count'), 'remote patch adds choice_count');
  assert(!/service_role/i.test(patch.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')), 'patch body does not use service_role');

  const css = readFileSync(join(root, 'css/styles.css'), 'utf8');
  assert(css.includes('.authoring-answer-opts'), 'compact answer row is nowrap-sized');
  assert(css.includes('.authoring-table .answer-btn'), 'authoring buttons are compact');
}

async function runP996LogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/enrollment-view.js',
    'js/assessment-view.js',
    'js/cloud-assessment-store.js',
    'js/p9a-ux-contract.js',
  ]);

  assert(SAT.formatCqBlueprintSummary('DSC').includes('20문항'), 'DSC summary uses 20');
  assert(SAT.formatCqBlueprintSummary('DSC').includes('Story Comprehension 1–10'), 'DSC summary from CQ_BLUEPRINTS');
  assert(SAT.formatCqBlueprintSummary('DSD').includes('Story Comprehension 1–16'), 'DSD summary from same source');
  assert(SAT.formatCqBlueprintSummary('LSA') === SAT.formatCqBlueprintSummary('MSB'), 'LS/MS share dsd-plus summary');
  assert(SAT.shouldShowCreateBlueprintOption('CQ', 'DSC') === true, 'CQ DSC shows generator option');
  assert(SAT.shouldShowCreateBlueprintOption('CQ', 'IS') === false, 'CQ IS hides generator option');
  assert(SAT.shouldShowCreateBlueprintOption('Generic', 'DSC') === false, 'Generic DSC hides generator option');

  const created = { assessments: [], versions: [], questions: [] };
  const repo = {
    async createAssessment(data) {
      const row = { id: `a-${data.level}-${data.assessmentType}-${created.assessments.length}`, ...data };
      created.assessments.push(row);
      return row;
    },
    async createDraftAssessmentVersion(data) {
      const row = {
        id: `v-${created.versions.length + 1}`,
        assessmentId: data.assessmentId,
        status: 'draft',
        choiceCount: data.choiceCount || 4,
        versionNumber: 1,
      };
      created.versions.push(row);
      return row;
    },
    async createAssessmentQuestions(versionId, questions) {
      const rows = questions.map((q, i) => ({ ...q, id: `${versionId}-q${i + 1}`, assessmentVersionId: versionId }));
      created.questions.push(...rows);
      return rows;
    },
    async createAssessmentQuestion(q) {
      const row = { ...q, id: `one-${created.questions.length + 1}` };
      created.questions.push(row);
      return row;
    },
    async updateAssessmentQuestion(id, q) { return { ...q, id }; },
    async deleteAssessmentQuestion() { return { id: 'gone' }; },
    async updateDraftAssessmentVersion(id, patch) { return { id, status: 'draft', ...patch }; },
    async deleteUnusedAssessment(id) { created.deleted = id; return id; },
    async listAssessments() { return created.assessments; },
    async listAllAssessmentVersions() { return created.versions; },
    async listExamInstances() { return []; },
  };
  const adminAuth = { getState: () => ({ user: { id: 'u1' }, profile: { role: 'admin', active: true } }) };
  const store = new SAT.CloudAssessmentStore(repo, adminAuth);

  const dscOn = await store.createAssessment({
    title: 'DSC CQ on',
    assessmentType: 'CQ',
    level: 'DSC',
    applyCqBlueprint: true,
  });
  assert(dscOn.usedStandardBlueprint === true, 'CQ DSC blueprint ON uses generator');
  assert(dscOn.questions.length === 20, 'CQ DSC blueprint ON creates 20 rows');
  assert(dscOn.questions[0].majorCategory === 'Story Comprehension', 'generated DSC category');

  const dscOff = await store.createAssessment({
    title: 'DSC CQ off',
    assessmentType: 'CQ',
    level: 'DSC',
    applyCqBlueprint: false,
  });
  assert(dscOff.usedStandardBlueprint === false, 'CQ DSC blueprint OFF is manual');
  assert((dscOff.questions || []).length === 0, 'CQ DSC blueprint OFF has 0 rows');

  const isCq = await store.createAssessment({
    title: 'IS CQ',
    assessmentType: 'CQ',
    level: 'IS',
    applyCqBlueprint: true,
  });
  assert(isCq.usedStandardBlueprint === false, 'CQ IS stays manual even if checkbox on');
  assert((isCq.questions || []).length === 0, 'CQ IS has 0 generated rows');

  const genericDsc = await store.createAssessment({
    title: 'Generic DSC',
    assessmentType: 'Generic',
    level: 'DSC',
    applyCqBlueprint: true,
  });
  assert(genericDsc.usedStandardBlueprint === false, 'Generic DSC is manual');
  assert((genericDsc.questions || []).length === 0, 'Generic DSC has 0 generated rows');

  store.assessments = [{ id: 'dsc1', assessmentType: 'CQ', level: 'DSC' }];
  store.versions = [{ id: 'dscv1', assessmentId: 'dsc1', status: 'draft', choiceCount: 4 }];
  store.questionsByVersionId.dscv1 = SAT.cloudQuestionsFromCqBlueprint('DSC').map((q, i) => ({ ...q, id: `bq${i + 1}` }));
  assert(SAT.canMutateDraftQuestionCount(store.getAssessment('dsc1'), store.getVersion('dscv1')) === true, 'blueprint-applied draft can add/delete');
  const added = await store.addBlankDraftQuestion('dscv1');
  assert(added.length === 21, 'blueprint-applied draft can add a question');
  store.questionsByVersionId.dscv1[0].majorCategory = 'Custom Major';
  const saved = await store.saveDraftQuestions('dscv1', store.questionsByVersionId.dscv1);
  assert(saved[0].majorCategory === 'Custom Major', 'blueprint-applied draft can change major category');

  const nineteen = SAT.cloudQuestionsFromCqBlueprint('DSC').slice(0, 19).map((q, i) => ({
    ...q,
    id: `n${i + 1}`,
    correctAnswer: '1',
  }));
  const pubCheck = SAT.validateManualPublish(nineteen, { choiceCount: 4 });
  assert(pubCheck.ok === true, '19 filled questions pass generic publish validation');
  const storePub = SAT.validateCqPublish('DSC', nineteen);
  assert(storePub.ok === false, 'legacy helper still knows the old 20-count shape');
  store.questionsByVersionId.dscv1 = nineteen;
  const published = [];
  store._repo = () => ({
    async publishAssessmentVersion(id) { published.push(id); return { id, status: 'published' }; },
    async refresh() {},
  });
  store.refresh = async function refresh() { return this; };
  store.loadVersionQuestions = async function loadVersionQuestions() { return this.questionsByVersionId.dscv1; };
  const pubRow = await store.publishVersion('dscv1');
  assert(published[0] === 'dscv1', 'publish does not compare SAT.CQ_BLUEPRINTS equality');
  assert(pubRow.status === 'published', '19-question DSC draft can publish under generic validation');

  store.versions = [{ id: 'pubv', assessmentId: 'dsc1', status: 'published', choiceCount: 4 }];
  store.questionsByVersionId.pubv = [{ id: 'pq', number: 1, gradingType: 'choice', correctAnswer: '1' }];
  let publishedBlocked = false;
  try {
    await store.addBlankDraftQuestion('pubv');
  } catch (err) {
    publishedBlocked = /공개된 버전/.test(err.message || '');
  }
  assert(publishedBlocked, 'published remains immutable');

  const unused = { id: 'del1', title: 'IS Phonic Quiz' };
  const unusedVersions = [{ id: 'dv1', assessmentId: 'del1', status: 'draft' }];
  assert(SAT.canHardDeleteAssessment(unused, unusedVersions, []) === true, 'draft-only unused can delete');
  assert(SAT.canHardDeleteAssessment(unused, [{ id: 'pv', status: 'published' }], []) === false, 'published version denies delete');
  assert(SAT.canHardDeleteAssessment(unused, [{ id: 'av', status: 'archived' }], []) === false, 'archived version denies delete');
  assert(SAT.canHardDeleteAssessment(unused, unusedVersions, [{ assessmentVersionId: 'dv1' }]) === false, 'exam instance denies delete');
  assert(SAT.formatUnusedAssessmentDeleteConfirm('IS Phonic Quiz').includes("문제집 'IS Phonic Quiz'을"), 'delete confirm names the title');

  const fiveBlock = SAT.canLowerChoiceCountToFour([{ gradingType: 'choice', correctAnswer: '5' }]);
  assert(fiveBlock.ok === false, 'cannot drop to 4 when an answer is 5');

  const sysStore = new SAT.CloudAssessmentStore(repo, {
    getState: () => ({ user: { id: 'u2' }, profile: { role: 'system_admin', active: true } }),
  });
  assert(sysStore.canAuthor() === true, 'system_admin may delete when safe');
  const teacherStore = new SAT.CloudAssessmentStore(repo, {
    getState: () => ({ user: { id: 'u3' }, profile: { role: 'teacher', active: true, can_edit_curriculum: true } }),
  });
  assert(teacherStore.canAuthor() === false, 'teacher cannot author or delete');
  teacherStore.assessments = [unused];
  teacherStore.versions = unusedVersions;
  let teacherDenied = false;
  try {
    await teacherStore.deleteUnusedAssessment('del1');
  } catch (err) {
    teacherDenied = /관리자만/.test(err.message || '');
  }
  assert(teacherDenied, 'teacher delete is denied');

  const deleteStore = new SAT.CloudAssessmentStore(repo, adminAuth);
  deleteStore.assessments = [unused];
  deleteStore.versions = unusedVersions;
  deleteStore.examInstances = [];
  deleteStore.refresh = async function refresh() {
    this.assessments = [];
    this.versions = [];
    return this;
  };
  await deleteStore.deleteUnusedAssessment('del1');
  assert(created.deleted === 'del1', 'admin delete of unused draft calls repo');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(rendererSrc.includes('표준 구성으로 시작'), 'create form uses generator copy');
  assert(rendererSrc.includes('표준 구성 불러오기'), 'empty draft can load generator');
  assert(!rendererSrc.includes('표준 CQ 구성 적용'), 'old lock copy is gone');
  assert(rendererSrc.includes('delete-unused-assessment'), 'unused delete action exists');
  assert(!rendererSrc.includes('지원하지 않는 레벨'), 'no blocked-level wording');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes('deleteUnusedAssessment'), 'delete handler is wired');
  assert(appSrc.includes('selectedAssessmentId = null'), 'delete resets selected assessment');
  assert(appSrc.includes('syncCreateAssessmentGeneratorUi'), 'create form toggles generator option');

  const storeSrc = readFileSync(join(root, 'js/cloud-assessment-store.js'), 'utf8');
  assert(!storeSrc.includes('validateCqPublish'), 'publish path no longer uses blueprint equality');

  const patch = readFileSync(join(root, 'P9_96_AUTHORING_FREEDOM_PATCH.sql'), 'utf8');
  assert(patch.includes('delete_unused_assessment'), 'patch adds delete RPC');
  assert(patch.includes('can_edit_tracker_curriculum()'), 'patch gates on admin helper');
  assert(!/service_role/i.test(patch.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')), 'patch body does not use service_role');
}

async function runP9961LogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/cloud-mappers.js',
    'js/auth-manager.js',
    'js/enrollment-view.js',
    'js/assessment-view.js',
    'js/cloud-assessment-store.js',
    'js/p9a-ux-contract.js',
  ]);

  const unused = { id: 'del1', title: 'IS Phonic Quiz' };
  const unusedVersions = [{ id: 'dv1', assessmentId: 'del1', status: 'draft', versionNumber: 1 }];
  assert(SAT.canHardDeleteAssessment(unused, unusedVersions, []) === true, 'draft-only unused can delete');
  assert(SAT.unusedAssessmentDeleteReason(unused, unusedVersions, []) === '', 'draft-only unused has no block reason');

  const publishedHistory = [
    { id: 'pv1', assessmentId: 'hist1', status: 'published', versionNumber: 1 },
    { id: 'dv2', assessmentId: 'hist1', status: 'draft', versionNumber: 2 },
  ];
  const hist = { id: 'hist1', title: 'DSC CQ 1' };
  assert(SAT.canHardDeleteAssessment(hist, publishedHistory, []) === false, 'published history denies normal delete');
  assert(
    SAT.unusedAssessmentDeleteReason(hist, publishedHistory, []) === SAT.DELETE_BLOCKED_PUBLISHED,
    'published history shows published reason',
  );
  assert(SAT.hasPriorPublishedAssessmentHistory(publishedHistory) === true, 'latest draft still notes prior published history');
  assert(SAT.hasPriorPublishedAssessmentHistory(unusedVersions) === false, 'unused draft has no prior published history');

  const archivedOnly = [{ id: 'av1', assessmentId: 'arch1', status: 'archived', versionNumber: 1 }];
  assert(
    SAT.unusedAssessmentDeleteReason({ id: 'arch1' }, archivedOnly, []) === SAT.DELETE_BLOCKED_ARCHIVED,
    'archived version shows archived reason',
  );

  const examOnly = [{ id: 'ei1', assessmentVersionId: 'dv1' }];
  assert(
    SAT.unusedAssessmentDeleteReason(unused, unusedVersions, examOnly) === SAT.DELETE_BLOCKED_EXAM,
    'exam instance history shows exam reason',
  );
  assert(
    SAT.unusedAssessmentDeleteReason(unused, unusedVersions, examOnly, [{ examInstanceId: 'ei1' }])
      === SAT.DELETE_BLOCKED_RESULT,
    'result history shows result reason',
  );

  const sysProfile = { role: 'system_admin', active: true };
  const adminProfile = { role: 'admin', active: true };
  const teacherProfile = { role: 'teacher', active: true };
  assert(SAT.canShowForceDeleteAssessment(sysProfile) === true, 'system_admin sees force delete');
  assert(SAT.canShowForceDeleteAssessment(adminProfile) === false, 'admin does not see force delete');
  assert(SAT.canShowForceDeleteAssessment(teacherProfile) === false, 'teacher does not see force delete');
  assert(SAT.canShowForceDeleteAssessment({ role: 'system_admin', active: false }) === false, 'inactive system_admin cannot force delete');
  assert(SAT.isAdmin(sysProfile) === true, 'system_admin still inherits admin app access');

  assert(SAT.canSubmitForceDeleteConfirm('5지선다 테스트', '5지선다 테스트') === true, 'exact title enables force confirm');
  assert(SAT.canSubmitForceDeleteConfirm('5지선다', '5지선다 테스트') === false, 'title mismatch disables force confirm');
  assert(SAT.canSubmitForceDeleteConfirm('', '5지선다 테스트') === false, 'empty title disables force confirm');
  assert(SAT.formatForceDeleteConfirm('5지선다 테스트').includes("문제집 '5지선다 테스트'을"), 'force confirm names the title');
  assert(SAT.formatForceDeleteSuccessToast({ deletedExamInstances: 2, deletedResults: 18 }).includes('시험 2건'), 'toast includes exam count');
  assert(SAT.formatForceDeleteSuccessToast({ deletedExamInstances: 2, deletedResults: 18 }).includes('결과 18건'), 'toast includes result count');

  const created = { forced: null };
  const repo = {
    async forceDeleteAssessment(id) {
      created.forced = id;
      return { assessmentId: id, deletedVersions: 2, deletedExamInstances: 2, deletedResults: 18 };
    },
    async deleteUnusedAssessment() { throw new Error('normal delete should not run'); },
  };
  const adminAuth = { getState: () => ({ user: { id: 'u1' }, profile: adminProfile }) };
  const adminStore = new SAT.CloudAssessmentStore(repo, adminAuth);
  adminStore.assessments = [hist];
  adminStore.versions = publishedHistory;
  let adminDenied = false;
  try {
    await adminStore.forceDeleteAssessment('hist1');
  } catch (err) {
    adminDenied = /시스템 관리자만/.test(err.message || '');
  }
  assert(adminDenied, 'admin store cannot force delete');

  const teacherStore = new SAT.CloudAssessmentStore(repo, {
    getState: () => ({ user: { id: 'u3' }, profile: teacherProfile }),
  });
  teacherStore.assessments = [hist];
  teacherStore.versions = publishedHistory;
  let teacherDenied = false;
  try {
    await teacherStore.forceDeleteAssessment('hist1');
  } catch (err) {
    teacherDenied = /시스템 관리자만/.test(err.message || '');
  }
  assert(teacherDenied, 'teacher store cannot force delete');

  const sysStore = new SAT.CloudAssessmentStore(repo, {
    getState: () => ({ user: { id: 'u2' }, profile: sysProfile }),
  });
  sysStore.assessments = [hist];
  sysStore.versions = publishedHistory;
  sysStore.examInstances = [{ id: 'ei1', assessmentVersionId: 'pv1' }];
  sysStore.refresh = async function refresh() {
    this.assessments = [];
    this.versions = [];
    this.examInstances = [];
    return this;
  };
  const summary = await sysStore.forceDeleteAssessment('hist1');
  assert(created.forced === 'hist1', 'system_admin force delete calls repo');
  assert(summary.deletedExamInstances === 2, 'force delete returns exam count');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(rendererSrc.includes('삭제 불가'), 'unavailable delete is visible');
  assert(rendererSrc.includes('show-unused-delete-reason'), 'unavailable delete shows a reason action');
  assert(rendererSrc.includes('PRIOR_PUBLISHED_HISTORY_NOTE'), 'prior published history note is rendered');
  assert(SAT.PRIOR_PUBLISHED_HISTORY_NOTE === '이전 공개 이력 있음', 'prior published history copy is Korean');
  assert(rendererSrc.includes('force-delete-assessment'), 'force delete action exists');
  assert(rendererSrc.includes('force-delete-panel'), 'force delete is in a separate panel');
  assert(!rendererSrc.includes('system_admin'), 'renderer does not print raw system_admin');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes('forceDeleteAssessment'), 'force delete handler is wired');
  assert(appSrc.includes('typedConfirmDialog'), 'force delete uses typed confirm');
  assert(appSrc.includes('selectedAssessmentId = null'), 'delete success resets selected assessment');
  assert(appSrc.includes('formatForceDeleteSuccessToast'), 'force delete toast uses summary');

  const utilsSrc = readFileSync(join(root, 'js/utils.js'), 'utf8');
  assert(utilsSrc.includes('typedConfirmDialog'), 'typed confirm helper exists');
  assert(utilsSrc.includes("e.key !== 'Escape'"), 'typed confirm still treats Escape as cancel');

  const patch = readFileSync(join(root, 'P9_961_FORCE_DELETE_PATCH.sql'), 'utf8');
  const patchBody = patch.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert(patch.includes('is_tracker_system_admin'), 'patch adds exact system_admin helper');
  assert(patch.includes("p.role = 'system_admin'"), 'helper uses exact role');
  assert(patch.includes('force_delete_assessment'), 'patch adds force delete RPC');
  assert(patch.includes('is_tracker_system_admin()'), 'force delete uses exact helper');
  assert(!patchBody.includes('is_tracker_admin()'), 'force delete does not use is_tracker_admin');
  assert(!/session_replication_role/i.test(patchBody), 'patch does not use session_replication_role');
  assert(patchBody.includes("set_config('sat.force_delete_assessment'"), 'patch sets transaction-local maintenance GUC');
  assert(patchBody.includes('sat_force_delete_maintenance_active()'), 'guards require the maintenance helper');
  assert(!/service_role/i.test(patchBody), 'patch body does not use service_role');
  assert(!/delete\s+from\s+(only\s+)?(public\.)?students/i.test(patchBody), 'patch does not delete students');
  assert(!/delete\s+from\s+(only\s+)?(public\.)?classes/i.test(patchBody), 'patch does not delete classes');
  assert(!/delete\s+from\s+(only\s+)?(public\.)?enrollments/i.test(patchBody), 'patch does not delete enrollments');

  const unusedPatch = readFileSync(join(root, 'P9_96_AUTHORING_FREEDOM_PATCH.sql'), 'utf8');
  assert(unusedPatch.includes('can_edit_tracker_curriculum()'), 'normal delete patch still gates on curriculum helper');
}

function runP10LogicTests() {
  const SAT = loadSat([
    'js/repository-error.js',
    'js/enrollment-view.js',
    'js/supabase-client.js',
  ]);

  assert(
    SAT.formatRepositoryUserMessage({ message: 'using service_role bypass', code: 'UNKNOWN' })
      === '요청을 처리하지 못했습니다.',
    'user messages do not pass through service_role text',
  );
  const perm = SAT.createRepositoryError({ message: 'permission denied for table', code: '42501' }, 'x');
  assert(
    SAT.formatRepositoryUserMessage(perm) === '이 작업을 할 권한이 없습니다.',
    'permission errors stay generic',
  );

  const clientSrc = readFileSync(join(root, 'js/supabase-client.js'), 'utf8');
  assert(clientSrc.includes('authRedirectTo'), 'OAuth redirect helper exists');
  assert(clientSrc.includes('loc.origin') || clientSrc.includes('location.origin'), 'redirect uses current origin');
  assert(!clientSrc.includes('localhost'), 'runtime redirect is not hardcoded to localhost');
  assert(!clientSrc.includes('8765'), 'runtime redirect is not hardcoded to :8765');

  const configSrc = readFileSync(join(root, 'js/supabase-config.js'), 'utf8');
  assert(configSrc.includes('SUPABASE_PUBLISHABLE_KEY'), 'client uses publishable key');
  assert(!configSrc.includes('sb_secret'), 'client config has no secret key');
  assert(!configSrc.includes('eyJ'), 'client config has no JWT service_role');

  const netlify = readFileSync(join(root, 'netlify.toml'), 'utf8');
  assert(netlify.includes('publish = "."'), 'Netlify publishes repo root');
  assert(!/command\s*=/.test(netlify) || /build command 없음|No build/.test(netlify), 'no build command required');

  const purge = readFileSync(join(root, 'PRE_DEPLOY_TEST_DATA_PURGE.sql'), 'utf8');
  assert(purge.includes('v_confirm_purge boolean := false'), 'purge starts with safety gate off');
  assert(purge.includes('Set confirmation flag before purge'), 'purge refuses until confirmed');
  assert(!/delete\s+from\s+public\.profiles/i.test(purge), 'purge does not delete profiles');
  assert(!/delete\s+from\s+auth\.users/i.test(purge), 'purge does not delete auth users');
}

function runP9eLogicTests() {
  const SAT = loadSat(['js/p9e-ux-contract.js']);

  assert(SAT.confirmDialogTreatsEscapeAsCancel() === true, 'Escape cancels confirm');
  assert(SAT.shouldAutoFocusDangerConfirm() === false, 'danger confirm is not auto-focused');
  assert(SAT.isSafeDialogFocusTarget('cancel') === true, 'cancel is the safe initial focus');
  assert(SAT.isSafeDialogFocusTarget('confirm') === false, 'confirm is not the safe initial focus');
  assert(SAT.toastDurationMs('error') > SAT.toastDurationMs('info'), 'error toast lasts longer');
  assert(SAT.shouldShowDisabledBackupActions() === false, 'disabled backup actions stay hidden');
  assert(SAT.BACKUP_UNSUPPORTED_NOTICE.includes('아직 지원하지 않습니다'), 'backup notice is honest');
  assert(SAT.resolveDialogReturnFocus({ focus() {} }), 'return focus keeps the opener');

  const utilsSrc = readFileSync(join(root, 'js/utils.js'), 'utf8');
  assert(utilsSrc.includes("e.key !== 'Escape'"), 'confirm/choice listen for Escape');
  assert(utilsSrc.includes('cancelBtn?.focus()'), 'confirm focuses cancel');
  assert(utilsSrc.includes('opener.focus'), 'dialog restores opener focus');
  assert(utilsSrc.includes('toastDurationMs'), 'toast uses duration helper');

  const rendererSrc = readFileSync(join(root, 'js/renderer.js'), 'utf8');
  assert(rendererSrc.includes('BACKUP_UNSUPPORTED_NOTICE'), 'backup uses honest unsupported notice');
  assert(rendererSrc.includes('BACKUP_STATUS_TITLE'), 'backup shows data status');
  assert(!/JSON보내기 \(클라우드 미지원\)/.test(rendererSrc), 'backup no longer shows broken export buttons');
  assert(rendererSrc.includes('문제집 작성은 관리자만'), 'exam setup teacher copy is operator-facing');
  assert(rendererSrc.includes('입력된 결과 평균'), 'exam overview dropped Result jargon');

  const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
  assert(appSrc.includes("confirmModal && !confirmModal.classList.contains('hidden')"), 'app Escape defers to confirm dialog');
  assert(appSrc.includes('문제집을 만들었습니다'), 'create toast uses 문제집');

  const css = readFileSync(join(root, 'css/styles.css'), 'utf8');
  assert(css.includes('.btn:focus-visible'), 'buttons have visible keyboard focus');

  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert(html.includes('js/p9e-ux-contract.js'), 'p9e contract is loaded');
  assert(html.includes('aria-labelledby="confirm-modal-title"'), 'confirm dialog has accessible name');
}

try {
  const groupCount = runTests();
  console.log(`All ${groupCount} test groups passed.`);
  await runP4bFoundationTests();
  console.log('P4B foundation unit tests passed.');
  await runP5aLogicTests();
  console.log('P5A logic unit tests passed.');
  await runP5bLogicTests();
  console.log('P5B logic unit tests passed.');
  await runP5c1LogicTests();
  console.log('P5C-1 logic unit tests passed.');
  await runP5c2LogicTests();
  console.log('P5C-2 logic unit tests passed.');
  runP7aLogicTests();
  console.log('P7A logic unit tests passed.');
  runP7bLogicTests();
  console.log('P7B logic unit tests passed.');
  await runP8LogicTests();
  console.log('P8 logic unit tests passed.');
  await runP8cLogicTests();
  console.log('P8C logic unit tests passed.');
  runP9aLogicTests();
  console.log('P9A logic unit tests passed.');
  await runP9a1LogicTests();
  console.log('P9A.1 logic unit tests passed.');
  runP9bLogicTests();
  console.log('P9B logic unit tests passed.');
  runP9c1LogicTests();
  console.log('P9C-1 logic unit tests passed.');
  runP9c2LogicTests();
  console.log('P9C-2 logic unit tests passed.');
  runP9dLogicTests();
  console.log('P9D logic unit tests passed.');
  runP9eLogicTests();
  console.log('P9E logic unit tests passed.');
  runP99LogicTests();
  console.log('P9.9 logic unit tests passed.');
  await runP995LogicTests();
  console.log('P9.95 logic unit tests passed.');
  await runP996LogicTests();
  console.log('P9.96 logic unit tests passed.');
  await runP9961LogicTests();
  console.log('P9.961 logic unit tests passed.');
  runP10LogicTests();
  console.log('P10 logic unit tests passed.');
  process.exit(0);
} catch (err) {
  console.error('Test failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
}
