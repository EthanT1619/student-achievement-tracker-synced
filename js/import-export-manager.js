(function (SAT) {

  const {

    SCHEMA_VERSION,

    normalizeCategory,

    getUniqueMajorsFromQuestions,

    recomputeResultStats,

    validateImportReadiness,

    repairDataIntegrity,

    formatIntegrityBlockingSummary,

    formatIntegrityRepairSummary,

    formatIntegrityWarningSummary,

    confirmDialog,

    choiceDialog,

  } = SAT;



  SAT.getWrongQuestionNumbers = function getWrongQuestionNumbers(result, questions, options = { ignoreCase: true }) {

    const wrong = [];

    questions.forEach((q) => {

      const ans = result.answers?.[q.id] ?? result.answers?.[String(q.number)] ?? '';

      if (!String(ans).trim() || !SAT.answersMatch(ans, q.correctAnswer, options)) {

        wrong.push(q.number);

      }

    });

    return wrong;

  };



  class ImportExportManager {

    constructor(repository) {

      this.repository = repository;

    }



    validateImportData(payload) {

      const errors = [];

      if (!payload || typeof payload !== 'object') {

        errors.push('유효한 JSON 객체가 아닙니다.');

        return { valid: false, errors };

      }

      if (payload.schemaVersion != null && payload.schemaVersion > SCHEMA_VERSION) {

        errors.push(`지원하지 않는 schemaVersion입니다: ${payload.schemaVersion}`);

      }

      ['classes', 'students', 'exams', 'questions', 'results', 'assessmentTemplates'].forEach((key) => {

        if (payload[key] != null && !Array.isArray(payload[key])) {

          errors.push(`${key}는 배열이어야 합니다.`);

        }

      });

      return { valid: errors.length === 0, errors };

    }



    buildImportBlockingMessage(readiness) {

      const blocking = formatIntegrityBlockingSummary(readiness);

      return `가져올 수 없습니다.\n\n[차단 오류]\n${blocking}`;

    }



    buildImportRepairMessage(readiness) {

      const repairs = formatIntegrityRepairSummary(readiness);

      const warnings = formatIntegrityWarningSummary(readiness);

      let message = `[자동 복구 가능]\n${repairs || '구조를 자동으로 맞춥니다.'}`;

      if (warnings) {

        message += `\n\n[경고]\n${warnings}`;

      }

      message += '\n\n원본 JSON을 먼저 다운로드할 수도 있습니다. 계속하시겠습니까?';

      return message;

    }



    downloadImportOriginal(payload, prefix = 'import-original') {

      const date = new Date().toISOString().slice(0, 10);

      const filename = `${prefix}-${date}.json`;

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });

      this.triggerDownload(blob, filename);

      return filename;

    }



    exportJson() {

      const data = this.repository.exportData();

      const date = new Date().toISOString().slice(0, 10);

      const filename = `student-achievement-backup-${date}.json`;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

      this.triggerDownload(blob, filename);

      const backupResult = this.repository.setLastBackupAt(new Date().toISOString());

      return {

        filename,

        backupSaved: !SAT.isSaveFailure(backupResult),

        backupResult,

      };

    }



    exportCorruptJson() {

      const raw = this.repository.getCorruptRaw();

      if (!raw) {

        throw new Error('복구용 손상 원본이 없습니다.');

      }

      const date = new Date().toISOString().slice(0, 10);

      const filename = `student-achievement-corrupt-backup-${date}.json`;

      const blob = new Blob([raw], { type: 'application/json' });

      this.triggerDownload(blob, filename);

      return filename;

    }



    async importJsonFile(file) {

      const text = await file.text();

      let payload;

      try {

        payload = JSON.parse(text);

      } catch {

        throw new Error('JSON 파싱에 실패했습니다. 파일 형식을 확인해주세요.');

      }



      const { valid, errors } = this.validateImportData(payload);

      if (!valid) throw new Error(errors.join('\n'));



      const readiness = validateImportReadiness(payload);

      if (readiness.status === 'blockingError') {

        throw new Error(this.buildImportBlockingMessage(readiness));

      }



      let workingPayload = readiness.payload;

      let warnings = formatIntegrityWarningSummary(readiness);



      if (readiness.status === 'repairable') {

        const choice = await choiceDialog(this.buildImportRepairMessage(readiness), {

          title: '가져오기 자동 수정',

          choices: [

            { id: 'continue', label: '수정 후 가져오기', primary: true },

            { id: 'download', label: '원본 JSON 다운로드' },

          ],

        });



        if (choice === 'download') {

          this.downloadImportOriginal(payload);

          throw new Error('원본 JSON을 다운로드했습니다. 확인 후 다시 가져오기를 진행해주세요.');

        }

        if (choice !== 'continue') {

          throw new Error('가져오기가 취소되었습니다.');

        }



        const repaired = repairDataIntegrity(workingPayload);

        workingPayload = repaired.payload;



        const afterRepair = validateImportReadiness(workingPayload);

        if (afterRepair.status === 'blockingError') {

          throw new Error(this.buildImportBlockingMessage(afterRepair));

        }

        warnings = formatIntegrityWarningSummary(afterRepair);

      }



      const importResult = this.repository.importData(workingPayload);

      if (SAT.isSaveFailure(importResult)) {

        throw new Error(importResult.message || '데이터 저장에 실패했습니다.');

      }

      this.repository.invalidateCache();

      return { payload: workingPayload, warnings };

    }



    exportCsvForExam(exam, results, students, classes, questions) {

      const classMap = new Map(classes.map((c) => [c.id, c]));

      const studentMap = new Map(students.map((s) => [s.id, s]));

      const majors = getUniqueMajorsFromQuestions(questions);

      const data = this.repository.loadAll();

      const options = { ignoreCase: data.settings?.ignoreCase !== false };



      const headers = [

        '학생명', '영어 이름', '반', '시험명', '시험일', '총점', '정답 수', '정답률',

        ...majors.map((c) => `${c} 정답률`),

        '오답 문항',

      ];



      const rows = results.map((r) => {

        const student = studentMap.get(r.studentId);

        const cls = student ? classMap.get(student.classId) : null;

        const stats = recomputeResultStats(r, questions, options);

        const majorRates = majors.map((cat) => {

          const bucket = stats.categoryStats?.major?.[cat];

          if (!bucket || bucket.total === 0) return '데이터 없음';

          return `${Math.round((bucket.correct / bucket.total) * 100)}%`;

        });

        const wrong = SAT.getWrongQuestionNumbers(r, questions, options);

        return [

          student?.name || '', student?.englishName || '', cls?.name || '',

          exam.title, exam.date,

          `${stats.earnedPoints}/${stats.totalPoints}`, String(stats.correctCount),

          `${Math.round(stats.percentage * 100)}%`, ...majorRates, wrong.join(', '),

        ];

      });



      const csvContent = [headers, ...rows]

        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))

        .join('\r\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });

      const filename = `exam-results-${exam.title.replace(/[^\w가-힣-]/g, '_')}-${exam.date}.csv`;

      this.triggerDownload(blob, filename);

      return filename;

    }



    triggerDownload(blob, filename) {

      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');

      a.href = url;

      a.download = filename;

      a.click();

      URL.revokeObjectURL(url);

    }

  }



  SAT.ImportExportManager = ImportExportManager;

})(window.SAT = window.SAT || {});


