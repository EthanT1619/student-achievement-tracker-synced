/**
 * Usage guides, onboarding checklist, and detailed help content.
 */
(function (SAT) {
  SAT.HELP_PREFS_KEY = 'studentAchievementTrackerHelpPrefs';

  const PAGE_GUIDES = {
    dashboard: {
      title: '대시보드 사용법',
      steps: [
        '현재 학기와 내 반을 확인한 뒤 반·학생 또는 답안 입력으로 바로 들어갑니다.',
        '방금 고른 반은 답안 입력·학생 결과·시험 결과에서 기본으로 이어집니다.',
        '다른 컴퓨터에서 바꾼 내용은 헤더 「다시 불러오기」로 확인합니다.',
      ],
    },
    classes: {
      title: '반·학생 관리 사용법',
      steps: [
        '반 카드를 누르면 그 반이 선택되고 아래 학생 목록이 바뀝니다.',
        '선택 반에서 「답안 입력」또는 「학생 결과」로 바로 갈 수 있습니다.',
        '반이나 학생을 새로 넣을 때는 「+ 반 추가」「+ 학생 추가」를 엽니다.',
        '이름 수정·보관·삭제·이관은 「반 관리」또는 학생 「관리」안에 있습니다. 이관은 관리자만 보입니다.',
      ],
    },
    exams: {
      title: '시험 설정 사용법',
      steps: [
        '관리자는 문제집을 만들고 초안을 공개합니다. 공개된 문항은 직접 고치지 않고 새 버전을 만듭니다.',
        '강사는 공개된 문제집을 자기 반에 배정하고 실시일을 정합니다.',
        '배정 후 「답안 입력」에서 학생 답을 넣습니다.',
      ],
    },
    'answer-entry': {
      title: '답안 입력 사용법',
      steps: [
        '반, 시험, 학생을 순서대로 선택합니다.',
        '「빠른 입력」 또는 「일괄 입력」으로 답을 넣습니다.',
        '「저장」하면 자동 채점됩니다. 미입력은 0점이 아닙니다.',
        '「이전 문항」「다음 문항」으로 문항을 이동합니다. 교사 코멘트는 필요할 때 엽니다.',
        '「저장 후 다음 학생」으로 이어서 입력합니다.',
        '다른 화면에서 먼저 저장된 결과가 있으면 충돌 안내가 납니다. 지금 입력은 유지됩니다. 최신본으로 작업하려면 「최신 저장본으로 다시 시작」을 누르세요.',
      ],
    },
    'student-results': {
      title: '학생 결과 사용법',
      steps: [
        '현재 반과 학생을 고릅니다. 기본 보기는 상담용이며 반 평균은 숨깁니다.',
        '목록의 반은 현재 재원 반이고, 이력 표의 반은 시험 당시 반입니다.',
        '교사용으로 바꾸면 반 평균 등 내부 비교를 볼 수 있습니다.',
        '선생님 코멘트는 답안 입력 화면에서 저장합니다. 있는 코멘트만 인쇄에 나갑니다.',
        '「인쇄」하면 지금 보고 있는 상담용/교사용 그대로 출력됩니다.',
        'PDF로 저장할 때 브라우저 인쇄 설정의 「머리글과 바닥글」을 끄면 주소와 페이지 번호가 나오지 않습니다.',
      ],
    },
    'exam-overview': {
      title: '시험 결과 사용법',
      steps: [
        '반과 배정된 시험을 선택합니다.',
        '기본은 교사용이며 입력 현황과 학생별 점수를 봅니다.',
        '상담용으로 바꾸면 반 평균과 학생 명단을 숨깁니다.',
        '미입력은 0점이 아니며 평균 분모에도 넣지 않습니다.',
        '「인쇄」하면 지금 보고 있는 보기 그대로 출력됩니다.',
      ],
    },
    backup: {
      title: '데이터 현황 사용법',
      steps: [
        '반·학생·시험 배정·결과 건수를 확인합니다.',
        '학업 데이터는 클라우드에 있습니다. 파일 백업/내보내기는 아직 없습니다.',
      ],
    },
  };

  const HELP_SECTIONS = [
    {
      id: 'overview',
      title: '프로그램 개요',
      body: `이 프로그램은 학원의 반·학생·CQ 시험·답안·결과를 한곳에서 다루는 성적 도구입니다.

로그인 후 학업 데이터는 클라우드에 저장됩니다. 여러 강사가 각자 자기 반을 관리하고, 관리자는 문제집과 학생 이관을 맡습니다.`,
    },
    {
      id: 'login',
      title: '로그인과 계정',
      body: `Google 계정으로 로그인합니다. 승인된 계정만 학사 화면을 쓸 수 있습니다. 승인이 안 되면 관리자에게 요청하세요.

관리자는 학기·문제집·학생 이관과 전체 학사를 봅니다. 강사는 자기 반·학생·답안·결과를 다룹니다.

다른 계정으로 바꾸려면 로그아웃한 뒤 다시 로그인하세요. 이전 계정 화면은 남지 않습니다.`,
    },
    {
      id: 'classes',
      title: '반과 학생',
      body: `반은 학생과 시험을 묶는 단위입니다. 반을 선택한 뒤 학생을 추가합니다.

학생의 현재 반은 재원 기록을 기준으로 관리됩니다. 결과가 있는 학생은 삭제보다 「비활성화」를 권장합니다.`,
    },
    {
      id: 'exams',
      title: '문제집과 시험 배정',
      body: `관리자가 문제집을 만들고 초안을 공개합니다. 강사는 공개된 문제집을 자기 반에 배정하고 실시일을 정합니다.

공개된 버전은 직접 수정하지 않습니다. 고치려면 「새 버전 만들기」로 초안을 만든 뒤 다시 공개하세요.

CQ는 정규 시험 유형입니다. 「표준 구성으로 시작」은 기본 문항을 불러오는 도구이며, 불러온 뒤 초안에서 문항 수·분류·정답을 바꿀 수 있습니다. 사용하지 않은 초안 문제집은 관리자가 삭제할 수 있습니다. 공개·배정 이력이 있으면 삭제 불가 이유가 보입니다. 시스템 관리자는 테스트 문제집을 강제 삭제할 수 있습니다.`,
    },
    {
      id: 'answer-entry',
      title: '답안 입력과 채점',
      body: `반 → 시험 → 학생 순으로 고른 뒤 답을 입력합니다. 「저장」하면 정답과 비교해 자동 채점됩니다.

미입력은 0점이 아닙니다. 미입력이 있으면 저장 전에 한 번 더 확인합니다. 「저장 후 다음 학생」으로 이어서 입력할 수 있습니다.

객관식은 숫자키(해당 시험의 보기 수만큼), 방향키로 문항을 이동합니다. 입력 패널을 한 번 클릭한 뒤 숫자키를 사용하세요.`,
    },
    {
      id: 'results',
      title: '학생 결과와 시험 결과',
      body: `학생 결과는 한 학생의 CQ 이력을 봅니다. 기본은 상담용이며 반 평균·다른 학생 기록은 숨깁니다. 교사용으로 바꾸면 반 비교를 볼 수 있습니다.

「현재 반」은 지금 재원 중인 반입니다. 이력 표의 「시험 당시 반」은 그 시험을 본 반입니다.

시험 결과는 한 반의 그 시험 입력 현황을 봅니다. 기본은 교사용입니다. 상담용으로 바꾸면 반 명단과 평균을 숨깁니다.

선생님 코멘트는 답안 입력 화면에서 저장합니다. 코멘트가 있을 때만 인쇄에 포함됩니다.

「인쇄」는 지금 보고 있는 상담용/교사용을 그대로 출력합니다. 상담용 인쇄에는 반 평균·다른 학생 비교가 들어가지 않습니다.

PDF로 저장할 때 브라우저 인쇄 설정의 「머리글과 바닥글」을 끄면 주소와 페이지 번호가 나오지 않습니다.`,
    },
    {
      id: 'transfer',
      title: '학생 이관',
      body: `학생을 다른 반·다른 강사에게 넘기는 일은 관리자만 할 수 있습니다. 강사 화면에는 이관 버튼이 없습니다.

이관해도 과거 시험 점수와 시험 당시 반은 그대로입니다. 이전 담당 강사는 조건에 따라 옛 시험을 읽기 전용으로만 볼 수 있습니다. 관리자는 수정할 수 있습니다.`,
    },
    {
      id: 'devices',
      title: '여러 기기와 저장 충돌',
      body: `다른 컴퓨터나 다른 탭에서 바꾼 내용은 즉시 자동으로 따라오지 않습니다. 헤더의 「다시 불러오기」 또는 탭 복귀는 목록과 다른 화면을 최신으로 맞출 때 씁니다. 작성 중인 답안은 보호됩니다.

같은 학생·같은 시험을 두 화면에서 열고 한쪽이 먼저 저장하면, 다른 쪽은 저장할 때 또는 탭 복귀 때 충돌 안내를 받고 저장이 막힙니다. 최신 서버 답안으로 다시 시작하려면 답안 입력 화면의 「최신 저장본으로 다시 시작」을 누르세요. 확인하기 전에는 작성 중인 답이 사라지지 않습니다.`,
    },
    {
      id: 'limits',
      title: '아직 없는 기능',
      body: `다음 기능은 아직 없습니다.
• 클라우드 성적을 JSON 파일로 보내거나 가져오기
• 다른 기기의 변경을 즉시 따라오는 실시간 동기화
• 인터넷 없이 사용하기

학업 데이터는 클라우드에 있습니다. 이 브라우저에만 있다고 생각하지 마세요.`,
    },
    {
      id: 'faq',
      title: '자주 묻는 질문',
      body: `Q. 답안 입력에서 숫자키가 안 됩니다.
A. 답안 입력 패널을 한 번 클릭해 포커스를 준 뒤 입력하세요.

Q. 저장이 안 되고 충돌이라고 합니다.
A. 다른 화면에서 이미 저장된 결과입니다. 지금 입력은 보호됩니다. 답안 입력의 「최신 저장본으로 다시 시작」을 누르면 서버에 저장된 최신 답안으로 다시 시작할 수 있습니다.

Q. 읽기 전용으로 나옵니다.
A. 지금 이 결과는 수정할 수 없습니다. 과거 시험이 항상 잠기는 것은 아니며, 담당이 맞으면 수정할 수 있습니다.

Q. 다른 컴퓨터에도 같은 데이터가 보이나요?
A. 같은 계정으로 로그인하면 클라우드 데이터를 봅니다. 다만 이미 열어 둔 화면은 「다시 불러오기」가 필요합니다.`,
    },
    {
      id: 'troubleshooting',
      title: '오류가 생겼을 때',
      body: `• 반·시험·학생이 선택되었는지 확인
• 헤더 「다시 불러오기」로 최신 상태를 확인
• 미승인이면 관리자에게 계정 승인을 요청
• 인터넷 연결을 확인
• 문제가 계속되면 관리자에게 화면과 시각을 알려 주세요`,
    },
  ];

  const CHECKLIST_STEPS = [
    { id: 'class', label: '반 등록', nav: 'classes', check: (d) => d.classes.length > 0 },
    { id: 'student', label: '학생 등록', nav: 'classes', check: (d) => d.students.some((s) => s.active !== false) },
    { id: 'exam', label: '시험 생성', nav: 'exams', check: (d) => d.exams.length > 0 },
    { id: 'questions', label: '문항·정답 설정', nav: 'exams', check: (d) => d.questions.length > 0 && d.questions.every((q) => q.correctAnswer && q.majorCategory) },
    { id: 'answers', label: '답안 입력·채점', nav: 'answer-entry', check: (d) => d.results.length > 0 },
    { id: 'backup', label: '데이터 현황 확인', nav: 'backup', check: (d) => !!d.settings?.lastBackupAt },
  ];

  SAT.loadHelpPrefs = function loadHelpPrefs() {
    try {
      const raw = localStorage.getItem(SAT.HELP_PREFS_KEY);
      return raw ? JSON.parse(raw) : { pageGuides: {}, checklistOpen: null };
    } catch {
      return { pageGuides: {}, checklistOpen: null };
    }
  };

  SAT.saveHelpPrefs = function saveHelpPrefs(prefs) {
    try {
      localStorage.setItem(SAT.HELP_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore quota errors */
    }
  };

  SAT.isPageGuideOpen = function isPageGuideOpen(view) {
    const prefs = SAT.loadHelpPrefs();
    if (Object.prototype.hasOwnProperty.call(prefs.pageGuides, view)) {
      return !!prefs.pageGuides[view];
    }
    return false;
  };

  SAT.setPageGuideOpen = function setPageGuideOpen(view, open) {
    const prefs = SAT.loadHelpPrefs();
    prefs.pageGuides[view] = !!open;
    SAT.saveHelpPrefs(prefs);
  };

  SAT.isChecklistOpen = function isChecklistOpen(data) {
    const prefs = SAT.loadHelpPrefs();
    if (prefs.checklistOpen !== null) return !!prefs.checklistOpen;
    const done = CHECKLIST_STEPS.filter((s) => s.check(data)).length;
    return done < CHECKLIST_STEPS.length;
  };

  SAT.setChecklistOpen = function setChecklistOpen(open) {
    const prefs = SAT.loadHelpPrefs();
    prefs.checklistOpen = !!open;
    SAT.saveHelpPrefs(prefs);
  };

  SAT.renderPageGuidePanel = function renderPageGuidePanel(view) {
    const guide = PAGE_GUIDES[view];
    if (!guide) return '';
    const open = SAT.isPageGuideOpen(view);
    const panelId = `page-guide-${view}`;
    return `
      <section class="page-guide no-print" data-page-guide="${view}">
        <button type="button" class="page-guide__toggle" data-action="toggle-page-guide" data-guide-view="${view}" aria-expanded="${open}" aria-controls="${panelId}">
          <span class="page-guide__toggle-icon" aria-hidden="true">${open ? '▼' : '▶'}</span>
          <span class="page-guide__toggle-label">이 페이지 사용법</span>
          <span class="page-guide__toggle-hint">${SAT.escapeHtml(guide.title)}</span>
        </button>
        <div id="${panelId}" class="page-guide__body${open ? '' : ' page-guide__body--collapsed'}">
          <ol class="page-guide__steps">
            ${guide.steps.map((s) => `<li>${SAT.escapeHtml(s)}</li>`).join('')}
          </ol>
          <button type="button" class="btn btn-secondary btn-sm page-guide__help-link" data-action="open-help">상세 도움말 보기</button>
        </div>
      </section>`;
  };

  SAT.renderDashboardChecklist = function renderDashboardChecklist(data) {
    const open = SAT.isChecklistOpen(data);
    const panelId = 'dashboard-checklist';
    const items = CHECKLIST_STEPS.map((step) => {
      const done = step.check(data);
      return `<li class="onboard-checklist__item${done ? ' onboard-checklist__item--done' : ''}">
        <span class="onboard-checklist__mark" aria-hidden="true">${done ? '✓' : '○'}</span>
        <span class="onboard-checklist__label">${SAT.escapeHtml(step.label)}</span>
        ${done ? '' : `<button type="button" class="btn btn-secondary btn-sm onboard-checklist__go" data-nav="${step.nav}">시작</button>`}
      </li>`;
    }).join('');
    const doneCount = CHECKLIST_STEPS.filter((s) => s.check(data)).length;

    return `
      <section class="onboard-checklist no-print">
        <button type="button" class="page-guide__toggle onboard-checklist__toggle" data-action="toggle-checklist" aria-expanded="${open}" aria-controls="${panelId}">
          <span class="page-guide__toggle-icon" aria-hidden="true">${open ? '▼' : '▶'}</span>
          <span class="page-guide__toggle-label">처음 사용 순서</span>
          <span class="page-guide__toggle-hint">${doneCount}/${CHECKLIST_STEPS.length} 완료</span>
        </button>
        <div id="${panelId}" class="onboard-checklist__body${open ? '' : ' page-guide__body--collapsed'}">
          <p class="onboard-checklist__intro">아래 순서대로 진행하면 시험 등록부터 결과 확인까지 완료할 수 있습니다.</p>
          <ol class="onboard-checklist__list">${items}</ol>
        </div>
      </section>`;
  };

  SAT.renderFieldHint = function renderFieldHint(type) {
    const hints = {
      'category-major': {
        title: '대분류',
        text: 'Grammar, Reading, Dialogue처럼 큰 평가 영역입니다. 모든 문항에 필수이며, 결과 분석의 기준이 됩니다.',
      },
      'category-middle': {
        title: '중분류',
        text: 'Present Perfect, Main Idea처럼 세부 학습 유형입니다. 선택 사항이며, 비워 두면 분석에서 「미분류」로 표시됩니다.',
      },
      'exam-questions': {
        title: '문항 설정',
        text: '정답과 대분류는 필수입니다. 연속 문항은 「이전 문항 분류 복사」로 빠르게 입력할 수 있습니다.',
      },
      'answer-entry': {
        title: '답안 입력 팁',
        text: '빠른 입력: 패널 선택 후 숫자키 1~5 연속 입력. 일괄 입력: 12345… 또는 쉼표·공백 구분. 문항 번호 클릭으로 수정 가능.',
      },
      'json-backup': {
        title: '데이터 저장 위치',
        text: '학업 데이터는 클라우드에 있습니다. 화면의 JSON보내기/가져오기는 아직 없습니다. 다른 기기 변경은 「다시 불러오기」로 확인하세요.',
        warn: true,
      },
    };
    const h = hints[type];
    if (!h) return '';
    return `
      <div class="field-hint${h.warn ? ' field-hint--warn' : ''}" role="note">
        <strong class="field-hint__title">${SAT.escapeHtml(h.title)}</strong>
        <p class="field-hint__text">${SAT.escapeHtml(h.text)}</p>
      </div>`;
  };

  SAT.renderEmptyState = function renderEmptyState(message, options = {}) {
    const { actionLabel, actionNav, actionAction, secondaryLabel, secondaryNav } = options;
    const buttons = [];
    if (actionNav && actionLabel) {
      buttons.push(`<button type="button" class="btn btn-primary" data-nav="${actionNav}">${SAT.escapeHtml(actionLabel)}</button>`);
    }
    if (actionAction && actionLabel) {
      buttons.push(`<button type="button" class="btn btn-primary" data-action="${actionAction}">${SAT.escapeHtml(actionLabel)}</button>`);
    }
    if (secondaryNav && secondaryLabel) {
      buttons.push(`<button type="button" class="btn btn-secondary" data-nav="${secondaryNav}">${SAT.escapeHtml(secondaryLabel)}</button>`);
    }
    const actionsHtml = buttons.length ? `<div class="empty-state__actions">${buttons.join('')}</div>` : '';
    return `<div class="empty-state"><p>${SAT.escapeHtml(message)}</p>${actionsHtml}</div>`;
  };

  SAT.renderHelpModalShell = function renderHelpModalShell() {
    const toc = HELP_SECTIONS.map(
      (s) => `<li><a href="#help-${s.id}" class="help-toc__link" data-action="help-scroll" data-help-id="${s.id}">${SAT.escapeHtml(s.title)}</a></li>`
    ).join('');
    const sections = HELP_SECTIONS.map(
      (s) => `<section id="help-${s.id}" class="help-section" tabindex="-1">
        <h3 class="help-section__title">${SAT.escapeHtml(s.title)}</h3>
        <div class="help-section__body">${SAT.formatHelpBody(s.body)}</div>
      </section>`
    ).join('');

    return `
      <div class="help-modal__header">
        <h2 class="help-modal__title" id="help-modal-title">사용 안내</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-action="close-help" aria-label="도움말 닫기">닫기</button>
      </div>
      <div class="help-modal__layout">
        <nav class="help-toc" aria-label="도움말 목차">
          <p class="help-toc__heading">목차</p>
          <ul class="help-toc__list">${toc}</ul>
        </nav>
        <div class="help-modal__content">${sections}</div>
      </div>`;
  };

  SAT.formatHelpBody = function formatHelpBody(text) {
    return SAT.escapeHtml(text)
      .split('\n')
      .map((line) => (line.trim() ? `<p>${line}</p>` : ''))
      .join('');
  };

  SAT.getHelpSectionIds = function getHelpSectionIds() {
    return HELP_SECTIONS.map((s) => s.id);
  };
})(window.SAT = window.SAT || {});
