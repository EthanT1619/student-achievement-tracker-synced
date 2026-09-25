(function (SAT) {
  const {
    APP_NAME,
    escapeHtml, formatDate, formatPercent, formatRatio, daysSince,
    getMajorRate, getStudentExamTrend, computeExamOverview, computeAllExamsOverview,
    getClassAverageForExam, aggregateStudentResultsAcrossExams,
    detectAnswerMode, renderMajorCategoryChart, renderTrendChart, renderPrintChartTables,
    destroyAllCharts, getWrongQuestionNumbers, recomputeResultStats,
    collectMajorSuggestions, collectMiddleSuggestions,
    getMiddleDisplayName, getMiddleStatText, formatQuestionRateDisplay,
    collectExamTypeSuggestions,
    renderPageGuidePanel, renderDashboardChecklist, renderFieldHint, renderEmptyState,
    STUDENT_RESULT_DISPLAY_OPTIONS, normalizeStudentResultDisplay,
    normalizeStudentResultView, getStudentResultPrintKicker,
    isTeacherStudentResultView, STUDENT_RESULT_VIEW_COUNSELING, STUDENT_RESULT_VIEW_TEACHER,
    filterExams, sortExamsByDateDesc, formatExamOptionLabel, formatExamIsoDate,
    collectDistinctClassLevels, collectDistinctExamTypes, ensureValidExamSelection,
    filterTemplatesByLevel, templateQuestionsToExamQuestions,
    getExamTemplateDisplay,
    getCqBlueprintForLevel, formatCqBlueprintPreviewRows, buildCqBlueprintQuestions,
    EXAM_SETUP_CQ_QUICK, EXAM_SETUP_CQ_UNSUPPORTED, CQ_QUICK_ANSWER_OPTIONS,
    CQ_BLUEPRINT_QUESTION_COUNT,
    OFFICIAL_LEVELS, normalizeLevel,
  } = SAT;

  function renderOfficialLevelDatalist() {
    return `<datalist id="official-level-suggestions">${OFFICIAL_LEVELS.map((lv) => `<option value="${escapeHtml(lv)}"></option>`).join('')}</datalist>`;
  }

  class Renderer {
  constructor(app) {
    this.app = app;
  }

  render(view) {
    destroyAllCharts();
    const main = document.getElementById('main-content');
    if (!main) return;

    if (!this.app.repository) {
      main.innerHTML = `<div class="empty-state"><p>불러오는 중…</p></div>`;
      this.updateNavActive(view);
      return;
    }

    const data = this.app.repository.loadAll();
    if (this.renderCloudBootstrap(main, data, view)) return;

    const handlers = {
      dashboard: () => this.renderDashboard(main, data),
      classes: () => this.renderClasses(main, data),
      exams: () => this.renderExams(main, data),
      'answer-entry': () => this.renderAnswerEntry(main, data),
      'student-results': () => this.renderStudentResults(main, data),
      'exam-overview': () => this.renderExamOverview(main, data),
      backup: () => this.renderBackup(main, data),
    };

    const fn = handlers[view] || handlers.dashboard;
    fn();
    this.updateNavActive(view);
  }

  renderCloudBootstrap(main, data, view) {
    const status = SAT.normalizeCloudUiState(data.storeStatus);
    if (status === SAT.CLOUD_UI_STATES.LOADING) {
      main.innerHTML = `<div class="empty-state"><p>클라우드 데이터를 불러오는 중…</p></div>`;
      this.updateNavActive(view);
      return true;
    }
    if (status === SAT.CLOUD_UI_STATES.ERROR) {
      const message = SAT.formatRepositoryUserMessage(data.storeError);
      main.innerHTML = `
        <section class="card">
          <div class="card-header"><h2>불러오기 실패</h2></div>
          <div class="card-body">
            <p>${escapeHtml(message)}</p>
            <button type="button" class="btn btn-primary" data-action="retry-cloud-load">다시 시도</button>
          </div>
        </section>`;
      this.updateNavActive(view);
      return true;
    }
    return false;
  }

  renderLegacyNotice(data) {
    if (!data.legacyLocalDataPresent) return '';
    return `<p class="cloud-notice cloud-notice--quiet" role="status">${escapeHtml(SAT.LEGACY_LOCAL_NOTICE)}</p>`;
  }

  renderDeferredAcademic(main, data) {
    main.innerHTML = `
      ${this.renderLegacyNotice(data)}
      <section class="card">
        <div class="card-header"><h2>시험 · 성취도</h2></div>
        <div class="card-body">
          <p class="cloud-notice">${escapeHtml(SAT.DEFERRED_CLOUD_RESULT_MESSAGE || SAT.DEFERRED_CLOUD_EXAM_MESSAGE)}</p>
          <p class="hint-text">시험 정의와 반 배정만 이 화면에 연결됩니다.</p>
        </div>
      </section>`;
  }

  renderCurrentTermContext(data) {
    const name = data.currentTerm?.name;
    return `<p class="context-line">${escapeHtml(SAT.DASHBOARD_TERM_LABEL || '현재 학기')}: ${name ? escapeHtml(name) : '없음'}</p>`;
  }

  renderTermsPanel(data) {
    if (!SAT.shouldShowTermManagementPanel({ isAdmin: this.app.isCloudAdmin?.() })) return '';
    const admin = true;
    const terms = data.terms || [];
    const currentId = data.currentTerm?.id;
    const rows = terms.length
      ? terms.map((t) => {
          const current = t.id === currentId || t.isCurrent;
          return `<tr>
            <td>${escapeHtml(t.name)}</td>
            <td>${escapeHtml(t.startDate || '—')}</td>
            <td>${escapeHtml(t.endDate || '—')}</td>
            <td>${current ? '<span class="badge badge--success">현재</span>' : ''}</td>
            <td class="actions-cell">
              ${admin && !current ? `<button type="button" class="btn btn-secondary btn-sm" data-action="set-current-term" data-id="${t.id}">현재 학기로</button>` : ''}
              ${admin ? `<button type="button" class="btn btn-secondary btn-sm" data-action="edit-term" data-id="${t.id}">수정</button>` : ''}
            </td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="5">${renderEmptyState('등록된 학기가 없습니다. 관리자가 첫 학기를 만들어주세요.')}</td></tr>`;

    const createForm = admin
      ? `<form class="inline-form" data-form="add-term">
            <div class="form-row">
              <label class="form-label">학기 이름<input type="text" name="name" required placeholder="예: 2026-1"></label>
              <label class="form-label">시작일<input type="date" name="startDate" required></label>
              <label class="form-label">종료일<input type="date" name="endDate" required></label>
              <button type="submit" class="btn btn-primary">학기 추가</button>
            </div>
          </form>`
      : '<p class="hint-text">학기 추가는 관리자만 할 수 있습니다.</p>';

    return `
      <section class="card">
        <div class="card-header"><h2>학기</h2></div>
        <div class="card-body">
          ${createForm}
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>이름</th><th>시작일</th><th>종료일</th><th>상태</th><th>작업</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  renderStorageRecoveryBanner() {
    const repo = this.app.repository;
    if (!repo.isStorageRecoveryRequired?.()) return;
    const main = document.getElementById('main-content');
    if (!main) return;
    const info = repo.getStorageRecoveryInfo?.() || {};
    const banner = document.createElement('section');
    banner.className = 'storage-recovery-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <p>${escapeHtml(info.message || SAT.STORAGE_RECOVERY_MESSAGE).replace(/\n/g, '<br>')}</p>
      <div class="btn-group">
        <button type="button" class="btn btn-secondary btn-sm" data-action="download-corrupt-json">손상 원본 JSON 다운로드</button>
        <label class="btn btn-primary btn-sm">
          JSON 백업 가져오기
          <input type="file" accept=".json,application/json" class="hidden" id="recovery-import-json-input" data-action="recovery-import-json-input">
        </label>
        <button type="button" class="btn btn-danger btn-sm" data-action="recovery-start-fresh">빈 데이터로 새로 시작</button>
      </div>
      ${
        info.corruptBackupKey
          ? `<p class="hint-text">복구 키: ${escapeHtml(info.corruptBackupKey)}</p>`
          : ''
      }`;
    main.insertAdjacentElement('afterbegin', banner);
  }

  updateNavActive(view) {
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.classList.toggle('nav-link--active', link.dataset.view === view);
    });
  }

  renderDashboard(main, data) {
    const counts = SAT.cloudDashboardCounts(data);
    const currentTerm = data.currentTerm;
    const workClasses = SAT.dashboardWorkClasses(data.classes || []);
    const recent = SAT.recentExamInstancesForDashboard(this.app.assessmentStore?.examInstances || [], 5);
    const classById = Object.fromEntries((data.classes || []).map((c) => [c.id, c]));
    const myClassesBody = workClasses.length
      ? `<ul class="work-class-list">${workClasses.map((c) => `
            <li class="work-class-item">
              <div class="work-class-item__name">${escapeHtml(c.name)}${c.level ? ` <span class="work-class-item__level">${escapeHtml(c.level)}</span>` : ''}</div>
              <div class="btn-group">
                <button type="button" class="btn btn-secondary btn-sm" data-action="open-dashboard-class" data-id="${c.id}">반·학생 보기</button>
                <button type="button" class="btn btn-primary btn-sm" data-action="open-dashboard-answer-entry" data-id="${c.id}">답안 입력</button>
              </div>
            </li>`).join('')}</ul>`
      : renderEmptyState(SAT.DASHBOARD_NO_CLASS_MESSAGE, { actionLabel: '반·학생', actionNav: 'classes' });
    const examBody = recent.length
      ? `<ul class="simple-list">${recent.map((row) => {
          const cls = classById[row.classId];
          return `<li class="recent-exam-item">
              <span>${escapeHtml(cls?.name || '반')} · ${escapeHtml(row.assessmentTitle || '시험')} · ${escapeHtml(row.administeredDate || '')}</span>
              <button type="button" class="btn btn-secondary btn-sm" data-action="open-answer-entry" data-id="${row.id}">답안 입력</button>
            </li>`;
        }).join('')}</ul>`
      : renderEmptyState(SAT.DASHBOARD_NO_EXAM_MESSAGE, {
        actionLabel: SAT.PAGE_TITLE_EXAMS || '시험 설정',
        actionNav: 'exams',
        secondaryLabel: '반·학생',
        secondaryNav: 'classes',
      });
    const termPanel = SAT.shouldShowTermManagementPanel({ isAdmin: this.app.isCloudAdmin?.() })
      ? `<details class="term-manage"><summary>학기 관리</summary>${this.renderTermsPanel(data)}</details>`
      : '';

    main.innerHTML = `
      ${this.renderLegacyNotice(data)}
      <section class="card card--work-start">
        <div class="card-header"><h2>오늘 업무</h2></div>
        <div class="card-body">
          ${this.renderCurrentTermContext(data)}
          <h3>${escapeHtml(SAT.DASHBOARD_MY_CLASSES_TITLE)}</h3>
          ${myClassesBody}
          <h3>배정된 시험</h3>
          ${examBody}
        </div>
      </section>
      <section class="stats-grid stats-grid--secondary">
        ${this.statCard('현재 학기', currentTerm ? escapeHtml(currentTerm.name) : '없음')}
        ${this.statCard('반', counts.classes)}
        ${this.statCard('학생 수', counts.students)}
        ${this.statCard(SAT.DASHBOARD_ENROLLMENT_COUNT_LABEL || '재원 기록', counts.enrollments)}
      </section>
      ${termPanel}`;
  }

  statCard(label, value) {
    return `<div class="stat-card"><span class="stat-card__value">${value}</span><span class="stat-card__label">${label}</span></div>`;
  }

  renderViewModeToggle(isTeacher) {
    return `<div class="view-mode-toggle no-print" role="group" aria-label="보기 모드">
              <button type="button" class="btn view-mode-btn${!isTeacher ? ' view-mode-btn--active' : ''}" data-action="student-result-view-counseling">
                상담용<span class="view-mode-btn__hint">학생 중심</span>
              </button>
              <button type="button" class="btn view-mode-btn${isTeacher ? ' view-mode-btn--active' : ''}" data-action="student-result-view-teacher">
                교사용<span class="view-mode-btn__hint">반 비교 포함</span>
              </button>
            </div>`;
  }

  renderPrintActionButton(action) {
    const hint = SAT.PRINT_BROWSER_HEADER_HINT || '';
    const title = hint ? ` title="${escapeHtml(hint)}"` : '';
    return `<button type="button" class="btn btn-primary btn-sm no-print" data-action="${action}"${title}>${escapeHtml(SAT.PRINT_ACTION_LABEL || '인쇄')}</button>`;
  }

  renderStudentResultPrintHeader({ student, classes, termName, view }) {
    const meta = SAT.buildStudentResultPrintMeta?.({
      student,
      classes,
      termName,
      view,
    }) || {};
    const extra = [
      meta.currentClassCaption,
      meta.termName ? `학기: ${meta.termName}` : '',
      meta.viewMode ? `출력 기준 보기: ${meta.viewMode}` : '',
      meta.printedAt ? `${SAT.PRINT_DATE_LABEL || '출력일'}: ${meta.printedAt}` : '',
    ].filter(Boolean);
    return `<div class="print-only print-header print-header--student">
        <p class="print-header__kicker">${escapeHtml(meta.viewMode || '')}</p>
        <h2>${escapeHtml(meta.displayName || student?.name || '')}</h2>
        ${extra.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
      </div>`;
  }

  renderExamResultPrintHeader({ instance, className, view }) {
    const meta = SAT.buildExamResultPrintMeta?.({
      instance,
      className,
      view,
    }) || {};
    const extra = [
      meta.className ? `반: ${meta.className}` : '',
      meta.date ? `시험일: ${meta.date}` : '',
      meta.viewMode ? `출력 기준 보기: ${meta.viewMode}` : '',
      meta.printedAt ? `${SAT.PRINT_DATE_LABEL || '출력일'}: ${meta.printedAt}` : '',
    ].filter(Boolean);
    return `<div class="print-only print-header print-header--exam">
        <p class="print-header__kicker">${escapeHtml(meta.viewMode || '')}</p>
        <h2>${escapeHtml(meta.title || instance?.assessmentTitle || '시험')}</h2>
        ${extra.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
      </div>`;
  }

  renderSelectedExamSummary(row) {
    if (!row) return '';
    const score = SAT.formatCloudScoreLine(row);
    const majors = SAT.listPrintMajorResults?.(row.categoryStats) || [];
    return `<div class="result-selected-summary">
        <h3>${escapeHtml(SAT.PRINT_SELECTED_EXAM_LABEL || '선택한 시험')}</h3>
        <p>${escapeHtml(row.assessmentTitle || '시험')} · ${escapeHtml(row.administeredDate || '—')}</p>
        <p>${escapeHtml(SAT.formatHistoricalClassCaption(row.className))}</p>
        <p>${escapeHtml(score)}</p>
        ${
          majors.length
            ? `<ul class="simple-list">${majors.map((item) => `<li>${escapeHtml(item.major)} · ${escapeHtml(item.percent)}</li>`).join('')}</ul>`
            : ''
        }
      </div>`;
  }

  renderDisplayOptionToggles(options, activeMap, actionName = 'toggle-sr-display') {
    return `<div class="display-option-toggles">${options
      .map((o) => {
        const hint = o.hint ? `<span class="display-option-toggle__hint">${escapeHtml(o.hint)}</span>` : '';
        return `<button type="button" class="display-option-toggle${activeMap[o.key] ? ' display-option-toggle--active' : ''}" data-action="${actionName}" data-display-key="${o.key}">${escapeHtml(o.label)}${hint}</button>`;
      })
      .join('')}</div>`;
  }

  renderMajorCategoryList(majorStats) {
    return `<ul class="category-list">${Object.entries(majorStats || {})
      .filter(([, b]) => b.total > 0)
      .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
      .map(([cat, bucket]) => `<li><strong>${escapeHtml(cat)}</strong>: ${formatRatio(bucket.correct, bucket.total)}</li>`)
      .join('') || '<li>데이터 없음</li>'}</ul>`;
  }

  renderMiddleCategoryList(middleStats) {
    return `<ul class="category-list">${Object.entries(middleStats || {})
      .filter(([, b]) => b.total > 0)
      .sort((a, b) => getMiddleStatText(a[1]).localeCompare(getMiddleStatText(b[1]), 'ko'))
      .map(([, b]) => `<li><strong>${escapeHtml(b.major)}</strong> · ${escapeHtml(getMiddleDisplayName(b.middle))}: ${formatRatio(b.correct, b.total)}</li>`)
      .join('') || '<li>데이터 없음</li>'}</ul>`;
  }

  renderStudentResultDisplayPanel(display) {
    const allOpts = STUDENT_RESULT_DISPLAY_OPTIONS;
    const allOn = allOpts.every((o) => display[o.key]);
    const groups = [
      { id: 'all', title: '전체 시험 합산' },
      { id: 'exam', title: '선택 시험' },
    ];
    return `
      <div class="display-modal__header">
        <h2 id="sr-display-modal-title" class="modal-title">표시 옵션</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-action="close-sr-display" aria-label="닫기">✕</button>
      </div>
      <div class="display-modal__body">
        ${groups
          .map(
            (g) => `
          <div class="display-option-group">
            <p class="display-option-group__title">${g.title}</p>
            ${this.renderDisplayOptionToggles(
              allOpts.filter((o) => o.group === g.id),
              display
            )}
          </div>`
          )
          .join('')}
        <p class="hint-text">켜고 끈 항목만 화면과 인쇄에 포함됩니다. 정답률·그래프·틀린 문항 등을 개별로 선택할 수 있습니다.</p>
      </div>
      <div class="display-modal__footer">
        <button type="button" class="btn btn-secondary btn-sm" data-action="sr-display-all-on" ${allOn ? 'disabled' : ''}>전체 켜기</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="sr-display-all-off" ${!allOn ? 'disabled' : ''}>전체 끄기</button>
        <button type="button" class="btn btn-primary btn-sm" data-action="close-sr-display">완료</button>
      </div>`;
  }

  renderSettingsGearButton(action = 'open-sr-display', title = '표시 옵션') {
    return `<button type="button" class="btn btn-icon btn-secondary" data-action="${action}" title="${title}" aria-label="${title}">
      <svg class="btn-icon__svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.63c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.63c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
      </svg>
    </button>`;
  }

  renderTeacherCommentSection(result, display) {
    if (!result) return '';
    const comment = String(result.teacherComment ?? '');
    const trimmed = comment.trim();
    const printBlock =
      display.showTeacherComment && trimmed
        ? `<div class="teacher-comment teacher-comment--print">
            <h3>선생님 코멘트</h3>
            <div class="teacher-comment__text">${escapeHtml(trimmed).replace(/\n/g, '<br>')}</div>
          </div>`
        : '';
    return `
      <div class="teacher-comment-wrap">
        <div class="teacher-comment teacher-comment--edit no-print">
          <div class="teacher-comment__header">
            <h3>선생님 코멘트</h3>
            <span class="teacher-comment__save-status" id="teacher-comment-status" aria-live="polite"></span>
          </div>
          <textarea
            class="teacher-comment__input"
            id="teacher-comment-input"
            data-field="teacher-comment"
            data-result-id="${result.id}"
            placeholder="학생·학부모에게 전달할 코멘트를 입력하세요. 시험마다 따로 저장되며, 입력하면 자동 저장됩니다."
            rows="4"
          >${escapeHtml(comment)}</textarea>
          <p class="hint-text teacher-comment__hint">성적표·PDF 맨 아래에 포함됩니다. 표시 옵션에서 끄면 인쇄에서만 숨길 수 있습니다.</p>
        </div>
        ${printBlock}
      </div>`;
  }

  renderClasses(main, data) {
    const currentTerm = data.currentTerm;
    const workspace = SAT.normalizeClassWorkspace?.(this.app.state.classWorkspace) || {
      showAddClass: false,
      showClassManage: false,
      showAddStudent: false,
      managingStudentId: null,
    };
    const sortedClasses = SAT.sortClassesForSelector?.(data.classes || []) || (data.classes || []);
    if (!this.app.state.selectedClassId && sortedClasses[0]?.id) {
      this.app.state.selectedClassId = sortedClasses[0].id;
    }
    const selectedClassId = this.app.state.selectedClassId || '';
    const selectedClass = (data.classes || []).find((c) => c.id === selectedClassId);
    const classStudents = (data.students || []).filter((s) => s.classId === selectedClassId);
    const canCreateClass = Boolean(currentTerm);
    const canAddStudent = SAT.canAddStudentToSelectedClass?.(selectedClass)
      ?? Boolean(selectedClass && !selectedClass.archived);
    const showAddClass = SAT.shouldShowAddClassForm?.(workspace) && canCreateClass;
    const showClassManage = Boolean(selectedClass) && SAT.shouldShowClassManage?.(workspace);
    const showAddStudent = SAT.shouldShowAddStudentForm?.(workspace, selectedClass);
    const isAdmin = this.app.isCloudAdmin();

    main.innerHTML = `
      ${this.renderLegacyNotice(data)}
      <section class="card class-workspace">
        <div class="card-header"><h2>${escapeHtml(SAT.PAGE_TITLE_CLASSES || '반·학생')}</h2></div>
        <div class="card-body class-workspace__body">
          ${this.renderCurrentTermContext(data)}
          ${this.renderClassSelector(sortedClasses, selectedClassId, data.students || [], canCreateClass, currentTerm, showAddClass)}
        </div>
      </section>
      ${selectedClass ? this.renderClassWorkspacePanel(selectedClass, classStudents, {
        selectedClassId,
        canAddStudent,
        showClassManage,
        showAddStudent,
        workspace,
        isAdmin,
      }) : ''}
      ${this.renderTransferStudentPanel(data)}
      ${selectedClass ? `<details class="class-workspace-exams"><summary>이 반의 시험 배정</summary>${this.renderClassExamInstanceSection(selectedClass)}</details>` : ''}`;
  }

  renderClassSelector(classes, selectedClassId, students, canCreateClass, currentTerm, showAddClass) {
    if (!classes.length) {
      return `
        ${renderEmptyState(currentTerm ? '등록된 반이 없습니다.' : '현재 학기가 없습니다. 학기를 만들고 현재 학기로 지정한 뒤 반을 추가하세요.')}
        ${canCreateClass ? this.renderAddClassControls(showAddClass) : ''}`;
    }
    const cards = classes.map((c) => {
      const count = SAT.classRosterStudentCount?.(students, c.id)
        ?? students.filter((s) => s.classId === c.id && s.active !== false).length;
      const state = SAT.classSelectorState?.({
        classId: c.id,
        selectedClassId,
        archived: c.archived,
      }) || { selected: c.id === selectedClassId, archived: Boolean(c.archived) };
      const mods = SAT.classSelectorModifier?.(state) || (state.selected ? 'class-selector--selected' : '');
      const status = c.archived ? '보관됨' : '활성';
      return `<button type="button" class="class-selector ${mods}" data-action="select-class" data-id="${c.id}" aria-pressed="${state.selected ? 'true' : 'false'}">
          <span class="class-selector__name">${escapeHtml(c.name)}</span>
          <span class="class-selector__meta">${escapeHtml(c.level || '레벨 없음')} · 학생 ${count}명</span>
          <span class="class-selector__status">${status}</span>
          ${state.selected ? '<span class="class-selector__check" aria-hidden="true">선택됨</span>' : ''}
        </button>`;
    }).join('');
    return `
      <div class="class-selector-grid" role="group" aria-label="반 선택">
        ${cards}
      </div>
      ${canCreateClass ? this.renderAddClassControls(showAddClass) : ''}`;
  }

  renderAddClassControls(showAddClass) {
    return `
      <div class="class-workspace__add">
        <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-add-class">${showAddClass ? '반 추가 닫기' : '+ 반 추가'}</button>
        ${showAddClass ? `<form class="inline-form class-workspace__form" data-form="add-class">
          <div class="form-row">
            <label class="form-label">반 이름<input type="text" name="name" required></label>
            <label class="form-label">레벨<input type="text" name="level" list="official-level-suggestions" placeholder="예: DSA, DSC, LSA"></label>
            <button type="button" class="btn btn-secondary" data-action="cancel-add-class">취소</button>
            <button type="submit" class="btn btn-primary">반 추가</button>
          </div>
          ${renderOfficialLevelDatalist()}
        </form>` : ''}
      </div>`;
  }

  renderClassWorkspacePanel(selectedClass, classStudents, options) {
    const {
      selectedClassId,
      canAddStudent,
      showClassManage,
      showAddStudent,
      workspace,
      isAdmin,
    } = options;
    const count = SAT.classRosterStudentCount?.(classStudents, selectedClass.id)
      ?? classStudents.filter((s) => s.active !== false).length;
    const status = selectedClass.archived ? '보관됨' : '활성';
    return `
      <section class="card class-workspace-panel">
        <div class="card-body class-workspace__body">
          <div class="class-workspace-header">
            <div>
              <h3 class="class-workspace-header__title">${escapeHtml(selectedClass.name)}</h3>
              <p class="context-line">${escapeHtml(selectedClass.level || '레벨 없음')} · 학생 ${count}명 · ${status}</p>
            </div>
            <div class="class-workspace-header__actions">
              <button type="button" class="btn btn-primary btn-sm" data-nav="answer-entry">답안 입력</button>
              <button type="button" class="btn btn-secondary btn-sm" data-nav="student-results">학생 결과</button>
              <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-class-manage">${showClassManage ? '반 관리 닫기' : '반 관리'}</button>
            </div>
          </div>
          ${showClassManage ? `<div class="class-workspace-manage" role="region" aria-label="${escapeHtml(selectedClass.name)} 반 관리">
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-class" data-id="${selectedClass.id}">이름 수정</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="archive-class" data-id="${selectedClass.id}">${selectedClass.archived ? '보관 해제' : '보관'}</button>
            <button type="button" class="btn btn-danger btn-sm" data-action="delete-class" data-id="${selectedClass.id}">삭제</button>
          </div>` : ''}
          <h3 class="class-workspace-roster-title">학생</h3>
          ${this.renderStudentRoster(classStudents, workspace, isAdmin)}
          ${
            canAddStudent
              ? `<div class="class-workspace__add">
                  <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-add-student">${showAddStudent ? '학생 추가 닫기' : '+ 학생 추가'}</button>
                  ${showAddStudent ? `<form class="inline-form class-workspace__form" data-form="add-student">
                    <input type="hidden" name="classId" value="${selectedClassId}">
                    <p class="context-line">${escapeHtml(selectedClass.name)}에 학생 추가</p>
                    <div class="form-row">
                      <label class="form-label">이름<input type="text" name="name" required placeholder="이름"></label>
                      <label class="form-label">영어 이름<input type="text" name="englishName" placeholder="선택"></label>
                      <button type="button" class="btn btn-secondary" data-action="cancel-add-student">취소</button>
                      <button type="submit" class="btn btn-primary">학생 추가</button>
                    </div>
                    <p class="hint-text">학생의 현재 반은 재원 기록을 기준으로 관리됩니다.</p>
                  </form>` : ''}
                </div>`
              : selectedClass.archived
                ? '<p class="hint-text">보관된 반에는 학생을 추가할 수 없습니다.</p>'
                : renderEmptyState('먼저 반을 등록하고 선택해주세요.', { actionLabel: '반 등록하기', actionNav: 'classes' })
          }
        </div>
      </section>`;
  }

  renderStudentRoster(classStudents, workspace, isAdmin) {
    if (!classStudents.length) {
      return renderEmptyState('이 반에는 등록된 학생이 없습니다.');
    }
    return `<ul class="student-roster">${classStudents.map((s) => {
      const status = s.active !== false ? '<span class="badge badge--success">활성</span>' : '<span class="badge badge--muted">비활성</span>';
      const open = SAT.shouldShowStudentManage?.(workspace, s.id);
      const showTransfer = SAT.shouldShowStudentTransferAction?.({ isAdmin }) ?? isAdmin;
      return `<li class="student-roster__item${open ? ' student-roster__item--open' : ''}">
        <div class="student-roster__main">
          <div>
            <div class="student-roster__name">${escapeHtml(s.name)}</div>
            <div class="student-roster__english">${escapeHtml(s.englishName || '')}</div>
            ${status}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-student-manage" data-id="${s.id}" aria-expanded="${open ? 'true' : 'false'}">${open ? '관리 닫기' : '관리'}</button>
        </div>
        ${open ? `<div class="student-roster__manage" role="region" aria-label="${escapeHtml(s.name)} 관리">
          <button type="button" class="btn btn-secondary btn-sm" data-action="edit-student" data-id="${s.id}">정보 수정</button>
          ${s.active !== false
            ? `<button type="button" class="btn btn-secondary btn-sm" data-action="archive-student" data-id="${s.id}">비활성화</button>`
            : `<button type="button" class="btn btn-secondary btn-sm" data-action="activate-student" data-id="${s.id}">활성화</button>`}
          ${showTransfer ? `<button type="button" class="btn btn-secondary btn-sm" data-action="transfer-student" data-id="${s.id}">학생 이관</button>` : ''}
          <button type="button" class="btn btn-danger btn-sm" data-action="delete-student" data-id="${s.id}">삭제</button>
        </div>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }

  ownerDisplayName(ownerId, profiles) {
    const row = (profiles || []).find((p) => p.id === ownerId);
    if (!row) return ownerId ? String(ownerId).slice(0, 8) : '미지정';
    return row.displayName || row.email || String(ownerId).slice(0, 8);
  }

  renderTransferStudentPanel(data) {
    if (!this.app.isCloudAdmin()) return '';
    const transfer = this.app.state.transfer;
    if (!transfer?.studentId) return '';
    const student = (data.students || []).find((s) => s.id === transfer.studentId);
    if (!student) {
      return `<section class="card"><div class="card-body">${renderEmptyState('이관할 학생을 찾을 수 없습니다.')}</div></section>`;
    }
    const profiles = transfer.profiles || [];
    const currentClass = (data.classes || []).find((c) => c.id === student.classId) || null;
    const destOptions = (data.classes || []).filter((c) => !c.archived);
    const destClass = destOptions.find((c) => c.id === transfer.destClassId) || null;
    const open = SAT.resolveOpenEnrollment(data.enrollments, student.id);
    const dates = SAT.computeTransferEnrollmentDates(open?.startDate, transfer.startDate);
    const currentOwner = this.ownerDisplayName(student.ownerId, profiles);
    const destOwner = destClass ? this.ownerDisplayName(destClass.ownerId, profiles) : '목적지 반을 선택하세요';
    const sameClass = Boolean(open && destClass && open.classId === destClass.id);
    return `
      <section class="card">
        <div class="card-header"><h2>학생 이관 — ${escapeHtml(student.name)}</h2></div>
        <div class="card-body">
          <form data-form="transfer-student">
            <input type="hidden" name="studentId" value="${student.id}">
            <p class="hint-text">${escapeHtml(SAT.CURRENT_CLASS_LABEL)}: ${escapeHtml(currentClass?.name || '재원 반 없음')} · 담당: ${escapeHtml(currentOwner)}</p>
            <div class="form-row">
              <label class="form-label">목적지 반
                <select name="destClassId" data-filter="transfer-destClassId" required>
                  <option value="">반을 선택하세요</option>
                  ${destOptions.map((c) => {
                    const owner = this.ownerDisplayName(c.ownerId, profiles);
                    const selected = c.id === transfer.destClassId ? ' selected' : '';
                    return `<option value="${c.id}"${selected}>${escapeHtml(c.name)} · ${escapeHtml(c.level || '')} · ${escapeHtml(owner)}</option>`;
                  }).join('')}
                </select>
              </label>
              <label class="form-label">새 반 시작일
                <input type="date" name="startDate" data-filter="transfer-startDate" required value="${escapeHtml(transfer.startDate || '')}">
              </label>
            </div>
            <div class="hint-text">
              <p>변경: ${escapeHtml(destOwner)} / ${escapeHtml(destClass?.name || '미선택')}</p>
              <p>기존 재원 종료: ${escapeHtml(dates.oldEndDate || '해당 없음 (열린 재원 없음)')}</p>
              <p>새 재원 시작: ${escapeHtml(transfer.startDate || '미입력')}</p>
              ${dates.rejected ? `<p>${escapeHtml(dates.message || '시작일을 확인하세요.')}</p>` : ''}
              ${sameClass ? '<p>이미 해당 반에 재원 중입니다.</p>' : ''}
            </div>
            <p class="hint-text">오늘 만든 재원을 오늘 날짜로 옮길 수 없습니다. 시작일은 현재 재원 시작일보다 뒤여야 합니다.</p>
            <div class="form-row">
              <button type="submit" class="btn btn-primary">이관 확인</button>
              <button type="button" class="btn btn-secondary" data-action="cancel-transfer">취소</button>
            </div>
          </form>
        </div>
      </section>`;
  }

  renderClassExamInstanceSection(selectedClass) {
    if (!selectedClass) return '';
    const store = this.app.assessmentStore;
    const rows = store ? store.examInstancesForClass(selectedClass.id) : [];
    return `
      <section class="card">
        <div class="card-header"><h2>이 반의 시험 배정 — ${escapeHtml(selectedClass.name)}</h2></div>
        <div class="card-body">
          ${this.renderExamInstanceTable(rows)}
        </div>
      </section>`;
  }

  renderExamInstanceTable(rows) {
    if (!rows.length) {
      return renderEmptyState('배정된 클라우드 시험이 없습니다. 시험 설정에서 공개된 버전을 배정하세요.', {
        actionLabel: SAT.PAGE_TITLE_EXAMS || '시험 설정',
        actionNav: 'exams',
      });
    }
    return `<div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>시험</th><th>레벨</th><th>레슨</th><th>버전</th><th>실시일</th><th>입력</th><th>작업</th></tr></thead>
        <tbody>
          ${rows.map((row) => {
            const eligible = SAT.eligibleStudentsForExamInstance(
              this.app.store?.getViewStudents?.() || [],
              this.app.store?.enrollments || [],
              row
            );
            const counts = SAT.resultCompletionCounts(eligible, this.app.resultStore?.resultsForInstance(row.id) || []);
            return `<tr>
            <td>${escapeHtml(row.assessmentTitle || '—')}</td>
            <td>${escapeHtml(row.level || '—')}</td>
            <td>${row.lessonStart != null ? `${row.lessonStart}–${row.lessonEnd ?? ''}` : '—'}</td>
            <td>v${escapeHtml(String(row.versionNumber ?? ''))}</td>
            <td>${escapeHtml(row.administeredDate || '—')}</td>
            <td>${counts.eligibleCount}명 중 ${counts.completedCount}명 입력</td>
            <td class="actions-cell">
              <button type="button" class="btn btn-secondary btn-sm" data-action="edit-instance-date" data-id="${row.id}">날짜 수정</button>
              <button type="button" class="btn btn-danger btn-sm" data-action="delete-exam-instance" data-id="${row.id}">삭제</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="open-answer-entry" data-id="${row.id}">답안 입력</button>
            </td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }


  renderExamFiltersBar(filters, classes, exams, options = {}) {
    const {
      showSearch = true,
      showExamType = true,
      classFilterKey = 'exams-filter-classId',
      levelFilterKey = 'exams-filter-level',
      examTypeFilterKey = 'exams-filter-examType',
      searchFilterKey = 'exams-filter-search',
    } = options;
    const levels = collectDistinctClassLevels(classes);
    const types = collectDistinctExamTypes(exams);
    return `
      <div class="exam-filters">
        <div class="form-grid form-grid--2 exam-filters__grid">
          <label class="form-label">반 필터
            <select data-filter="${classFilterKey}">
              <option value="">전체</option>
              ${classes.map((c) => `<option value="${c.id}" ${filters.classId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </label>
          <label class="form-label">레벨 필터
            <select data-filter="${levelFilterKey}">
              <option value="">전체</option>
              ${levels.map((lv) => `<option value="${escapeHtml(lv)}" ${filters.level === lv ? 'selected' : ''}>${escapeHtml(lv)}</option>`).join('')}
            </select>
          </label>
          ${
            showExamType
              ? `<label class="form-label">시험 유형
            <select data-filter="${examTypeFilterKey}">
              <option value="">전체</option>
              ${types.map((t) => `<option value="${escapeHtml(t)}" ${filters.examType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
            </select>
          </label>`
              : ''
          }
          ${
            showSearch
              ? `<label class="form-label">시험명 검색
            <input type="search" data-filter="${searchFilterKey}" value="${escapeHtml(filters.search || '')}" placeholder="시험명 일부 입력" autocomplete="off">
          </label>`
              : ''
          }
        </div>
      </div>`;
  }

  renderQuestionRangePatchPanel(questionCount, allQuestions) {
    const count = Math.max(1, Number(questionCount) || 1);
    const majorSuggestions = collectMajorSuggestions(allQuestions || []);
    return `
      <div class="question-range-patch" data-question-range-patch>
        <h4 class="question-range-patch__title">범위 일괄 적용</h4>
        <p class="hint-text">CHESS처럼 같은 분류를 여러 문항에 빠르게 설정할 수 있습니다. 체크한 항목만 적용되며, 문항별 개별 수정은 그대로 가능합니다.</p>
        <div class="question-range-patch__grid">
          <label class="form-label">시작 번호
            <input type="number" name="range_start" min="1" max="${count}" value="1" data-range-patch-input>
          </label>
          <label class="form-label">끝 번호
            <input type="number" name="range_end" min="1" max="${count}" value="${count}" data-range-patch-input>
          </label>
        </div>
        <div class="question-range-patch__fields">
          <div class="question-range-patch__field">
            <label class="question-range-patch__apply">
              <input type="checkbox" name="range_apply_major" data-range-patch-toggle> 이 항목 적용
            </label>
            <label class="form-label">대분류
              <input type="text" name="range_major" list="range-major-list" placeholder="직접 입력" autocomplete="off" data-range-patch-input>
              <datalist id="range-major-list">${majorSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
            </label>
          </div>
          <div class="question-range-patch__field">
            <label class="question-range-patch__apply">
              <input type="checkbox" name="range_apply_middle" data-range-patch-toggle> 이 항목 적용
            </label>
            <label class="form-label">중분류
              <input type="text" name="range_middle" placeholder="선택 또는 입력" autocomplete="off" data-range-patch-input>
            </label>
          </div>
          <div class="question-range-patch__field">
            <label class="question-range-patch__apply">
              <input type="checkbox" name="range_apply_points" data-range-patch-toggle> 이 항목 적용
            </label>
            <label class="form-label">배점
              <input type="number" name="range_points" min="1" step="1" value="1" data-range-patch-input>
            </label>
          </div>
          <div class="question-range-patch__field">
            <label class="question-range-patch__apply">
              <input type="checkbox" name="range_apply_note" data-range-patch-toggle> 이 항목 적용
            </label>
            <label class="form-label">메모
              <input type="text" name="range_note" autocomplete="off" data-range-patch-input>
            </label>
          </div>
        </div>
        <div class="question-range-patch__actions">
          <div class="btn-group btn-group--sm question-range-patch__presets">
            <button type="button" class="btn btn-secondary btn-sm" data-action="range-patch-preset" data-preset="full-range">현재 범위 전체 선택</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="range-patch-preset" data-preset="major-only">대분류만 적용</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="range-patch-preset" data-preset="major-middle">대분류 + 중분류 적용</button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-action="apply-question-range-patch">범위에 적용</button>
        </div>
      </div>`;
  }

  renderTemplateQuestionRows(questions, count, allQuestions) {
    const source = allQuestions || questions;
    const majorSuggestions = collectMajorSuggestions(source);
    const rows = [];
    const qMap = new Map((questions || []).map((q) => [q.number, q]));
    for (let i = 1; i <= count; i++) {
      const q = qMap.get(i) || {};
      const middleSuggestions = collectMiddleSuggestions(source, q.majorCategory);
      rows.push(`
        <div class="question-row question-row--template" data-number="${i}">
          <span class="question-row__num">#${i}</span>
          <label class="form-label">배점<input type="number" name="q_${i}_points" min="1" value="${q.points || 1}" required></label>
          <label class="form-label form-label--category form-label--major">
            <span class="form-label__title">대분류<span class="required-mark" aria-hidden="true">*</span></span>
            <input type="text" name="q_${i}_major" list="tpl-major-list-${i}" value="${escapeHtml(q.majorCategory || '')}" placeholder="직접 입력" data-question-major="${i}" required autocomplete="off">
            <datalist id="tpl-major-list-${i}">${majorSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
          </label>
          <label class="form-label form-label--category form-label--middle">중분류
            <input type="text" name="q_${i}_middle" list="tpl-middle-list-${i}" value="${escapeHtml(q.middleCategory || '')}" placeholder="선택 또는 입력 (선택)" data-question-middle="${i}" autocomplete="off">
            <datalist id="tpl-middle-list-${i}">${middleSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
          </label>
          <label class="form-label">메모<input type="text" name="q_${i}_note" value="${escapeHtml(q.note || '')}" autocomplete="off"></label>
        </div>`);
    }
    return rows.join('');
  }

  renderTemplateManagementSection(data) {
    const editingId = this.app.state.editingTemplateId;
    const editingTemplate =
      editingId === '__new__'
        ? { id: '', name: '', level: '', examType: '', questionCount: 10, questions: [] }
        : editingId
          ? data.assessmentTemplates.find((t) => t.id === editingId)
          : null;
    const templates = data.assessmentTemplates || [];
    const presetButtons = (SAT.PRESET_ASSESSMENT_TEMPLATES || [])
      .map(
        (p) =>
          `<button type="button" class="btn btn-secondary btn-sm" data-action="add-preset-template" data-preset="${p.key}">${escapeHtml(p.name)} 추가</button>`
      )
      .join('');

    const editForm = editingTemplate
      ? `
        <form data-form="template-setup" class="template-setup-form">
          ${editingTemplate.id ? `<input type="hidden" name="templateId" value="${editingTemplate.id}">` : ''}
          <div class="form-grid">
            <label class="form-label">템플릿 이름<input type="text" name="name" required value="${escapeHtml(editingTemplate.name)}"></label>
            <label class="form-label">레벨<input type="text" name="level" required value="${escapeHtml(editingTemplate.level)}" list="official-level-suggestions" placeholder="예: DSA, DSC, LSA"></label>
            <label class="form-label">시험 유형<input type="text" name="examType" value="${escapeHtml(editingTemplate.examType || '')}"></label>
            <label class="form-label">문항 수<input type="number" name="questionCount" min="1" max="100" required value="${editingTemplate.questionCount}"></label>
          </div>
          <p class="hint-text">템플릿에는 정답을 저장하지 않습니다. 시험 생성 시 문항 구조만 적용됩니다.</p>
          ${this.renderQuestionRangePatchPanel(editingTemplate.questionCount, data.questions)}
          <div id="template-questions-container" class="questions-container">
            ${this.renderTemplateQuestionRows(editingTemplate.questions, editingTemplate.questionCount, data.questions)}
          </div>
          <div class="btn-group">
            <button type="submit" class="btn btn-primary">템플릿 저장</button>
            <button type="button" class="btn btn-secondary" data-action="cancel-edit-template">취소</button>
          </div>
        </form>
        ${renderOfficialLevelDatalist()}`
      : '';

    return `
      <section class="card template-management no-print">
        <div class="card-header">
          <h2>시험 템플릿</h2>
          <span class="badge">${templates.length}개</span>
        </div>
        <div class="card-body">
          <p class="hint-text">시험 양식(문항 수·대분류 구조)을 레벨별로 저장해 두었다가, 실제 시험 생성 시 재사용합니다. 기존 시험 데이터와는 별도로 관리됩니다.</p>
          ${
            editingTemplate
              ? editForm
              : `
          <div class="template-preset-actions">
            <span class="template-preset-actions__label">기본 템플릿 추가:</span>
            <div class="btn-group btn-group--sm">${presetButtons}</div>
            <button type="button" class="btn btn-primary btn-sm" data-action="new-template">새 템플릿 작성</button>
          </div>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>이름</th><th>레벨</th><th>유형</th><th>문항</th><th>작업</th></tr></thead>
              <tbody>
                ${
                  templates.length
                    ? templates
                        .map(
                          (t) => `<tr>
                          <td>${escapeHtml(t.name)}</td>
                          <td>${escapeHtml(t.level || '—')}</td>
                          <td>${escapeHtml(t.examType || '—')}</td>
                          <td>${t.questionCount}</td>
                          <td class="actions-cell">
                            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-template" data-id="${t.id}">수정</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-action="duplicate-template" data-id="${t.id}">복제</button>
                            <button type="button" class="btn btn-danger btn-sm" data-action="delete-template" data-id="${t.id}">삭제</button>
                          </td>
                        </tr>`
                        )
                        .join('')
                    : `<tr><td colspan="5">${renderEmptyState('등록된 템플릿이 없습니다. 기본 템플릿 추가 버튼을 사용하거나 시험에서 템플릿을 만들 수 있습니다.')}</td></tr>`
                }
              </tbody>
            </table>
          </div>`
          }
        </div>
      </section>`;
  }

  renderExamTemplatePicker(classId, classes, templates, selectedTemplateId) {
    const selectedClass = classes.find((c) => c.id === classId);
    const level = normalizeLevel(selectedClass?.level) || '';
    const levelTemplates = filterTemplatesByLevel(templates, level);
    const blankActive = selectedTemplateId === 'blank' ? ' template-picker__card--active' : '';
    const cqQuickActive = selectedTemplateId === EXAM_SETUP_CQ_QUICK || selectedTemplateId === EXAM_SETUP_CQ_UNSUPPORTED
      ? ' template-picker__card--active'
      : '';
    const cqInfo = getCqBlueprintForLevel(level);

    return `
      <div class="exam-setup-step">
        <h3 class="exam-setup-step__title">2. 템플릿 선택</h3>
        <p class="hint-text">선택한 반의 레벨: <strong>${level ? escapeHtml(level) : '미설정'}</strong>${level ? '' : ' — 반·학생 메뉴에서 레벨을 입력하면 해당 레벨 템플릿이 표시됩니다.'}</p>
        <div class="template-picker">
          <button type="button" class="template-picker__card${cqQuickActive}" data-action="select-cq-quick">
            <span class="template-picker__name">CQ 빠른 생성</span>
            <span class="template-picker__meta">${cqInfo.supported ? '레벨에 맞는 CQ 문항 구성 + 정답 빠른 입력' : '이 레벨 CQ 구조 확인 후 진행'}</span>
          </button>
          <button type="button" class="template-picker__card${blankActive}" data-action="select-exam-template" data-id="blank">
            <span class="template-picker__name">빈 시험에서 시작</span>
            <span class="template-picker__meta">문항 수·분류를 직접 입력</span>
          </button>
          ${
            levelTemplates.length
              ? levelTemplates
                  .map((t) => {
                    const active = selectedTemplateId === t.id ? ' template-picker__card--active' : '';
                    const majors = [...new Set(t.questions.map((q) => q.majorCategory).filter(Boolean))];
                    return `<button type="button" class="template-picker__card${active}" data-action="select-exam-template" data-id="${t.id}">
                      <span class="template-picker__name">${escapeHtml(t.name)}</span>
                      <span class="template-picker__meta">${escapeHtml(t.examType || '유형 없음')} · ${t.questionCount}문항</span>
                      <span class="template-picker__meta template-picker__meta--minor">${escapeHtml(majors.slice(0, 3).join(', '))}${majors.length > 3 ? '…' : ''}</span>
                    </button>`;
                  })
                  .join('')
              : `<p class="hint-text">${level ? '이 레벨에 맞는 템플릿이 없습니다. 빈 시험에서 시작하거나 템플릿을 추가하세요.' : '반을 선택하면 템플릿 목록이 표시됩니다.'}</p>`
          }
        </div>
      </div>`;
  }

  renderCqQuickCreatePanel(selectedClass, examSetup) {
    const found = getCqBlueprintForLevel(selectedClass?.level);
    if (!found.supported) return '';
    const previewRows = formatCqBlueprintPreviewRows(found.blueprint);
    const draftAnswers = examSetup?.cqDraftAnswers || {};
    const options = CQ_QUICK_ANSWER_OPTIONS;
    const compactRows = [];
    for (let i = 1; i <= CQ_BLUEPRINT_QUESTION_COUNT; i += 1) {
      const selected = String(draftAnswers[i] || '');
      compactRows.push(`
        <div class="cq-quick-answer-row">
          <span class="cq-quick-answer-row__num">${i}</span>
          <div class="cq-quick-answer-row__opts">
            ${options
              .map((opt) => {
                const active = selected === opt ? ' answer-btn--selected' : '';
                return `<button type="button" class="answer-btn${active}" data-action="cq-quick-answer" data-number="${i}" data-answer="${opt}">${opt}</button>`;
              })
              .join('')}
          </div>
        </div>`);
    }
    return `
      <div class="cq-quick-panel">
        <div class="cq-blueprint-preview">
          <h4 class="cq-blueprint-preview__title">CQ 문항 구성</h4>
          <ul class="cq-blueprint-preview__list">
            ${previewRows
              .map((row) => `<li><span>${escapeHtml(row.rangeLabel)}</span><strong>${escapeHtml(row.majorCategory)}</strong></li>`)
              .join('')}
          </ul>
          <p class="hint-text">대분류는 자동으로 채워집니다. 중분류는 필요할 때만 입력하세요.</p>
        </div>
        <div class="cq-quick-bulk">
          <h4 class="cq-quick-bulk__title">정답 빠른 입력</h4>
          <label class="form-label">20개 정답 (1–4)
            <textarea id="cq-quick-bulk-input" class="bulk-answer-input" rows="2" placeholder="예: 21432214312413214231 또는 2 1 4 3 …">${escapeHtml(examSetup?.cqBulkDraft || '')}</textarea>
          </label>
          <p class="hint-text">붙여 넣거나 공백·쉼표로 구분해 입력한 뒤 「정답 적용」을 누르세요.</p>
          <div id="cq-quick-bulk-msg" class="bulk-validation-msg" aria-live="polite"></div>
          <button type="button" class="btn btn-secondary btn-sm" data-action="apply-cq-quick-answers">정답 적용</button>
        </div>
        <div class="cq-quick-grid" aria-label="문항별 정답">
          ${compactRows.join('')}
        </div>
      </div>`;
  }

  renderExams(main, data) {
    this.renderCloudLibrary(main, data);
  }

  renderCloudLibrary(main, data) {
    const store = this.app.assessmentStore;
    const lib = this.app.state.library;
    const author = this.app.canEditCurriculum?.();
    const status = SAT.normalizeCloudUiState(store?.status);
    if (!store || status === SAT.CLOUD_UI_STATES.LOADING) {
      main.innerHTML = `${this.renderLegacyNotice(data)}<div class="empty-state"><p>시험 설정을 불러오는 중…</p></div>`;
      return;
    }
    if (status === SAT.CLOUD_UI_STATES.ERROR) {
      main.innerHTML = `${this.renderLegacyNotice(data)}
        <section class="card"><div class="card-body">
          <p>${escapeHtml(SAT.formatRepositoryUserMessage(store.error))}</p>
          <button type="button" class="btn btn-primary" data-action="retry-cloud-load">다시 시도</button>
        </div></section>`;
      return;
    }

    const rows = SAT.filterLibraryAssessments(store.libraryRows(), lib);
    const selected = store.getAssessment(lib.selectedAssessmentId);
    const versions = selected ? store.versionsFor(selected.id) : [];
    const selectedVersion = store.getVersion(lib.selectedVersionId) || versions[0] || null;
    const questions = selectedVersion ? store.questionsFor(selectedVersion.id) : [];
    const classes = data.classes || [];
    const assignClass = classes.find((c) => c.id === lib.assignClassId) || classes[0] || null;
    const publishedForClass = SAT.filterPublishedAssessmentsForClass(store.libraryRows(), assignClass);
    const assignVersions = publishedForClass
      .flatMap((a) => SAT.publishedVersionsOf(a.versions).map((v) => ({ ...v, title: a.title, level: a.level })));
    const instanceRows = assignClass ? store.examInstancesForClass(assignClass.id) : [];
    const cqInfo = selected ? SAT.getCqBlueprintForLevel(selected.level) : { supported: false };
    const types = [...new Set(store.assessments.map((a) => a.assessmentType).filter(Boolean))];

    main.innerHTML = `
      ${this.renderLegacyNotice(data)}
      <section class="card">
        <div class="card-header"><h2>${escapeHtml(SAT.PAGE_TITLE_EXAMS || '시험 설정')}</h2></div>
        <div class="card-body">
          ${author ? this.renderCreateAssessmentForm() : '<p class="hint-text">문제집 작성은 관리자만 할 수 있습니다. 공개된 문제집을 반에 배정하세요.</p>'}
          <h3 class="section-heading">문제집</h3>
          <div class="form-row">
            <label class="form-label">레벨
              <select data-filter="library-level">
                <option value="">전체</option>
                ${(SAT.OFFICIAL_LEVELS || []).map((lv) => `<option value="${lv}" ${lib.level === lv ? 'selected' : ''}>${lv}</option>`).join('')}
              </select>
            </label>
            <label class="form-label">유형
              <select data-filter="library-type">
                <option value="">전체</option>
                <option value="CQ" ${lib.assessmentType === 'CQ' ? 'selected' : ''}>CQ</option>
                ${types.filter((t) => t !== 'CQ').map((t) => `<option value="${escapeHtml(t)}" ${lib.assessmentType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
              </select>
            </label>
            <label class="form-label">상태
              <select data-filter="library-active">
                <option value="all" ${lib.active === 'all' ? 'selected' : ''}>전체</option>
                <option value="active" ${lib.active === 'active' ? 'selected' : ''}>활성</option>
                <option value="inactive" ${lib.active === 'inactive' ? 'selected' : ''}>비활성</option>
              </select>
            </label>
          </div>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>제목</th><th>유형</th><th>레벨</th><th>레슨</th><th>버전</th><th>최근 상태</th><th>작업</th></tr></thead>
              <tbody>
                ${
                  rows.length
                    ? rows.map((a) => `<tr class="${a.id === selected?.id ? 'class-row class-row--active' : ''}">
                        <td>${escapeHtml(a.title)}</td>
                        <td>${escapeHtml(a.assessmentType)}</td>
                        <td>${escapeHtml(a.level)}</td>
                        <td>${a.lessonStart != null ? `${a.lessonStart}–${a.lessonEnd ?? ''}` : '—'}</td>
                        <td>${a.versionCount}</td>
                        <td>${escapeHtml(SAT.formatAssessmentStatusLabel(a.latestVersionStatus))}${SAT.hasPriorPublishedAssessmentHistory(a.versions) ? `<span class="library-status-note">${escapeHtml(SAT.PRIOR_PUBLISHED_HISTORY_NOTE)}</span>` : ''}</td>
                        <td class="actions-cell">
                          <button type="button" class="btn btn-secondary btn-sm" data-action="select-assessment" data-id="${a.id}">열기</button>
                          ${author ? `<button type="button" class="btn btn-secondary btn-sm" data-action="edit-assessment-title" data-id="${a.id}">표시명</button>` : ''}
                          ${author && a.active !== false ? `<button type="button" class="btn btn-secondary btn-sm" data-action="archive-assessment" data-id="${a.id}">비활성</button>` : ''}
                          ${author && a.active === false ? `<button type="button" class="btn btn-secondary btn-sm" data-action="activate-assessment" data-id="${a.id}">활성</button>` : ''}
                          ${this.renderLibraryDeleteControl(a, author, store)}
                        </td>
                      </tr>`).join('')
                    : `<tr><td colspan="7">${renderEmptyState('등록된 문제집이 없습니다. 첫 문제집을 만들어주세요.')}</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>
      ${selected ? this.renderAssessmentDetail(selected, versions, selectedVersion, questions, author, cqInfo) : ''}
      <section class="card">
        <div class="card-header"><h2>반에 배정</h2></div>
        <div class="card-body">
          <form class="inline-form" data-form="assign-exam-instance">
            <div class="form-row">
              <label class="form-label">반
                <select name="classId" data-filter="assign-classId" required>
                  <option value="">선택</option>
                  ${classes.map((c) => `<option value="${c.id}" ${assignClass?.id === c.id ? 'selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.level)})</option>`).join('')}
                </select>
              </label>
              <label class="form-label">공개 버전
                <select name="assessmentVersionId" required>
                  <option value="">선택</option>
                  ${assignVersions.map((v) => `<option value="${v.id}" ${lib.assignVersionId === v.id ? 'selected' : ''}>${escapeHtml(v.title)} v${v.versionNumber}</option>`).join('')}
                </select>
              </label>
              <label class="form-label">실시일<input type="date" name="administeredDate" value="${escapeHtml(lib.assignDate || SAT.isoDateLocal())}" required></label>
              <button type="submit" class="btn btn-primary">배정</button>
            </div>
          </form>
          <p class="hint-text">같은 버전을 같은 반에 다시 배정할 수 있습니다. 재시험 시 확인만 합니다.</p>
          ${this.renderExamInstanceTable(instanceRows)}
        </div>
      </section>`;
  }

  renderLibraryDeleteControl(assessment, author, store) {
    if (!author) return '';
    const reason = SAT.unusedAssessmentDeleteReason(
      assessment,
      assessment.versions,
      store.examInstances,
      this.app.resultStore?.results,
    );
    if (!reason) {
      return `<button type="button" class="btn btn-secondary btn-sm" data-action="delete-unused-assessment" data-id="${assessment.id}">삭제</button>`;
    }
    return `<button type="button" class="btn btn-secondary btn-sm btn-unavailable" aria-disabled="true" title="${escapeHtml(reason)}" data-action="show-unused-delete-reason" data-id="${assessment.id}">삭제 불가</button>`;
  }

  renderForceDeletePanel(assessment) {
    const profile = this.app.assessmentStore?.currentProfile?.()
      || this.app.store?.currentProfile?.();
    if (!SAT.canShowForceDeleteAssessment(profile) || !assessment?.id) return '';
    return `<div class="force-delete-panel">
      <p class="hint-text">위험 작업 · 시스템 관리자 전용</p>
      <button type="button" class="btn btn-secondary btn-sm btn-force-delete" data-action="force-delete-assessment" data-id="${assessment.id}">강제 삭제</button>
    </div>`;
  }

  renderCreateAssessmentForm() {
    const levels = SAT.OFFICIAL_LEVELS || [];
    const defaultLevel = 'DSC';
    const showBlueprint = SAT.shouldShowCreateBlueprintOption('CQ', defaultLevel);
    const summary = showBlueprint ? SAT.formatCqBlueprintSummary(defaultLevel) : '';
    return `<form class="inline-form" data-form="add-assessment">
      <div class="form-row">
        <label class="form-label">제목<input type="text" name="title" required placeholder="예: DSC CQ 1"></label>
        <label class="form-label">유형
          <select name="assessmentType" data-create-assessment-field="type">
            <option value="CQ" selected>CQ</option>
            <option value="Generic">Generic</option>
          </select>
        </label>
        <label class="form-label">레벨
          <select name="level" required data-create-assessment-field="level">
            ${levels.map((lv) => `<option value="${lv}" ${lv === defaultLevel ? 'selected' : ''}>${lv}</option>`).join('')}
          </select>
        </label>
        <label class="form-label">레슨 시작<input type="number" name="lessonStart" min="1" value="1"></label>
        <label class="form-label">레슨 끝<input type="number" name="lessonEnd" min="1" value="2"></label>
        <label class="form-label" data-create-blueprint-option ${showBlueprint ? '' : 'hidden'}>
          <input type="checkbox" name="applyCqBlueprint" checked> 표준 구성으로 시작
        </label>
        <label class="form-label">객관식 보기
          <select name="choiceCount">
            <option value="4" selected>4지선다</option>
            <option value="5">5지선다</option>
          </select>
        </label>
        <button type="submit" class="btn btn-primary">문제집 만들기</button>
      </div>
      <p class="hint-text" data-create-blueprint-summary ${showBlueprint ? '' : 'hidden'}>${escapeHtml(summary)}</p>
      <p class="hint-text">${escapeHtml(SAT.CREATE_BLUEPRINT_HINT)}</p>
      <p class="hint-text" data-create-manual-hint ${showBlueprint ? 'hidden' : ''}>문항을 직접 구성합니다.</p>
    </form>`;
  }

  renderAssessmentDetail(assessment, versions, selectedVersion, questions, author, cqInfo) {
    const locked = SAT.assessmentMetadataLocked(versions);
    const canEdit = author && SAT.canEditAssessmentVersion(selectedVersion);
    const preview = cqInfo.supported ? SAT.formatCqBlueprintPreviewRows(cqInfo.blueprint) : [];
    return `
      <section class="card">
        <div class="card-header"><h2>${escapeHtml(assessment.title)}</h2></div>
        <div class="card-body">
          <p>유형 ${escapeHtml(assessment.assessmentType)} · 레벨 ${escapeHtml(assessment.level)} · 레슨 ${assessment.lessonStart != null ? `${assessment.lessonStart}–${assessment.lessonEnd ?? ''}` : '—'}</p>
          ${locked ? '<p class="hint-text">공개된 문제집의 기본 정보는 수정할 수 없습니다.</p>' : ''}
          ${author ? `<div class="btn-group"><button type="button" class="btn btn-secondary btn-sm" data-action="create-draft-version" data-assessment-id="${assessment.id}">새 초안 버전</button></div>` : ''}
          ${this.renderForceDeletePanel(assessment)}
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>버전</th><th>상태</th><th>공개일</th><th>작업</th></tr></thead>
              <tbody>
                ${
                  versions.length
                    ? versions.map((v) => `<tr class="${v.id === selectedVersion?.id ? 'class-row class-row--active' : ''}">
                        <td>v${v.versionNumber}</td>
                        <td>${escapeHtml(SAT.formatAssessmentStatusLabel(v.status))}</td>
                        <td>${escapeHtml(formatExamIsoDate(v.publishedAt))}</td>
                        <td class="actions-cell">
                          <button type="button" class="btn btn-secondary btn-sm" data-action="select-version" data-id="${v.id}">보기</button>
                          ${author && v.status === 'draft' ? `<button type="button" class="btn btn-primary btn-sm" data-action="publish-version" data-id="${v.id}">공개</button>` : ''}
                          ${author && v.status === 'published' ? `<button type="button" class="btn btn-secondary btn-sm" data-action="archive-version" data-id="${v.id}">보관</button>` : ''}
                          ${author && v.status === 'published' ? `<button type="button" class="btn btn-secondary btn-sm" data-action="copy-to-new-version" data-id="${v.id}">새 버전 만들기</button>` : ''}
                        </td>
                      </tr>`).join('')
                    : `<tr><td colspan="4">${renderEmptyState('버전이 없습니다. 초안을 만들어주세요.')}</td></tr>`
                }
              </tbody>
            </table>
          </div>
          ${selectedVersion ? this.renderVersionQuestions(selectedVersion, questions, canEdit, author, cqInfo, preview, assessment) : ''}
        </div>
      </section>`;
  }

  renderVersionQuestions(version, questions, canEdit, author, cqInfo, preview, assessment) {
    const readOnly = !canEdit;
    const choiceCount = SAT.resolveChoiceCount({ version, questions });
    const canMutateCount = author && SAT.canMutateDraftQuestionCount(assessment, version);
    const canLoadBlueprint = author && SAT.canApplyCqBlueprintGenerator(assessment, version, questions);
    return `
      <h3>v${version.versionNumber} 문항 ${readOnly ? '(읽기 전용)' : '(초안 편집)'}</h3>
      ${
        canLoadBlueprint
          ? `<button type="button" class="btn btn-secondary btn-sm" data-action="apply-cq-blueprint" data-version-id="${version.id}">표준 구성 불러오기</button>
             <p class="hint-text">${escapeHtml(SAT.formatCqBlueprintSummary(assessment.level) || SAT.CREATE_BLUEPRINT_HINT)}</p>
             <ul class="simple-list">${preview.map((p) => `<li>${escapeHtml(p.rangeLabel)} · ${escapeHtml(p.majorCategory)}</li>`).join('')}</ul>`
          : ''
      }
      ${
        canEdit && !questions.length
          ? this.renderManualBlankCreate(version, choiceCount)
          : ''
      }
      ${
        !questions.length && !canEdit
          ? `<p class="hint-text">${escapeHtml(SAT.EMPTY_MANUAL_AUTHORING_NOTICE)}</p>`
          : ''
      }
      ${
        questions.length && canEdit
          ? `<form data-form="save-draft-questions" data-version-id="${version.id}" data-choice-count="${choiceCount}">
              ${this.renderAuthoringBulkBar(questions.length, choiceCount, { versionId: version.id, canEdit: true })}
              ${canMutateCount ? `<div class="authoring-row-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="add-draft-question" data-version-id="${version.id}">+ 문항 추가</button></div>` : ''}
              ${this.renderCloudQuestionEditor(questions, false, { choiceCount, canDelete: canMutateCount })}
              <div class="authoring-sticky-save"><button type="submit" class="btn btn-primary">초안 저장</button></div>
            </form>`
          : questions.length
            ? this.renderCloudQuestionEditor(questions, true, { choiceCount, canDelete: false })
            : ''
      }
      ${readOnly ? '<p class="hint-text">공개된 문항은 직접 수정할 수 없습니다. 오탈자/정답 수정은 「새 버전 만들기」를 사용하세요.</p>' : ''}
    `;
  }

  renderManualBlankCreate(version, choiceCount) {
    return `<div class="manual-authoring-empty" data-version-id="${version.id}">
      <p class="hint-text">${escapeHtml(SAT.EMPTY_MANUAL_AUTHORING_NOTICE)}</p>
      <p class="hint-text">${escapeHtml(SAT.EMPTY_MANUAL_AUTHORING_HINT)}</p>
      <form class="inline-form" data-form="create-blank-questions" data-version-id="${version.id}">
        <div class="form-row">
          <label class="form-label">객관식 보기
            <select name="choiceCount">
              <option value="4" ${Number(choiceCount) !== 5 ? 'selected' : ''}>4지선다</option>
              <option value="5" ${Number(choiceCount) === 5 ? 'selected' : ''}>5지선다</option>
            </select>
          </label>
          <label class="form-label">문항 수
            <input type="number" name="questionCount" min="1" max="100" value="20" required>
          </label>
          <button type="submit" class="btn btn-primary">빈 문항 만들기</button>
        </div>
      </form>
    </div>`;
  }

  renderAuthoringBulkBar(questionCount, choiceCount, options = {}) {
    const versionId = options.versionId || '';
    const choiceSelect = options.canEdit
      ? `<label class="form-label">객관식 보기
          <select data-action-change="draft-choice-count" data-version-id="${escapeHtml(versionId)}">
            <option value="4" ${Number(choiceCount) !== 5 ? 'selected' : ''}>4지선다</option>
            <option value="5" ${Number(choiceCount) === 5 ? 'selected' : ''}>5지선다</option>
          </select>
        </label>`
      : '';
    return `<div class="authoring-toolbar">
      <div>
        <strong>문항 편집</strong>
        <span class="hint-text">객관식 ${choiceCount}지선다 · ${questionCount}문항</span>
        ${choiceSelect}
      </div>
      <div class="authoring-bulk">
        <label class="form-label" for="authoring-bulk-input">정답표 빠른 입력
          <textarea id="authoring-bulk-input" class="bulk-answer-input authoring-bulk-input" rows="2" placeholder="예: 1 2 4 3 1 … 또는 1,2,4,3"></textarea>
        </label>
        <button type="button" class="btn btn-secondary btn-sm" data-action="apply-authoring-bulk">적용</button>
        <p id="authoring-bulk-msg" class="hint-text" role="status"></p>
      </div>
    </div>`;
  }

  renderCloudQuestionEditor(questions, readOnly, options = {}) {
    if (!questions.length) return '';
    const choiceCount = SAT.normalizeChoiceCount(options.choiceCount);
    const choiceOptions = SAT.choiceOptionsForCount(choiceCount);
    const canDelete = !!options.canDelete && !readOnly;
    return `<div class="table-scroll"><table class="data-table authoring-table">
      <thead><tr><th>번호</th><th>채점</th><th>정답</th><th>배점</th><th>대분류</th><th>중분류</th>${canDelete ? '<th>작업</th>' : ''}</tr></thead>
      <tbody>
        ${questions.map((q) => {
          const manual = q.gradingType === SAT.GRADING_TYPE_MANUAL_BINARY;
          const current = String(q.correctAnswer || '').trim();
          let answerCell;
          if (readOnly) {
            answerCell = manual ? SAT.manualBinaryUiLabel(q.correctAnswer) : escapeHtml(current || '—');
          } else if (manual) {
            answerCell = `<input type="hidden" name="q_${q.number}_answer" value="1"><span class="authoring-binary-label">정답</span>`;
          } else {
            const invalid = current && !SAT.isValidChoiceAnswer(current, choiceCount);
            answerCell = `<div class="authoring-answer-opts">
              <input type="hidden" name="q_${q.number}_answer" value="${escapeHtml(current)}">
              ${choiceOptions.map((opt) => {
                const active = current === opt ? ' answer-btn--selected' : '';
                return `<button type="button" class="answer-btn authoring-answer-btn${active}" data-action="cloud-cq-correct-answer" data-number="${q.number}" data-answer="${opt}">${opt}</button>`;
              }).join('')}
            </div>${invalid ? `<p class="hint-text">현재 값 "${escapeHtml(current)}"는 허용되지 않습니다. 1–${choiceCount}를 선택하세요.</p>` : ''}`;
          }
          const gradingCell = readOnly
            ? (manual ? '서술 판정' : '선택형')
            : `<select name="q_${q.number}_grading" data-authoring-grading="${q.number}">
                <option value="choice" ${!manual ? 'selected' : ''}>선택형</option>
                <option value="manual_binary" ${manual ? 'selected' : ''}>정답/오답 판정</option>
              </select>`;
          return `<tr class="authoring-row" data-number="${q.number}">
            <td>${q.number}<input type="hidden" name="q_${q.number}_id" value="${escapeHtml(q.id || '')}"><input type="hidden" name="q_${q.number}_note" value="${escapeHtml(q.note || '')}"></td>
            <td>${gradingCell}</td>
            <td class="authoring-answer-cell">${answerCell}</td>
            <td>${readOnly ? q.points : `<input type="number" name="q_${q.number}_points" min="0.1" step="0.1" value="${q.points}">`}</td>
            <td>${readOnly ? escapeHtml(q.majorCategory || '') : `<input type="text" name="q_${q.number}_major" value="${escapeHtml(q.majorCategory || '')}" autocomplete="off">`}</td>
            <td>${readOnly ? escapeHtml(q.middleCategory || '') : `<input type="text" name="q_${q.number}_middle" value="${escapeHtml(q.middleCategory || '')}" autocomplete="off">`}</td>
            ${canDelete ? `<td><button type="button" class="btn btn-secondary btn-sm" data-action="delete-draft-question" data-question-id="${escapeHtml(q.id || '')}">삭제</button></td>` : ''}
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }


  renderQuestionRows(questions, count, allQuestions, options = {}) {
    const source = allQuestions || questions;
    const majorSuggestions = collectMajorSuggestions(source);
    const rows = [];
    const qMap = new Map(questions.map((q) => [q.number, q]));
    const cqQuick = !!options.cqQuick;
    const answerOptions = cqQuick ? CQ_QUICK_ANSWER_OPTIONS : null;
    for (let i = 1; i <= count; i++) {
      const q = qMap.get(i) || {};
      const middleSuggestions = collectMiddleSuggestions(source, q.majorCategory);
      const answerField = answerOptions
        ? `<div class="form-label">정답
            <input type="hidden" name="q_${i}_answer" value="${escapeHtml(q.correctAnswer || '')}" required>
            <div class="cq-quick-answer-row__opts">
              ${answerOptions
                .map((opt) => {
                  const active = String(q.correctAnswer || '') === opt ? ' answer-btn--selected' : '';
                  return `<button type="button" class="answer-btn${active}" data-action="cq-quick-answer" data-number="${i}" data-answer="${opt}">${opt}</button>`;
                })
                .join('')}
            </div>
          </div>`
        : `<label class="form-label">정답<input type="text" name="q_${i}_answer" value="${escapeHtml(q.correctAnswer || '')}" required autocomplete="off"></label>`;
      rows.push(`
        <div class="question-row" data-number="${i}">
          <span class="question-row__num">#${i}</span>
          ${answerField}
          <label class="form-label">배점<input type="number" name="q_${i}_points" min="1" value="${q.points || 1}" required></label>
          <label class="form-label form-label--category form-label--major">
            <span class="form-label__title">대분류<span class="required-mark" aria-hidden="true">*</span></span>
            <input type="text" name="q_${i}_major" list="major-list-${i}" value="${escapeHtml(q.majorCategory || '')}" placeholder="직접 입력" data-question-major="${i}" required autocomplete="off">
            <datalist id="major-list-${i}">${majorSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
          </label>
          <label class="form-label form-label--category form-label--middle">중분류
            <input type="text" name="q_${i}_middle" list="middle-list-${i}" value="${escapeHtml(q.middleCategory || '')}" placeholder="선택 또는 입력 (선택)" data-question-middle="${i}" autocomplete="off">
            <datalist id="middle-list-${i}">${middleSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
          </label>
          <label class="form-label">메모<input type="text" name="q_${i}_note" value="${escapeHtml(q.note || '')}" autocomplete="off"></label>
          <div class="question-row__actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="copy-prev-categories" data-num="${i}" ${i <= 1 ? 'disabled' : ''}>↑ 이전 문항 분류 복사</button>
          </div>
          ${q.id ? `<input type="hidden" name="q_${i}_id" value="${q.id}">` : ''}
        </div>`);
    }
    return rows.join('');
  }

  renderAnswerEntry(main, data) {
    const { classId, examId, studentId } = this.app.state.answerEntry;
    const classes = data.classes || [];
    const instances = classId && this.app.assessmentStore
      ? this.app.assessmentStore.examInstancesForClass(classId)
      : [];
    const instance = this.app.getSelectedExamInstance();
    const versionId = instance?.assessmentVersionId;
    const questionsLoaded = Boolean(versionId && this.app.assessmentStore?.hasLoadedQuestions(versionId));
    if (instance && !questionsLoaded) {
      main.innerHTML = `<div class="empty-state"><p>시험 문항을 불러오는 중…</p></div>`;
      void this.app.ensureAnswerEntryLoaded();
      return;
    }
    const questions = this.app.getAnswerEntryQuestions();
    const students = this.app.getAnswerEntryStudents();
    const existing = instance && studentId
      ? this.app.resultStore?.getResultForStudentInstance(studentId, instance.id)
      : null;
    if (instance && studentId && this.app.state.currentAnswers == null) {
      this.app.hydrateAnswerDraftFromExisting();
    }
    const answers = { ...(this.app.state.currentAnswers || existing?.answers || {}) };
    const currentQ = this.app.state.currentQuestion || 1;
    const entryMode = this.app.state.answerEntryMode || 'fast';
    const hasNextStudent = this.app.hasNextAnswerStudent();
    const studentName = escapeHtml(students.find((s) => s.id === studentId)?.name || '');
    const currentQuestion = questions.find((q) => q.number === currentQ);
    const showBulk = SAT.allQuestionsChoice(questions);
    const saved = this.app.state.savedResultPreview || existing;
    const canWrite = !instance || !studentId || this.app.canWriteSelectedResult();
    const readOnlyHint = canWrite
      ? ''
      : `<div class="status-alert status-alert--readonly" role="status">
            <strong>읽기 전용</strong>
            <p>${escapeHtml(SAT.RESULT_READONLY_HINT)}</p>
            <p>${escapeHtml(SAT.RESULT_READONLY_STATUS_BODY)}</p>
          </div>`;
    const restartControls = canWrite
      ? `<p>${escapeHtml(SAT.RESULT_STALE_REFRESH_HINT)}</p>
            <button type="button" class="btn btn-primary btn-sm" data-action="restart-answer-from-remote">${escapeHtml(SAT.RESULT_RESTART_FROM_REMOTE_LABEL)}</button>`
      : '';
    const remoteNotice = `<div id="answer-remote-stale-notice" class="status-alert status-alert--warning"${this.app.state.resultRemoteChangedNotice ? '' : ' hidden'} role="status">
            <strong>저장 충돌</strong>
            <p>${escapeHtml(SAT.RESULT_STALE_NOTICE)}</p>
            ${restartControls}
          </div>`;
    const overrideCandidates = instance ? this.app.getAnswerEntryOverrideCandidates() : [];
    const eligible = instance
      ? SAT.eligibleStudentsForExamInstance(data.students || [], data.enrollments || [], instance)
      : [];
    const counts = SAT.resultCompletionCounts(eligible, this.app.resultStore?.resultsForInstance(instance?.id) || []);
    const progress = SAT.answerQuestionProgress?.(questions, answers) || { filled: 0, total: questions.length };
    const commentText = this.app.state.teacherCommentDraft || existing?.teacherComment || '';
    const commentOpen = Boolean(this.app.state.teacherCommentOpen);
    const hasComment = SAT.hasTeacherCommentText?.(commentText);
    const saveStatus = SAT.answerEntrySaveStatus?.({
      saved,
      scoreLine: saved ? SAT.formatCloudScoreLine(saved) : '',
    }) || {
      kind: saved ? 'saved' : 'new',
      badge: saved ? '저장됨' : '새 결과',
      text: saved ? `저장 점수: ${SAT.formatCloudScoreLine(saved)}` : '아직 저장되지 않았습니다. 미입력은 0점으로 표시하지 않습니다.',
    };
    const ready = Boolean(instance && studentId && questions.length);

    main.innerHTML = `
      ${this.renderLegacyNotice(data)}
      <section class="card answer-workspace no-print${canWrite ? '' : ' answer-entry-card--readonly'}" id="answer-entry-card">
        <div class="answer-workspace__head">
          <h2 class="answer-workspace__title">답안 입력</h2>
          ${ready ? `<p class="answer-workspace__context">${studentName} · ${escapeHtml(instance.assessmentTitle || '시험')}${instance.administeredDate ? ` · ${escapeHtml(instance.administeredDate)}` : ''}</p>` : ''}
        </div>
        <div class="answer-workspace__body">
          <div class="answer-workspace-zone answer-workspace-zone--target">
            <div class="answer-workspace-toolbar">
              <label class="form-label">반
                <select data-filter="classId">
                  <option value="">선택</option>
                  ${classes.map((c) => `<option value="${c.id}" ${classId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </label>
              <label class="form-label">시험
                <select data-filter="examId" ${!classId ? 'disabled' : ''}>
                  <option value="">선택</option>
                  ${instances.map((row) => `<option value="${row.id}" ${examId === row.id ? 'selected' : ''}>${escapeHtml(`${row.assessmentTitle || '시험'} · ${row.administeredDate || ''}`)}</option>`).join('')}
                </select>
              </label>
              <label class="form-label">학생
                <select data-filter="studentId" ${!instance ? 'disabled' : ''}>
                  <option value="">선택</option>
                  ${students.map((s) => `<option value="${s.id}" ${studentId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}${s.active === false ? ' (비활성)' : ''}</option>`).join('')}
                </select>
              </label>
            </div>
            ${instance ? `<p class="answer-workspace__meta">${counts.eligibleCount}명 중 ${counts.completedCount}명 입력 완료</p>` : ''}
            ${overrideCandidates.length ? `
              <div class="answer-workspace-override">
                <label class="form-label">재원 기록 없는 학생 추가
                  <select id="answer-override-student">
                    <option value="">선택</option>
                    ${overrideCandidates.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
                  </select>
                </label>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-override-student">예외 입력</button>
              </div>` : ''}
            ${ready ? `<div class="answer-workspace-status">
              <span class="badge ${saveStatus.kind === 'saved' ? 'badge--info' : 'badge--muted'}">${escapeHtml(saveStatus.badge)}</span>
              ${canWrite ? '' : `<span class="badge badge--readonly">${escapeHtml(SAT.RESULT_READONLY_HINT)}</span>`}
              <span class="answer-workspace-status__text">${escapeHtml(saveStatus.text)}</span>
            </div>` : ''}
          </div>
          ${
            ready
              ? `
            ${readOnlyHint}
            ${remoteNotice}
            <div class="answer-workspace-zone answer-workspace-zone--progress">
              <div class="answer-workspace-controls">
                ${showBulk ? `<div class="answer-mode-tabs no-print">
                  <button type="button" class="answer-mode-tab${entryMode === 'fast' ? ' answer-mode-tab--active' : ''}" data-action="answer-mode-fast">빠른 입력</button>
                  <button type="button" class="answer-mode-tab${entryMode === 'bulk' ? ' answer-mode-tab--active' : ''}" data-action="answer-mode-bulk">일괄 입력</button>
                </div>` : ''}
                <p class="answer-workspace-progress">입력 ${progress.filled}/${progress.total}</p>
              </div>
              <div id="answer-grid" class="answer-grid answer-workspace-nav" aria-label="문항별 답안">
                ${this.renderAnswerGridHtml(questions, answers, currentQ, this.app.state.answerIssueQuestions || [])}
              </div>
              <p class="answer-workspace-hint">${escapeHtml(SAT.ANSWER_KEYBOARD_HINT || '객관식은 숫자키 1–4, 방향키로 이동.')}</p>
            </div>

            <div class="answer-workspace-zone answer-workspace-zone--current">
              <div id="answer-fast-panel" class="${entryMode === 'bulk' && showBulk ? 'hidden' : ''}">
                <div id="answer-capture-panel" class="answer-panel answer-panel--focus answer-workspace-question" tabindex="0" role="group" aria-label="답안 빠른 입력">
                  <div class="answer-workspace-question__head">
                    <div class="answer-current-label">문항 <span id="answer-current-num">${currentQ}</span><span class="answer-current-total"> / ${questions.length}</span></div>
                    <p class="answer-workspace-question__meta" id="answer-current-meta">${escapeHtml(SAT.cloudQuestionMetaLine(currentQuestion))}</p>
                  </div>
                  <div class="answer-workspace-question__controls">
                    <div id="answer-options" class="answer-options">
                      ${this.renderCloudAnswerOptionsHtml(currentQuestion, answers, instance.assessmentType, { disabled: !canWrite, choiceCount: instance.choiceCount })}
                    </div>
                    <div id="answer-direct-wrap" class="${SAT.normalizeGradingType(currentQuestion?.gradingType) === SAT.GRADING_TYPE_CHOICE && instance.assessmentType !== SAT.ASSESSMENT_TYPE_CQ ? '' : 'answer-direct-wrap--collapsed'}">
                      <label class="form-label">직접 입력
                        <input type="text" id="answer-text-input" class="answer-text-input" value="${escapeHtml(SAT.cloudAnswerValue(answers, currentQuestion))}" autocomplete="off"${canWrite ? '' : ' disabled'}>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div id="answer-bulk-panel" class="${!showBulk || entryMode === 'fast' ? 'hidden' : ''}">
                <label class="form-label">답안 일괄 입력
                  <textarea id="bulk-answer-input" class="bulk-answer-input" rows="3" placeholder="예: 12341234123412341234"${canWrite ? '' : ' disabled'}>${escapeHtml(this.app.state.bulkInputDraft || '')}</textarea>
                </label>
                <p class="answer-workspace-hint">CQ 객관식만 일괄 입력합니다.</p>
                <div id="bulk-validation-msg" class="bulk-validation-msg" aria-live="polite"></div>
                <button type="button" class="btn btn-primary btn-sm" data-action="apply-bulk"${canWrite ? '' : ' disabled'}>일괄 적용</button>
              </div>
            </div>

            <div class="answer-workspace-comment">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-teacher-comment" data-action="toggle-teacher-comment" aria-expanded="${commentOpen ? 'true' : 'false'}">${escapeHtml(SAT.teacherCommentToggleLabel?.({ hasComment, open: commentOpen }) || '교사 코멘트')}</button>
              <div id="answer-comment-panel" ${commentOpen ? '' : 'hidden'}>
                <label class="form-label">교사 코멘트
                  <textarea id="result-teacher-comment" rows="2"${canWrite ? '' : ' disabled'}>${escapeHtml(commentText)}</textarea>
                </label>
              </div>
            </div>

            <div class="answer-workspace-actions no-print">
              <div class="answer-workspace-actions__nav">
                <button type="button" class="btn btn-secondary btn-sm" data-action="prev-question" id="btn-prev-question" ${currentQ <= 1 ? 'disabled' : ''}>${escapeHtml(SAT.ANSWER_PREV_QUESTION_LABEL || '이전 문항')}</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="next-question" id="btn-next-question" ${currentQ >= questions.length ? 'disabled' : ''}>${escapeHtml(SAT.ANSWER_NEXT_QUESTION_LABEL || '다음 문항')}</button>
              </div>
              <div class="answer-workspace-actions__save">
                <button type="button" class="btn btn-primary btn-sm" data-action="save-answers"${canWrite ? '' : ' disabled'}>저장</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="save-and-next-student" id="btn-save-next-student" ${hasNextStudent && canWrite ? '' : 'disabled'} title="${!canWrite ? SAT.RESULT_READONLY_HINT : (hasNextStudent ? '' : '마지막 학생입니다.')}">저장 후 다음 학생</button>
              </div>
            </div>`
              : renderEmptyState(
                !classId
                  ? '반을 먼저 선택해주세요.'
                  : !instance
                    ? '이 반에 배정된 클라우드 시험을 선택해주세요.'
                    : '시험일 기준 재원 학생을 선택해주세요.',
                {
                  actionLabel: !classId ? '반·학생으로 이동' : !instance ? '시험 설정으로 이동' : '반·학생으로 이동',
                  actionNav: !classId ? 'classes' : !instance ? 'exams' : 'classes',
                }
              )
          }
        </div>
      </section>`;

    if (instance && studentId && questions.length) {
      requestAnimationFrame(() => this.app.initAnswerEntryPanel());
    }
  }

  renderCloudAnswerOptionsHtml(question, answers, assessmentType, options = {}) {
    if (!question) return '';
    const disabled = options.disabled ? ' disabled' : '';
    const current = SAT.cloudAnswerValue(answers, question);
    if (SAT.normalizeGradingType(question.gradingType) === SAT.GRADING_TYPE_MANUAL_BINARY) {
      return [
        { value: SAT.MANUAL_BINARY_CORRECT, label: '정답' },
        { value: SAT.MANUAL_BINARY_INCORRECT, label: '오답' },
      ].map((opt) => {
        const selected = current === opt.value ? ' answer-btn--selected' : '';
        return `<button type="button" class="answer-btn answer-btn--judge${selected}" data-answer="${opt.value}"${disabled}>${opt.label}</button>`;
      }).join('');
    }
    const choiceOptions = SAT.cloudChoiceQuickOptions(assessmentType, { choiceCount: options.choiceCount });
    return choiceOptions.map((opt) => {
      const selected = String(current) === String(opt) ? ' answer-btn--selected' : '';
      return `<button type="button" class="answer-btn${selected}" data-answer="${opt}"${disabled}>${opt}</button>`;
    }).join('');
  }

  renderAnswerGridHtml(questions, answers, currentQ, issueQuestions = []) {
    const issueSet = new Set(issueQuestions || []);
    return questions
      .map((q) => {
        const ans = SAT.cloudAnswerValue(answers, q);
        const missing = !String(ans).trim();
        const active = q.number === currentQ ? ' answer-grid-item--active' : '';
        const missClass = missing ? ' answer-grid-item--missing' : '';
        const issueClass = issueSet.has(q.number) ? ' answer-grid-item--issue' : '';
        const display = missing ? '—' : escapeHtml(SAT.displayCloudAnswer(q, answers));
        return `<button type="button" class="answer-grid-item${active}${missClass}${issueClass}" data-goto="${q.number}" aria-label="문항 ${q.number}${missing ? ' 미입력' : ` 답 ${ans}`}${issueSet.has(q.number) ? ' 확인 필요' : ''}">
          <span class="answer-grid-item__num">${q.number}</span>
          <span class="answer-grid-item__val">${display}</span>
        </button>`;
      })
      .join('');
  }

  renderAnswerOptionsHtml(questions, answers, currentQ, options) {
    const q = questions.find((x) => x.number === currentQ);
    const currentAns = q ? (answers[q.id] ?? answers[String(q.number)] ?? '') : '';
    return options
      .map((opt) => {
        const selected = normalizeOpt(currentAns) === normalizeOpt(opt) ? ' answer-btn--selected' : '';
        return `<button type="button" class="answer-btn${selected}" data-answer="${opt}">${opt}</button>`;
      })
      .join('');
  }

  renderStudentResults(main, data) {
    const { classId, studentId } = this.app.state.studentResults;
    const classes = data.classes || [];
    const students = classId ? (data.students || []).filter((s) => s.classId === classId) : [];
    const student = studentId ? (data.students || []).find((s) => s.id === studentId) : null;
    const isTeacher = SAT.isTeacherStudentResultView?.(this.app.state.studentResultView);
    const questionsReady = !studentId || this.app.hasStudentAnalyticsQuestions?.(studentId);
    const analytics = studentId
      ? SAT.buildCloudStudentAnalyticsView({
        studentId,
        results: this.app.resultStore?.results || [],
        examInstances: this.app.assessmentStore?.examInstances || [],
        versions: this.app.assessmentStore?.versions || [],
        assessments: this.app.assessmentStore?.assessments || [],
        classes: data.classes || [],
        terms: data.terms || [],
        questionsByVersionId: this.app.assessmentStore?.questionsByVersionId || {},
        enrollments: data.enrollments || [],
        students: data.students || [],
        filters: this.app.state.studentAnalytics || {},
        isTeacher,
      })
      : null;
    const filterTermName = analytics?.filters?.termId
      ? (analytics.filterOptions.terms.find((t) => t.id === analytics.filters.termId)?.name || '')
      : '';
    const printTermName = SAT.resolvePrintTermName?.({
      filterTermName,
      currentTermName: data.currentTerm?.name,
    }) || data.currentTerm?.name || '';
    const selectedResultId = this.app.state.selectedResultId || null;
    const showPrint = SAT.shouldShowStudentPrintAction?.({ student }) ?? Boolean(student);

    main.innerHTML = `
      ${this.renderLegacyNotice(data)}
      <section class="card no-print">
        <div class="card-header"><h2>학생 결과</h2></div>
        <div class="card-body">
          <div class="form-grid form-grid--3">
            <label class="form-label">${escapeHtml(SAT.CURRENT_CLASS_LABEL)}
              <select data-filter="sr-classId">
                <option value="">선택</option>
                ${classes.map((c) => `<option value="${c.id}" ${classId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </label>
            <label class="form-label">학생
              <select data-filter="sr-studentId" ${!classId ? 'disabled' : ''}>
                <option value="">선택</option>
                ${students.map((s) => `<option value="${s.id}" ${studentId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
              </select>
            </label>
            ${this.renderViewModeToggle(isTeacher)}
          </div>
          <p class="hint-text hint-text--internal analytics-disclaimer">${escapeHtml(SAT.CLOUD_CQ_CONTEXT_LINE)} CQ 점수를 말하기 실력이나 전반 영어 능력으로 해석하지 마세요.${isTeacher ? '' : ' 상담용 보기에서는 반 평균·순위·다른 학생 기록을 표시하지 않습니다.'} 목록의 반은 현재 재원 반이고, 아래 이력의 반은 ${escapeHtml(SAT.HISTORICAL_EXAM_CLASS_LABEL)}입니다.</p>
        </div>
      </section>
      ${
        student
          ? `<div class="student-results-print">
              ${this.renderStudentResultPrintHeader({
                student,
                classes,
                termName: printTermName,
                view: this.app.state.studentResultView,
              })}
              ${this.renderCloudStudentAnalytics(student, analytics, questionsReady, isTeacher, classes, {
                selectedResultId,
                showPrint,
              })}
            </div>`
          : `<div class="card">${renderEmptyState('현재 반과 학생을 선택하면 클라우드 결과 이력을 볼 수 있습니다.')}</div>`
      }`;

    if (student && analytics && !analytics.emptyKind) {
      requestAnimationFrame(() => this.paintCloudStudentCharts(analytics, isTeacher));
    }
  }

  renderCloudStudentAnalytics(student, analytics, questionsReady, isTeacher, classes, options = {}) {
    const opts = analytics.filterOptions;
    const filters = analytics.filters;
    const majors = analytics.majorTrend.categories;
    const selectedRow = SAT.resolvePrintSelectedHistoryRow?.(analytics.historyDesc, options.selectedResultId) || null;
    const printBtn = options.showPrint ? this.renderPrintActionButton('print-results') : '';
    const showComments = SAT.shouldShowPrintCommentSection?.(analytics.commentHistory)
      ?? Boolean(analytics.commentHistory?.length);
    const printTrend = SAT.shouldPrintOverallTrend?.(analytics.overallTrend?.length ?? analytics.historyDesc.length)
      ?? ((analytics.overallTrend?.length ?? analytics.historyDesc.length) >= 2);
    const printMiddle = SAT.shouldPrintSecondaryCategorySection?.(analytics.middleRows)
      ?? Boolean(analytics.middleRows?.length);
    const printMajorTrend = SAT.shouldPrintMajorTrendChart?.() === true;
    return `
      <section class="card">
        <div class="card-header"><h2>${escapeHtml(student.name)} · 기록된 CQ</h2>${printBtn}</div>
        <div class="card-body">
          <p class="student-current-class">${escapeHtml(SAT.formatCurrentClassCaption(student, classes))}</p>
          ${selectedRow ? this.renderSelectedExamSummary(selectedRow) : ''}
          <div class="form-grid form-grid--3 no-print">
            <label class="form-label">학기
              <select data-filter="sr-termId">
                <option value="">전체 이력</option>
                ${opts.terms.map((t) => `<option value="${t.id}" ${filters.termId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
              </select>
            </label>
            <label class="form-label">레벨
              <select data-filter="sr-level">
                <option value="">전체</option>
                ${opts.levels.map((lv) => `<option value="${escapeHtml(lv)}" ${filters.level === lv ? 'selected' : ''}>${escapeHtml(lv)}</option>`).join('')}
              </select>
            </label>
            ${
              SAT.cloudMajorTrendChartMode(majors) === 'selector'
                ? `<label class="form-label">대분류
                    <select data-filter="sr-major">
                      ${majors.map((name) => `<option value="${escapeHtml(name)}" ${filters.majorCategory === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
                    </select>
                  </label>`
                : ''
            }
          </div>
          ${analytics.emptyMessage ? renderEmptyState(analytics.emptyMessage) : ''}
          ${analytics.scoreSequence ? `<p class="hint-text">${escapeHtml(analytics.scoreSequence)}</p>` : ''}
          ${
            analytics.historyDesc.length
              ? `<div class="table-scroll"><table class="data-table">
                  <thead><tr><th>시험</th><th>실시일</th><th>학기</th><th>${escapeHtml(SAT.HISTORICAL_EXAM_CLASS_LABEL)}</th><th>레벨</th><th>버전</th><th>점수</th></tr></thead>
                  <tbody>
                    ${analytics.historyDesc.map((row) => {
                      const active = row.resultId === this.app.state.selectedResultId ? ' class="class-row class-row--active"' : '';
                      return `<tr${active} data-action="select-result" data-id="${row.resultId}">
                        <td>${escapeHtml(row.assessmentTitle || '—')}</td>
                        <td>${escapeHtml(row.administeredDate || '—')}</td>
                        <td>${escapeHtml(row.termName || '—')}</td>
                        <td>${escapeHtml(row.className || '—')}</td>
                        <td>${escapeHtml(row.level || '—')}</td>
                        <td>${row.versionNumber != null ? `v${row.versionNumber}` : '—'}</td>
                        <td>${escapeHtml(SAT.formatCloudScoreLine({
                          correctCount: row.correctCount,
                          earnedPoints: row.earnedPoints,
                          totalPoints: row.totalPoints,
                          percentage: row.percentage,
                        }))}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table></div>`
              : ''
          }
        </div>
      </section>
      ${
        analytics.emptyKind
          ? ''
          : `<section class="card${SAT.printOmitClass?.(printTrend) || (printTrend ? '' : ' print-omit')}">
              <div class="card-header"><h2>CQ 수행 추이</h2></div>
              <div class="card-body">
                <div id="cloud-overall-trend" class="chart-wrapper"></div>
                ${isTeacher ? '<p class="hint-text hint-text--internal no-print">점선은 해당 시험의 입력된 결과만으로 계산한 반 평균입니다. 미입력은 n에 넣지 않습니다.</p>' : ''}
              </div>
            </section>
            <section class="card">
              <div class="card-header"><h2>대분류 수행</h2></div>
              <div class="card-body">
                ${questionsReady ? '' : '<p class="hint-text no-print">영역 분석을 불러오는 중…</p>'}
                <div id="cloud-major-bar" class="chart-wrapper"></div>
                <div id="cloud-major-trend" class="chart-wrapper${SAT.printOmitClass?.(printMajorTrend) || (printMajorTrend ? '' : ' print-omit')}"></div>
                ${this.renderCloudCategorySummaryTable(analytics.categorySummary.major)}
              </div>
            </section>
            <section class="card${SAT.printOmitClass?.(printMiddle) || (printMiddle ? '' : ' print-omit')}">
              <div class="card-header"><h2>중분류 상세</h2></div>
              <div class="card-body">
                ${
                  majors.length
                    ? `<label class="form-label no-print">대분류
                        <select data-filter="sr-major">
                          ${majors.map((name) => `<option value="${escapeHtml(name)}" ${analytics.selectedMajor === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
                        </select>
                      </label>`
                    : ''
                }
                ${this.renderCloudMiddleTable(analytics.middleRows)}
              </div>
            </section>
            ${
              showComments
                ? `<section class="card cloud-print-comment">
              <div class="card-header"><h2>교사 코멘트</h2></div>
              <div class="card-body">
                <ul class="simple-list">${analytics.commentHistory.map((row) => `<li><strong>${escapeHtml(row.administeredDate || '')} · ${escapeHtml(row.assessmentTitle || '')}</strong><br>${escapeHtml(row.teacherComment)}</li>`).join('')}</ul>
              </div>
            </section>`
                : ''
            }`
      }`;
  }

  renderCloudCategorySummaryTable(majorMap) {
    const rows = Object.values(majorMap || {}).filter((b) => Number(b.totalPoints) > 0)
      .sort((a, b) => String(a.major).localeCompare(String(b.major), 'ko'));
    if (!rows.length) return `<p class="empty-hint">${escapeHtml(SAT.CLOUD_ANALYTICS_EMPTY.category)}</p>`;
    return `<div class="table-scroll"><table class="data-table">
      <thead><tr><th>범주</th><th>문항</th><th>정답</th><th>득점</th><th>배점</th><th>수행률</th></tr></thead>
      <tbody>
        ${rows.map((b) => `<tr>
          <td>${escapeHtml(b.major)}</td>
          <td>${b.attemptedQuestions}</td>
          <td>${b.correctQuestions}</td>
          <td>${b.earnedPoints}</td>
          <td>${b.totalPoints}</td>
          <td>${escapeHtml(SAT.formatCloudAnalyticsPercent(b.percentage))}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="hint-text hint-text--internal no-print">수행률은 해당 범주 배점 합 대비 득점 합입니다. 시험 percentage의 단순 평균이 아닙니다.</p>`;
  }

  renderCloudMiddleTable(middleRows) {
    if (!(middleRows || []).length) return `<p class="empty-hint">${escapeHtml(SAT.CLOUD_ANALYTICS_EMPTY.category)}</p>`;
    return `<div class="table-scroll"><table class="data-table">
      <thead><tr><th>중분류</th><th>문항</th><th>정답</th><th>득점</th><th>배점</th><th>수행률</th></tr></thead>
      <tbody>
        ${middleRows.map((b) => `<tr>
          <td>${escapeHtml(b.middle)}</td>
          <td>${b.attemptedQuestions}</td>
          <td>${b.correctQuestions}</td>
          <td>${b.earnedPoints}</td>
          <td>${b.totalPoints}</td>
          <td>${escapeHtml(SAT.formatCloudAnalyticsPercent(b.percentage))}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="hint-text hint-text--internal no-print">중분류가 비어 있는 문항은 이 표에 넣지 않습니다.</p>`;
  }

  paintCloudStudentCharts(analytics, isTeacher) {
    if (this.app.state.currentView !== 'student-results') return;
    const overallEl = document.getElementById('cloud-overall-trend');
    const barEl = document.getElementById('cloud-major-bar');
    const trendEl = document.getElementById('cloud-major-trend');
    const points = isTeacher && analytics.overlay.length ? analytics.overlay : analytics.overallTrend;
    const overlayValues = isTeacher
      ? points.map((row) => (row.classAveragePercentage == null ? null : SAT.cloudDisplayPercent(row.classAveragePercentage)))
      : null;
    if (overallEl) {
      SAT.renderCloudPercentTrendChart(overallEl, points, 'cloud-overall', {
        emptyMessage: SAT.CLOUD_ANALYTICS_EMPTY.results,
        overlayValues: overlayValues && overlayValues.some((v) => v != null) ? overlayValues : null,
        ariaLabel: 'CQ 수행 추이',
      });
    }
    if (barEl) SAT.renderCloudCategoryBarChart(barEl, analytics.categorySummary, 'cloud-major-bar');
    if (trendEl) {
      SAT.renderCloudMajorTrendChart(trendEl, analytics.majorTrend, 'cloud-major-trend', analytics.selectedMajor);
    }
  }

  renderExamOverview(main, data) {
    const classId = this.app.state.examOverviewFilters?.classId || this.app.state.selectedClassId || '';
    const classes = data.classes || [];
    const instances = classId && this.app.assessmentStore
      ? this.app.assessmentStore.examInstancesForClass(classId)
      : [];
    const examId = this.app.state.examOverviewId;
    const instance = instances.find((row) => row.id === examId) || instances[0] || null;
    if (instance && instance.id !== examId) this.app.state.examOverviewId = instance.id;
    const eligible = instance
      ? SAT.eligibleStudentsForExamInstance(data.students || [], data.enrollments || [], instance)
      : [];
    const results = instance ? (this.app.resultStore?.resultsForInstance(instance.id) || []) : [];
    const questions = instance?.assessmentVersionId
      ? (this.app.assessmentStore?.questionsFor(instance.assessmentVersionId) || [])
      : [];
    const summary = instance
      ? SAT.computeCloudExamInstanceSummary({ eligibleStudents: eligible, results, questions })
      : null;
    const isTeacher = SAT.isExamOverviewTeacherView?.(this.app.state);
    const selectedClass = classes.find((c) => c.id === classId) || null;
    const showExamPrint = SAT.shouldShowExamPrintAction?.({ instance }) ?? Boolean(instance);
    const classTrend = isTeacher && classId
      ? SAT.buildCloudClassAverageTrend({
        instances,
        results: this.app.resultStore?.results || [],
        enrollments: data.enrollments || [],
        students: data.students || [],
      })
      : [];

    main.innerHTML = `
      ${this.renderLegacyNotice(data)}
      <section class="card no-print">
        <div class="card-header"><h2>시험 결과</h2></div>
        <div class="card-body">
          <div class="form-grid form-grid--3">
            <label class="form-label">반
              <select data-filter="overview-filter-classId">
                <option value="">선택</option>
                ${classes.map((c) => `<option value="${c.id}" ${classId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </label>
            <label class="form-label">시험
              <select data-filter="overview-examId" ${!classId ? 'disabled' : ''}>
                <option value="">선택</option>
                ${instances.map((row) => `<option value="${row.id}" ${instance && row.id === instance.id ? 'selected' : ''}>${escapeHtml(`${row.assessmentTitle || '시험'} · ${row.administeredDate || ''}`)}</option>`).join('')}
              </select>
            </label>
            ${this.renderViewModeToggle(isTeacher)}
          </div>
          <p class="hint-text hint-text--internal analytics-disclaimer">${escapeHtml(SAT.CLOUD_CQ_CONTEXT_LINE)} 결과 없음은 0점이 아닙니다.${isTeacher ? '' : ' 상담용 보기에서는 반 평균과 다른 학생 기록을 표시하지 않습니다.'}</p>
        </div>
      </section>
      ${
        instance
          ? `<section class="card exam-overview-print">
              <div class="card-header"><h2>${escapeHtml(instance.assessmentTitle || '시험')} · ${escapeHtml(instance.administeredDate || '')}${instance.versionNumber != null ? ` · v${instance.versionNumber}` : ''}</h2>${showExamPrint ? this.renderPrintActionButton('print-exam-overview') : ''}</div>
              ${this.renderExamResultPrintHeader({
                instance,
                className: selectedClass?.name || '',
                view: this.app.state.examOverviewView,
              })}
              <div class="card-body">
                <p><strong>${summary.completedCount} / ${summary.eligibleCount} 입력 완료</strong> (${summary.missingCount}명 미입력)</p>
                ${
                  isTeacher
                    ? `<p>입력된 결과 평균 ${escapeHtml(SAT.formatCloudAnalyticsPercent(summary.averagePercentage))} (n=${summary.sampleSize})${
                        summary.minPercentage != null
                          ? ` · 최저 ${SAT.formatCloudAnalyticsPercent(summary.minPercentage)} · 최고 ${SAT.formatCloudAnalyticsPercent(summary.maxPercentage)}`
                          : ''
                      }</p>
                      ${this.renderCloudCategorySummaryTable(summary.categoryStats.major)}
                      <div id="cloud-class-avg-trend" class="chart-wrapper"></div>`
                    : '<p class="hint-text hint-text--internal no-print">상담용 보기에서는 반 평균·학생별 점수 명단을 숨깁니다.</p>'
                }
                ${
                  isTeacher
                    ? `<div class="table-scroll"><table class="data-table">
                  <thead><tr><th>학생</th><th>상태</th><th>점수</th><th>코멘트</th></tr></thead>
                  <tbody>
                    ${eligible.map((s) => {
                      const row = results.find((r) => r.studentId === s.id);
                      const status = row ? '입력 완료' : SAT.RESULT_MISSING_LABEL;
                      const score = row ? SAT.formatCloudScoreLine(row) : SAT.RESULT_MISSING_LABEL;
                      return `<tr>
                        <td>${escapeHtml(s.name)}${s.active === false ? ' (비활성)' : ''}</td>
                        <td>${escapeHtml(status)}</td>
                        <td>${escapeHtml(score)}</td>
                        <td>${escapeHtml(row?.teacherComment || '')}</td>
                      </tr>`;
                    }).join('') || `<tr><td colspan="4">${renderEmptyState('시험일 기준 재원 학생이 없습니다.')}</td></tr>`}
                  </tbody>
                </table></div>`
                    : ''
                }
                <p class="hint-text hint-text--internal no-print">미입력 학생은 평균 분모에 넣지 않습니다.</p>
                <button type="button" class="btn btn-primary no-print" data-action="open-answer-entry" data-id="${instance.id}">답안 입력</button>
              </div>
            </section>`
          : `<div class="card">${renderEmptyState('반과 배정된 시험을 선택해주세요.', { actionLabel: '시험 설정', actionNav: 'exams' })}</div>`
      }`;

    if (instance && isTeacher) {
      requestAnimationFrame(() => {
        if (this.app.state.currentView !== 'exam-overview') return;
        const el = document.getElementById('cloud-class-avg-trend');
        if (!el) return;
        SAT.renderCloudPercentTrendChart(
          el,
          classTrend.map((row) => ({
            ...row,
            percentage: row.averagePercentage,
            title: row.title,
            date: row.date,
            classSampleSize: row.submittedCount,
          })),
          'cloud-class-avg',
          { emptyMessage: SAT.CLOUD_ANALYTICS_EMPTY.results, ariaLabel: '반 평균 추이' }
        );
      });
    }
  }

  renderBackup(main, data) {
    const counts = SAT.cloudDashboardCounts(data);
    const showDisabled = SAT.shouldShowDisabledBackupActions?.() === true;
    main.innerHTML = `
      ${this.renderLegacyNotice(data)}
      <section class="card">
        <div class="card-header"><h2>${escapeHtml(SAT.PAGE_TITLE_BACKUP || '백업')}</h2></div>
        <div class="card-body">
          <p class="cloud-notice">${escapeHtml(SAT.BACKUP_UNSUPPORTED_NOTICE || '클라우드 파일 백업/내보내기는 아직 지원하지 않습니다.')}</p>
          ${
            showDisabled
              ? `<div class="btn-group">
            <button class="btn btn-secondary" data-action="export-json" disabled title="아직 없습니다">JSON보내기</button>
            <button class="btn btn-secondary" disabled title="아직 없습니다">JSON 가져오기</button>
            <button class="btn btn-danger" data-action="reset-all" disabled>전체 초기화</button>
          </div>`
              : ''
          }
          <h3>${escapeHtml(SAT.BACKUP_STATUS_TITLE || '데이터 현황')}</h3>
          <ul class="simple-list">
            <li>학기: ${counts.terms}개</li>
            <li>반: ${counts.classes}개</li>
            <li>학생: ${counts.students}명</li>
            <li>재원 기록: ${counts.enrollments}건</li>
            <li>시험 배정: ${this.app.assessmentStore?.examInstances?.length || 0}건</li>
            <li>결과: ${this.app.resultStore?.results?.length || 0}건</li>
          </ul>
        </div>
      </section>`;
  }
}

function normalizeOpt(v) {
  return String(v).trim().toUpperCase();
}

function getCurrentAnswer(answers, questions, num) {
  const q = questions.find((x) => x.number === num);
  if (!q) return '';
  return answers[q.id] ?? answers[String(q.number)] ?? '';
}

  SAT.Renderer = Renderer;
})(window.SAT = window.SAT || {});
