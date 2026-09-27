/* =====================================================================
   舌象智析 · 前端交互逻辑（静态演示版）
   - 拖拽 / 点击上传（校验格式与大小）
   - 分析流程走本地示例数据（assets/sample/sample_data.json）
   - 渲染三图、概览、ECharts 置信度柱状图、形态指标、参考说明
   - 历史记录 / 登录注册 / 趋势分析 全部走 localStorage 本地模拟
   - 导出报告走浏览器打印（另存 PDF）
   - 全部为示例演示，不含真实后端推理
   ===================================================================== */

(function () {
  'use strict';

  // ---------------- 全局状态 ----------------
  let currentRecordId = null;
  let currentAnalysis = null;   // 最近一次分析的完整结果，供对话解读使用
  let selectedFile = null;
  let sublingualFile = null;
  let isGuest = false;
  const charts = [];           // 已渲染的 ECharts 实例，供 resize 使用
  let errorTimer = null;

  // ---------------- 静态演示站本地存储层（无后端，全部走 localStorage） ----------------
  const DEMO_USERS_KEY = 'tongue_demo_users';
  const DEMO_HISTORY_KEY = 'tongue_demo_history';
  const DEMO_CURRENT_KEY = 'tongue_demo_current_user';

  function demoLoadUsers() {
    try { return JSON.parse(localStorage.getItem(DEMO_USERS_KEY)) || []; } catch (e) { return []; }
  }
  function demoSaveUsers(list) {
    try { localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function demoFindUser(name) { return demoLoadUsers().find(function (u) { return u.username === name; }); }
  function demoSetUser(u) {
    try { localStorage.setItem(DEMO_CURRENT_KEY, JSON.stringify(u)); } catch (e) { /* ignore */ }
  }
  function demoLoadUser() {
    try { const v = localStorage.getItem(DEMO_CURRENT_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function demoClearUser() {
    try { localStorage.removeItem(DEMO_CURRENT_KEY); } catch (e) { /* ignore */ }
  }
  function demoReadHistory() {
    try { return JSON.parse(localStorage.getItem(DEMO_HISTORY_KEY)) || []; } catch (e) { return []; }
  }
  function demoPushHistory(data) {
    const list = demoReadHistory();
    const rec = {
      id: Date.now(),
      created_at: new Date().toLocaleString('zh-CN', { hour12: false }),
      color_class: (data.color && data.color.top_class) || '—',
      shape_class: (data.shape && data.shape.top_class) || '—',
      color_conf: (data.color && data.color.top_conf) || 0,
      shape_conf: (data.shape && data.shape.top_conf) || 0,
      image_path: data.original_url || '',
      data: data
    };
    list.unshift(rec);
    try { localStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) { /* ignore */ }
  }
  function demoRemoveHistory(id) {
    const list = demoReadHistory().filter(function (r) { return String(r.id) !== String(id); });
    try { localStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  // 示例结果图片地址归一化：去掉前导 /，兼容 GitHub Pages 子路径部署
  function normalizeUrls(d) {
    if (!d) return d;
    ['original_url', 'mask_url', 'overlay_url'].forEach(function (k) {
      if (typeof d[k] === 'string' && d[k].charAt(0) === '/') d[k] = d[k].replace(/^\//, '');
    });
    return d;
  }
  function genLocalRecordId() {
    const d = new Date();
    const p = function (n) { return ('0' + n).slice(-2); };
    return 'DEMO-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  // 最大文件大小：10MB
  const MAX_SIZE = 10 * 1024 * 1024;
  const ALLOWED_EXT = ['.jpg', '.jpeg', '.png'];
  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/jpg'];

  // 中医参考说明查表（基于用户提供的详细中医舌诊理论）
  const TCM_NOTES = {
    color: {
      '绛舌': '绛舌呈深红色，较红舌更甚，热邪深入营血。多见于高热或久病重病、阴虚火旺，提示体内热盛伤津，需注意清热凉血、滋阴降火。',
      '紫舌': '紫舌主血瘀。青紫为寒凝血瘀，绛紫为热盛血瘀，提示气血运行不畅，常伴有痛经、心脑血管问题或体内有寒凝，可结合活血化瘀调理。',
      '红舌': '红舌主热证。舌尖红多为心火，舌边红多为肝胆火。多见于阴虚内热或实热证，宜清热养阴。若舌红且无苔，多为阴虚。',
      '淡白舌': '淡白舌主虚证、寒证。血色很少，多见于气血两虚或阳虚寒盛，常伴有怕冷、乏力，提示气血不足或阳气亏虚，宜益气养血温阳。',
      '黄舌': '黄舌多主热证、里证。淡黄为热轻，深黄为热盛，焦黄为热结，多见于湿热内蕴或实热证。常伴有口苦、舌干等表现。'
    },
    shape: {
      '剥落苔/地图舌': '剥落苔（地图舌）表示胃气、胃阴不足，舌苔部分剥脱。多见于阴虚、过敏体质或小儿，舌面有沟裂，宜养胃阴、调脾胃。',
      '正常薄白苔': '正常薄白苔，苔薄而均匀，舌面润泽，干湿适中，不滑不燥，是胃气充盛、脏腑功能协调的健康舌象表现。',
      '厚腻苔': '厚腻苔多主湿浊、痰饮、食积。白腻为寒湿，黄腻为湿热，苔质致密粘腻刮不去，提示体内水湿运化失常，宜健脾化湿消食。'
    },
    body_shape: {
      '胖大舌': '舌体比正常大，边缘有牙齿印（齿痕舌）。多提示脾虚湿盛，容易水肿、大便黏腻，需注意健脾祛湿。',
      '瘦薄舌': '舌体干瘪瘦小。多提示气血两虚或阴虚火旺，需注意益气养血或滋阴降火。',
      '正常': '舌体大小形态正常，未见明显异常。'
    },
    cracks: {
      '无': '舌面未见明显裂纹，舌体表面光滑完整。',
      '轻微': '舌面可见少量细微裂纹，提示可能有阴液不足或热盛伤津的倾向。',
      '明显': '舌面可见明显裂纹，舌面上有沟裂。若天生无苔则属阴虚，若厚苔有裂则属热盛伤津，需注意养阴生津。'
    },
    coating_color: {
      '白苔': '苔色白，主表证、寒证。薄白苔为正常或外感初期；白厚苔多为寒湿或食积。',
      '黄苔': '苔色黄，主热证。苔色越黄，热邪越重（如胃炎、上火）。黄腻苔多为湿热，常伴口苦、痘痘。',
      '灰黑苔': '苔色灰黑，主里热或寒湿重证。苔干黑为热极，苔滑黑为寒极，建议及时就医。',
      '正常': '苔色未见明显异常。'
    },
    coating_texture: {
      '厚苔': '舌苔偏厚，提示食积、痰浊或病邪入里。',
      '薄苔': '舌苔薄，提示病在表或轻症。',
      '润': '舌面润泽，津液未伤，属正常表现。',
      '燥': '舌面偏干燥，干燥起刺多为高热伤津，需注意养阴生津。',
      '水滑': '舌面水滑欲滴，多为水湿内停，提示体内水液代谢失常。',
      '腻苔': '苔质致密粘腻刮不去，为湿浊或痰饮，需注意健脾化湿。',
      '腐苔': '苔质疏松如豆腐渣可刮去，多为食积或胃热。'
    },
    zonal: {
      'default': '传统中医将舌面划分为不同脏腑区域：舌尖对应心肺，舌中对应脾胃，舌根对应肾与膀胱，舌边对应肝胆。各分区颜色异常可辅助定位脏腑问题。'
    },
    ecchymosis: {
      'default': '瘀斑为舌面局部紫暗色斑块，主血瘀证。瘀点/红点为舌尖或舌面红色小点，主热盛（心火上炎或气分热盛）。'
    },
    refined_color: {
      'default': '在舌色大类基础上进一步细分：淡紫舌（阳虚血瘀）、紫红舌（热盛血瘀）、绛紫舌（痰热壅滞）、枯白舌（精气衰败）。'
    },
    sublingual: {
      'default': '舌下络脉分析需单独上传舌底照片。正常舌下络脉仅隐隐可见，呈紫红色线状，绝不粗胀，直径不超过2.7mm，长度不超过舌下肉阜连线的3/5。'
    }
  };

  // ---------------- DOM ready 初始化 ----------------
  document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initUpload();
    initExport();
    initFloatChat();
    initDemo();
    initDemoGallery();
    initKeyboard();
    initViewerTabs();
    initEvidenceToggle();
    initCaptureResult();
    window.addEventListener('resize', () => {
      charts.forEach(c => { try { c.resize(); } catch (e) {} });
      if (trendChart) { try { trendChart.resize(); } catch (e) {} }
    });
  });

  // 采集页（/capture.html）捕获并完成分析后跳回首页时，直接渲染结果
  function initCaptureResult() {
    const u = new URLSearchParams(location.search);
    if (!u.get('capture')) return;
    let raw = null;
    try { raw = sessionStorage.getItem('pendingAnalysis'); }
    catch (e) { raw = null; }
    try { sessionStorage.removeItem('pendingAnalysis'); }
    catch (e) { /* ignore */ }
    if (!raw) { console.warn('[capture] 跳转首页但未取到 pendingAnalysis，结果未渲染'); return; }
    let data = null;
    try { data = JSON.parse(raw); } catch (e) { data = null; }
    if (!data) { console.error('[capture] pendingAnalysis JSON 解析失败', String(raw).slice(0, 200)); return; }
    // 移除查询参数，避免刷新时重复渲染（相对路径，兼容子路径部署）
    if (history.replaceState) {
      try { history.replaceState(null, '', '.'); } catch (e) { /* ignore */ }
    }
    normalizeUrls(data);
    data.record_id = genLocalRecordId();
    data.is_guest = true;
    try { renderResult(data); } catch (e) { console.error('[capture] renderResult 渲染抛错', e); /* 渲染失败不阻断页面 */ }
    // 静态演示站：示例结果同样写入本地历史，供历史记录与趋势分析使用
    demoPushHistory(data);
    loadHistory();
    const rs = document.getElementById('result-section');
    if (rs) {
      setTimeout(() => { rs.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
    }
  }

  // ===================================================================
  // 影像查看器 tab 切换
  // ===================================================================
  function initViewerTabs() {
    const tabs = document.querySelectorAll('.viewer-tab');
    if (!tabs.length) return;
    tabs.forEach(tab => {
      tab.addEventListener('click', function() {
        var view = this.getAttribute('data-view');
        tabs.forEach(t => t.classList.remove('is-active'));
        this.classList.add('is-active');
        var imgs = {
          original: document.getElementById('img-original'),
          mask: document.getElementById('img-mask'),
          overlay: document.getElementById('img-overlay')
        };
        Object.keys(imgs).forEach(k => {
          if (!imgs[k]) return;
          if (k === view) {
            imgs[k].classList.add('is-active');
            imgs[k].removeAttribute('hidden');
          } else {
            imgs[k].classList.remove('is-active');
            imgs[k].setAttribute('hidden', '');
          }
        });
      });
    });
  }

  // ===================================================================
  // AI 证据链面板 折叠切换（默认收起）
  // ===================================================================
  function initEvidenceToggle() {
    const head = document.getElementById('evidence-toggle');
    const card = head ? head.closest('.evidence-card') : null;
    if (!head || !card) return;
    head.addEventListener('click', function() {
      var open = card.classList.toggle('is-open');
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // ===================================================================
  // 上传逻辑
  // ===================================================================
  function initUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const analyzeBtn = document.getElementById('analyze-btn');

    // 点击触发文件选择
    dropzone.addEventListener('click', (e) => {
      // 避免点击"重新选择"按钮时再次触发
      if (e.target.closest('#reselect-btn')) return;
      fileInput.click();
    });
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    // Hero 开始分析按钮：滚动到上传区
    const heroCta = document.getElementById('hero-cta');
    if (heroCta) {
      heroCta.addEventListener('click', () => {
        const up = document.getElementById('upload-section');
        if (up) up.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // 文件选择
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFile(file);
    });

    // 拖拽
    ['dragenter', 'dragover'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });
    ['dragleave', 'dragend'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === dropzone) dropzone.classList.remove('dragover');
      });
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    // 重新选择
    const reselectBtn = document.getElementById('reselect-btn');
    if (reselectBtn) {
      reselectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.value = '';
        fileInput.click();
      });
    }

    // 舌下（舌底）照片
    const sublingualInput = document.getElementById('sublingual-input');
    if (sublingualInput) {
      sublingualInput.addEventListener('change', (e) => {
        handleSublingualFile(e.target.files && e.target.files[0]);
      });
      // 点击 label 后清除残留 value，使重复选择同一文件也能触发 change
      document.querySelector('.sublingual-label').addEventListener('click', () => {
        sublingualInput.value = '';
      });
    }

    // 开始分析
    analyzeBtn.addEventListener('click', () => {
      if (selectedFile) analyzeImage(selectedFile);
    });
  }

  // ===================================================================
  // 认证模块
  // ===================================================================
  let currentUser = null;

  function initAuth() {
    // 静态演示站：无后端账号系统。优先恢复本地登录态，否则默认进入游客模式，打开即可体验
    const stored = demoLoadUser();
    if (stored && stored.username) {
      currentUser = stored;
      showAuthState(true);
      loadHistory();
    } else {
      enterGuestMode();
      loadHistory();
    }

    // 登录按钮
    document.getElementById('login-btn').addEventListener('click', function() {
      openAuthModal('login');
    });
    // 注册按钮
    document.getElementById('register-btn').addEventListener('click', function() {
      openAuthModal('register');
    });
    // 退出按钮（点击后弹窗确认）
    document.getElementById('logout-btn').addEventListener('click', function() {
      if (!confirm('确定要退出登录吗？')) return;
      // 静态演示站：清除本地登录态，回到游客模式
      demoClearUser();
      isGuest = true;
      currentUser = null;
      showAuthState(false);
      document.getElementById('result-section').hidden = true;
      document.getElementById('upload-preview').hidden = true;
      document.getElementById('upload-empty').hidden = false;
      document.getElementById('file-input').value = '';
      selectedFile = null;
      document.getElementById('analyze-btn').disabled = true;
    });
    // 趋势分析按钮
    document.getElementById('trend-btn').addEventListener('click', function() {
      openTrendModal();
    });
    // 用户中心按钮
    document.getElementById('profile-btn').addEventListener('click', function() {
      openProfileModal();
    });
    // 游客体验按钮
    document.getElementById('guest-btn').addEventListener('click', function() {
      enterGuestMode();
    });
    // 游客登录提示链接
    document.getElementById('guest-login-hint').addEventListener('click', function(e) {
      e.preventDefault();
      openAuthModal('login');
    });
    // 用户中心模态框关闭
    document.getElementById('profile-modal-close').addEventListener('click', closeProfileModal);
    document.getElementById('profile-modal').addEventListener('click', function(e) {
      if (e.target === this) closeProfileModal();
    });
    // 趋势分析模态框关闭
    document.getElementById('trend-modal-close').addEventListener('click', closeTrendModal);
    document.getElementById('trend-modal').addEventListener('click', function(e) {
      if (e.target === this) closeTrendModal();
    });
    // 用户中心选项卡切换
    document.querySelectorAll('.profile-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        switchProfileTab(this.dataset.tab);
      });
    });
    // 保存个人资料
    document.getElementById('profile-save-btn').addEventListener('click', saveProfile);
    // 修改密码
    document.getElementById('profile-pwd-btn').addEventListener('click', changePassword);
    // 切换登录/注册
    document.getElementById('auth-toggle-link').addEventListener('click', function(e) {
      e.preventDefault();
      var mode = document.getElementById('auth-modal-title').textContent === '登录' ? 'register' : 'login';
      openAuthModal(mode);
    });
    // 模态框关闭
    document.getElementById('auth-modal-close').addEventListener('click', closeAuthModal);
    document.getElementById('auth-modal').addEventListener('click', function(e) {
      if (e.target === this) closeAuthModal();
    });
    // 提交按钮
    document.getElementById('auth-submit-btn').addEventListener('click', submitAuth);
    // 回车提交
    document.getElementById('auth-password-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') submitAuth();
    });
    document.getElementById('auth-username-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') submitAuth();
    });
    document.getElementById('auth-confirm-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') submitAuth();
    });
  }

  function showAuthState(loggedIn) {
    document.getElementById('login-btn').hidden = loggedIn || isGuest;
    document.getElementById('register-btn').hidden = loggedIn || isGuest;
    document.getElementById('guest-btn').hidden = loggedIn || isGuest;
    document.getElementById('auth-user').hidden = !loggedIn;
    if (loggedIn && currentUser) {
      document.getElementById('auth-username').textContent = currentUser.username;
    }
    // 上传区域状态
    var uploadSection = document.getElementById('upload-section');
    var dropzone = document.getElementById('dropzone');
    var analyzeBtn = document.getElementById('analyze-btn');
    if (!loggedIn && !isGuest) {
      uploadSection.querySelector('.section-desc').textContent = '请登录或使用游客模式体验舌象分析功能';
      dropzone.style.pointerEvents = 'none';
      dropzone.style.opacity = '0.5';
      analyzeBtn.disabled = true;
    } else {
      uploadSection.querySelector('.section-desc').textContent = '拖拽或点击上传一张舌象正面图片，支持 JPG / PNG，单张不超过 10MB';
      dropzone.style.pointerEvents = '';
      dropzone.style.opacity = '';
    }
    // 显示/隐藏游客提示横幅
    setGuestBanner(isGuest);
    // 历史记录区提示
    var historySection = document.getElementById('history-section');
    var historyList = document.getElementById('history-list');
    if (historySection && historyList) {
      if (isGuest) {
        historySection.hidden = true;
      } else {
        historySection.hidden = false;
      }
    }
  }

  function enterGuestMode() {
    isGuest = true;
    currentUser = null;
    showAuthState(false);
    // 清空之前的结果
    document.getElementById('result-section').hidden = true;
    document.getElementById('upload-preview').hidden = true;
    document.getElementById('upload-empty').hidden = false;
    document.getElementById('file-input').value = '';
    selectedFile = null;
    document.getElementById('analyze-btn').disabled = true;
    document.getElementById('upload-tip').textContent = '请先选择一张舌象图片';
  }

  function setGuestBanner(show) {
    var banner = document.getElementById('guest-banner');
    if (banner) {
      banner.hidden = !show;
    }
  }

  function openAuthModal(mode) {
    var modal = document.getElementById('auth-modal');
    var title = document.getElementById('auth-modal-title');
    var submitBtn = document.getElementById('auth-submit-btn');
    var switchP = document.getElementById('auth-switch');
    var link = document.getElementById('auth-toggle-link');
    var errorEl = document.getElementById('auth-error');
    var confirmGroup = document.getElementById('auth-confirm-group');
    var usernameHint = document.getElementById('auth-username-hint');

    errorEl.hidden = true;
    document.getElementById('auth-username-input').value = '';
    document.getElementById('auth-password-input').value = '';
    document.getElementById('auth-confirm-input').value = '';

    if (mode === 'login') {
      title.textContent = '登录';
      submitBtn.textContent = '登录';
      switchP.innerHTML = '还没有账号？<a href="#" id="auth-toggle-link">立即注册</a>';
      confirmGroup.hidden = true;
      usernameHint.hidden = true;
    } else {
      title.textContent = '注册';
      submitBtn.textContent = '注册';
      switchP.innerHTML = '已有账号？<a href="#" id="auth-toggle-link">立即登录</a>';
      confirmGroup.hidden = false;
      usernameHint.hidden = false;
    }
    // 重新绑定切换链接
    document.getElementById('auth-toggle-link').addEventListener('click', function(e) {
      e.preventDefault();
      var nextMode = mode === 'login' ? 'register' : 'login';
      openAuthModal(nextMode);
    });
    modal.hidden = false;
    document.getElementById('auth-username-input').focus();
  }

  function closeAuthModal() {
    document.getElementById('auth-modal').hidden = true;
  }

  function submitAuth() {
    var username = document.getElementById('auth-username-input').value.trim();
    var password = document.getElementById('auth-password-input').value;
    var confirmPassword = document.getElementById('auth-confirm-input').value;
    var errorEl = document.getElementById('auth-error');
    var isLogin = document.getElementById('auth-modal-title').textContent === '登录';

    // 通用校验
    if (!username) {
      errorEl.textContent = '请输入用户名';
      errorEl.hidden = false;
      return;
    }
    if (!password || password.length < 6) {
      errorEl.textContent = '密码至少 6 个字符';
      errorEl.hidden = false;
      return;
    }

    // 注册专用校验
    if (!isLogin) {
      // 密码：至少6位，包含数字和英文字母
      if (!/[0-9]/.test(password)) {
        errorEl.textContent = '密码必须包含数字';
        errorEl.hidden = false;
        return;
      }
      if (!/[a-zA-Z]/.test(password)) {
        errorEl.textContent = '密码必须包含英文字母';
        errorEl.hidden = false;
        return;
      }
      // 密码二次确认
      if (password !== confirmPassword) {
        errorEl.textContent = '两次输入的密码不一致';
        errorEl.hidden = false;
        return;
      }
    }

    errorEl.hidden = true;
    var submitBtn = document.getElementById('auth-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '处理中...';

    // 静态演示站：登录/注册走本地 localStorage 模拟，无真实后端
    setTimeout(function() {
      if (isLogin) {
        var u = demoLoadUsers().find(function(x) { return x.username === username; });
        if (!u || u.password !== password) {
          errorEl.textContent = '用户名或密码错误（演示站账号仅保存在本机浏览器）';
          errorEl.hidden = false;
        } else {
          demoSetUser(u);
          currentUser = u;
          isGuest = false;
          showAuthState(true);
          closeAuthModal();
          loadHistory();
        }
      } else {
        if (demoFindUser(username)) {
          errorEl.textContent = '该用户名已被注册';
          errorEl.hidden = false;
        } else {
          var nu = { username: username, password: password, age: '', gender: '', medical_history: '' };
          var list = demoLoadUsers();
          list.push(nu);
          demoSaveUsers(list);
          demoSetUser(nu);
          currentUser = nu;
          isGuest = false;
          showAuthState(true);
          closeAuthModal();
          loadHistory();
        }
      }
      submitBtn.disabled = false;
      submitBtn.textContent = isLogin ? '登录' : '注册';
    }, 400);
  }

  // 校验 + 预览
  function handleFile(file) {
    const tip = document.getElementById('upload-tip');
    const analyzeBtn = document.getElementById('analyze-btn');

    // 格式校验：扩展名 + MIME 双重判断
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const mimeOk = !file.type || ALLOWED_MIME.indexOf(file.type) !== -1;
    const extOk = ALLOWED_EXT.indexOf(ext) !== -1;
    if (!extOk || !mimeOk) {
      selectedFile = null;
      analyzeBtn.disabled = true;
      tip.textContent = '仅支持 JPG / PNG 格式图片';
      showError('仅支持 JPG / PNG 格式图片');
      return;
    }
    // 大小校验
    if (file.size > MAX_SIZE) {
      selectedFile = null;
      analyzeBtn.disabled = true;
      tip.textContent = '图片大小不能超过 10MB';
      showError('图片大小不能超过 10MB');
      return;
    }

    selectedFile = file;
    analyzeBtn.disabled = false;
    tip.textContent = '已选择图片，点击「开始分析」';

    // 预览
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('preview-img').src = e.target.result;
      document.getElementById('preview-name').textContent = file.name;
      document.getElementById('preview-size').textContent = formatSize(file.size);
      document.getElementById('upload-empty').hidden = true;
      document.getElementById('upload-preview').hidden = false;
    };
    reader.readAsDataURL(file);
  }

  // 舌下（舌底）照片选择
  function handleSublingualFile(file) {
    const state = document.getElementById('sublingual-state');
    if (!file) {
      sublingualFile = null;
      if (state) { state.classList.remove('has-file'); state.textContent = '舌面+舌下照片可更精准评估血瘀'; }
      return;
    }
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const mimeOk = !file.type || ALLOWED_MIME.indexOf(file.type) !== -1;
    const extOk = ALLOWED_EXT.indexOf(ext) !== -1;
    if (!extOk || !mimeOk || file.size > MAX_SIZE) {
      sublingualFile = null;
      if (state) { state.classList.remove('has-file'); state.textContent = '舌下照片格式/大小不符，已忽略'; }
      return;
    }
    sublingualFile = file;
    if (state) { state.classList.add('has-file'); state.textContent = '已选择舌下照片：' + file.name; }
  }

  // ===================================================================
  // 分析
  // ===================================================================
  async function analyzeImage(file) {
    const analyzeBtn = document.getElementById('analyze-btn');
    showLoading(true);
    startAnalysisSteps();
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '分析中…';
    hideError();

    // 120 秒超时（CPU 首次加载模型较慢）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // 可选：舌下照片（存在才附带）
      if (sublingualFile) {
        formData.append('sublingual', sublingualFile);
      }

      // 游客模式：附加年龄/性别以获取个性化建议
      if (isGuest) {
        var guestAge = document.getElementById('guest-age').value.trim();
        var guestGender = document.getElementById('guest-gender').value;
        if (guestAge) formData.append('age', guestAge);
        if (guestGender) formData.append('gender', guestGender);
      }

      // 静态演示站：不调用后端，直接加载内置示例分析结果（真实推理产物），保留四步加载动画
      const resp = await fetch('assets/sample/sample_data.json?v=2', { signal: controller.signal });
      let data = null;
      try { data = await resp.json(); } catch (e) { data = null; }

      if (resp.ok && data && data.success) {
        normalizeUrls(data);
        data.record_id = genLocalRecordId();
        data.is_guest = true;
        var _q = data.quality || {};
        var _m = data.morphology || {};
        var _c = data.color || {};
        analysisFinalMetrics = [
          (typeof _q.quality_score === 'number') ? _q.quality_score : null,
          '已定位',
          (_m.area_ratio != null) ? Math.round(_m.area_ratio * 100) + '%' : null,
          (typeof _c.top_conf === 'number') ? Math.round(_c.top_conf * 100) + '%' : null
        ];
        // 写入本地历史记录（演示站游客也可回看）
        demoPushHistory(data);
        renderResult(data);
        loadHistory();
      } else {
        showError('示例结果加载失败，请刷新页面后重试');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        showError('分析超时（超过 120 秒），请确认服务正常运行后重试');
      } else {
        showError('网络错误，请检查服务是否启动');
      }
    } finally {
      clearTimeout(timeoutId);
      finishAnalysisSteps();
      showLoading(false);
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = '开始分析';
    }
  }

  // ===================================================================
  // 渲染结果
  // ===================================================================
  function renderQuality(q) {
    const card = document.getElementById('quality-card');
    if (!card || !q || typeof q.quality_score === 'undefined') { return; }
    const score = q.quality_score;
    const levelText = { 'good': '优秀', 'ok': '一般', 're_shoot': '建议重拍' }[q.level] || '—';
    document.getElementById('quality-score').textContent = score + '/100';
    const levelEl = document.getElementById('quality-level');
    levelEl.textContent = levelText;
    levelEl.className = 'quality-level quality-level--' + (q.level || '');
    const bar = document.getElementById('quality-bar');
    bar.style.width = score + '%';
    // 组件子项（对勾展示，报告式）
    const labels = { sharpness: '清晰度', exposure: '光照', color_cast: '色偏',
                     integrity: '完整性', completeness: '舌体完整度',
                     tongue_ratio: '舌体占比', centeredness: '居中程度' };
    const compEl = document.getElementById('quality-comp');
    const comp = q.components || {};
    compEl.innerHTML = Object.keys(comp).map(function(k) {
      const v = comp[k];
      const good = v >= 60;
      return '<span class="quality-comp-item ' + (good ? 'is-ok' : 'is-warn') + '">' +
             '<span class="quality-comp-check">' + (good ? '✓' : '△') + '</span>' +
             (labels[k] || k) + ' <b>' + v + ' 分</b></span>';
    }).join('');
    // 提示（质量一般/建议重拍）
    const noteEl = document.getElementById('quality-note');
    if (q.quality_pass === false) {
      noteEl.textContent = '图像质量欠佳，建议在自然光下重新拍摄并确保舌体完整进入取景区域。';
      noteEl.hidden = false;
    } else if (q.level === 'ok') {
      noteEl.textContent = '图像质量一般，不影响本次分析，建议后续在更稳定光照下拍摄。';
      noteEl.hidden = false;
    } else {
      noteEl.hidden = true;
    }
    card.hidden = false;
  }

  // ===================================================================
  // 数字舌象画像
  // ===================================================================
  function setDim(id, val, unit) {
    const vEl = document.getElementById(id);
    const bEl = document.getElementById(id + '-bar');
    if (!vEl || val == null) return;
    vEl.textContent = Math.round(val) + (unit || '');
    if (bEl) {
      bEl.style.width = '0';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { bEl.style.width = Math.min(100, val) + '%'; });
      });
    }
  }

  function reportId() {
    const d = new Date();
    const p = function (n) { return ('0' + n).slice(-2); };
    return 'DTP-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function renderProfileObs(score, ratio, colorClass, shapeClass) {
    const ul = document.getElementById('profile-observation');
    if (!ul) return;
    const rows = [];
    if (ratio != null) {
      rows.push(ratio >= 30 ? '舌体区域完整，约占画面 ' + ratio.toFixed(0) + '%' : '舌体占画面比例偏低，建议使舌体靠近取景中心');
    }
    if (score != null) {
      rows.push(score >= 80 ? '图像清晰度与光照良好，满足分析要求' : (score >= 60 ? '图像整体可用，个别角度可再优化' : '图像质量有限，建议在自然光下重新拍摄'));
    }
    if (colorClass) rows.push('舌色主要呈' + colorClass + '，色彩分布可供参考');
    if (shapeClass) rows.push('舌苔以' + shapeClass + '为主，苔质特征已纳入评估');
    ul.innerHTML = rows.map(function (t) { return '<li>' + t + '</li>'; }).join('');
  }

  function fillProfile(data) {
    const card = document.getElementById('profile-card');
    if (!card) return;
    const q = data.quality || {};
    const score = (typeof q.quality_score === 'number') ? q.quality_score : null;
    const colorConf = data.color ? pct(data.color.top_conf) : null;
    const shapeConf = data.shape ? pct(data.shape.top_conf) : null;
    const colorClass = data.color ? (data.color.top_class || '') : '';
    const shapeClass = data.shape ? (data.shape.top_class || '') : '';
    const m = data.morphology || {};
    const ratio = (m.area_ratio != null) ? Math.min(100, Number(m.area_ratio) * 100) : null;
    const symmetry = (m.symmetry != null) ? Number(m.symmetry) : null;

    setDim('pf-quality', score, '分');
    setDim('pf-color', colorConf, '分');
    setDim('pf-shape', shapeConf, '分');
    setDim('pf-morph', ratio, '%');

    const colorSub = document.getElementById('pf-color-sub');
    const shapeSub = document.getElementById('pf-shape-sub');
    const morphSub = document.getElementById('pf-morph-sub');
    if (colorSub) colorSub.textContent = colorClass || '';
    if (shapeSub) shapeSub.textContent = shapeClass || '';
    if (morphSub) morphSub.textContent = (symmetry != null) ? '对称度 ' + symmetry.toFixed(2) : '';

    const idEl = document.getElementById('report-id');
    if (idEl) idEl.textContent = reportId();

    renderProfileObs(score, ratio, colorClass, shapeClass);
    card.hidden = false;
  }

  // 数字舌象 Twin：左真图 右 AI 特征空间（全部使用真实计算指标）
  function fillTwin(data) {
    const card = document.getElementById('twin-card');
    if (!card) return;

    const orig = document.getElementById('twin-original');
    if (orig) orig.src = data.original_url || '';

    const q = data.quality || {};
    const score = (typeof q.quality_score === 'number') ? q.quality_score : null;
    const qualityEl = document.getElementById('twin-quality');
    if (qualityEl) qualityEl.textContent = score != null ? ('采集质量 ' + Math.round(score) + ' 分') : '采集质量 —';

    const colorConf = data.color ? pct(data.color.top_conf) : null;
    const shapeConf = data.shape ? pct(data.shape.top_conf) : null;
    const m = data.morphology || {};
    const areaRatio = (m.area_ratio != null) ? Number(m.area_ratio) : null;
    const symmetry = (m.symmetry != null) ? Number(m.symmetry) : null;

    // 四维：色彩 苔质 形态(亮点占比) 对称，各轴归一为 0-1 强度
    // viewBox 四周留白 70，标签内缩到画布内，避免文字被裁切
    const VB = 380, CX = 190, CY = 190, RX = 108;
    const dims = [
      { label: '色彩', disp: colorConf != null ? Math.round(colorConf) + '%' : '—', max: 100, val: colorConf, dx: 0, dy: -1, x: CX, y: CY - RX - 16, an: 'middle' },
      { label: '苔质', disp: shapeConf != null ? Math.round(shapeConf) + '%' : '—', max: 100, val: shapeConf, dx: 1, dy: 0, x: CX + RX + 12, y: CY, an: 'start' },
      { label: '形态', disp: areaRatio != null ? Math.round(areaRatio * 100) + '%' : '—', max: 50, val: areaRatio != null ? areaRatio * 100 : null, dx: 0, dy: 1, x: CX, y: CY + RX + 26, an: 'middle' },
      { label: '对称', disp: symmetry != null ? Math.round(symmetry * 100) + '%' : '—', max: 100, val: symmetry != null ? symmetry * 100 : null, dx: -1, dy: 0, x: CX - RX - 18, y: CY, an: 'end' }
    ];

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', 300);
    svg.setAttribute('height', 300);
    svg.setAttribute('viewBox', '0 0 ' + VB + ' ' + VB);

    const cx = CX, cy = CY, R = RX;
    const normPoints = [];

    dims.forEach(function (d) {
      const ex = cx + d.dx * R;
      const ey = cy + d.dy * R;

      const track = document.createElementNS(NS, 'line');
      track.setAttribute('x1', cx); track.setAttribute('y1', cy);
      track.setAttribute('x2', ex); track.setAttribute('y2', ey);
      track.setAttribute('stroke', '#E5DDD0'); track.setAttribute('stroke-width', '1.4');
      svg.appendChild(track);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', d.x); label.setAttribute('y', d.y);
      label.setAttribute('text-anchor', d.an);
      label.setAttribute('font-size', '11');
      label.setAttribute('fill', '#8B8278');
      label.textContent = d.label + ' ' + d.disp;
      svg.appendChild(label);

      let norm = 0;
      if (d.val != null && d.max > 0) norm = Math.min(1, Math.max(0, d.val / d.max));
      normPoints.push({ x: cx + d.dx * norm * R, y: cy + d.dy * norm * R });
    });

    // 特征足迹（四维强度围成的空间多边形）
    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', normPoints.map(function (p) { return p.x + ',' + p.y; }).join(' '));
    poly.setAttribute('fill', '#164A3A'); poly.setAttribute('fill-opacity', '0.08');
    poly.setAttribute('stroke', '#164A3A'); poly.setAttribute('stroke-opacity', '0.5');
    poly.setAttribute('stroke-width', '1.4');
    svg.appendChild(poly);

    // 各维强度段与端点
    normPoints.forEach(function (p) {
      const seg = document.createElementNS(NS, 'line');
      seg.setAttribute('x1', cx); seg.setAttribute('y1', cy);
      seg.setAttribute('x2', p.x); seg.setAttribute('y2', p.y);
      seg.setAttribute('stroke', '#164A3A'); seg.setAttribute('stroke-width', '2.4'); seg.setAttribute('stroke-opacity', '0.9');
      svg.appendChild(seg);

      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('r', '3.6');
      dot.setAttribute('fill', '#B65A45');
      svg.appendChild(dot);
    });

    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', '3');
    c.setAttribute('fill', '#164A3A');
    svg.appendChild(c);

    const space = document.getElementById('twin-space');
    if (space) {
      space.innerHTML = '';
      space.appendChild(svg);
    }

    card.hidden = false;
  }

  function renderResult(data) {
    const resultSection = document.getElementById('result-section');
    const errorSection = document.getElementById('error-section');
    errorSection.hidden = true;
    resultSection.hidden = false;

    // 保存分析结果，供悬浮对话气泡解读使用
    currentAnalysis = data;
    initFloatChat();

    // 更新游客模式状态
    isGuest = data.is_guest === true;
    setGuestBanner(isGuest);

    // 三图
    setImg('img-original', data.original_url);
    setImg('img-mask', data.mask_url);
    setImg('img-overlay', data.overlay_url);

    // TQI 图像质量控制
    renderQuality(data.quality || {});

    // 概览
    const colorConfPct = pct(data.color.top_conf);
    const shapeConfPct = pct(data.shape.top_conf);
    document.getElementById('ov-color-class').textContent = data.color.top_class || '—';
    document.getElementById('ov-color-conf').textContent = colorConfPct.toFixed(1) + '%';
    document.getElementById('ov-shape-class').textContent = data.shape.top_class || '—';
    document.getElementById('ov-shape-conf').textContent = shapeConfPct.toFixed(1) + '%';

    // 进度条（先归零再赋值以触发过渡）
    const colorBar = document.getElementById('ov-color-bar');
    const shapeBar = document.getElementById('ov-shape-bar');
    colorBar.style.width = '0';
    shapeBar.style.width = '0';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        colorBar.style.width = Math.min(100, colorConfPct) + '%';
        shapeBar.style.width = Math.min(100, shapeConfPct) + '%';
      });
    });

    // ECharts
    renderChart('chart-color', data.color.classes, data.color.top_class);
    renderChart('chart-shape', data.shape.classes, data.shape.top_class);

    // 形态指标
    const m = data.morphology || {};
    document.getElementById('morph-area').textContent =
      (m.area_ratio != null) ? (Number(m.area_ratio) * 100).toFixed(1) + '%' : '—';
    document.getElementById('morph-aspect').textContent =
      (m.aspect_ratio != null) ? Number(m.aspect_ratio).toFixed(3) : '—';
    document.getElementById('morph-symmetry').textContent =
      (m.symmetry != null) ? Number(m.symmetry).toFixed(3) : '—';

    // 概览舌体占比
    if (m.area_ratio != null) {
      const ratioPct = Math.min(100, Number(m.area_ratio) * 100);
      const ratioEl = document.getElementById('ov-ratio');
      const ratioBar = document.getElementById('ov-ratio-bar');
      if (ratioEl) ratioEl.textContent = ratioPct.toFixed(1) + '%';
      if (ratioBar) {
        ratioBar.style.width = '0';
        requestAnimationFrame(() => { ratioBar.style.width = ratioPct + '%'; });
      }
    }

    // 参考说明
    document.getElementById('note-color').textContent =
      noteFor('color', data.color.top_class);
    document.getElementById('note-shape').textContent =
      noteFor('shape', data.shape.top_class);

    // 全面舌象分析
    renderFullAnalysis(data);

    // 病理风险评估
    renderPathological(data);

    // 个性化建议
    renderPersonalized(data);

    // record_id
    currentRecordId = data.record_id || null;
    const exportBtn = document.getElementById('export-pdf-btn');
    if (exportBtn) exportBtn.disabled = !currentRecordId;

    // 数字舌象画像
    fillProfile(data);
    // 数字舌象 Twin
    fillTwin(data);

    // 查看器状态栏（真实指标）
    var _q = data.quality || {};
    var _statQ = document.getElementById('ws-stat-quality');
    var _statC = document.getElementById('ws-stat-conf');
    if (_statQ && typeof _q.quality_score === 'number') _statQ.textContent = Math.round(_q.quality_score);
    if (_statC) {
      var _cc = data.color ? Number(data.color.top_conf) : 0;
      var _sc = data.shape ? Number(data.shape.top_conf) : 0;
      var _best = Math.max(_cc, _sc);
      if (_best > 0) _statC.textContent = (_best * 100).toFixed(1) + '%';
    }

    // 重新触发交错淡入动画
    replayStagger(resultSection);

    // 平滑滚动到结果区
    setTimeout(() => {
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }

  function setImg(id, url) {
    const el = document.getElementById(id);
    if (!el) return;
    el.src = url || '';
  }

  function noteFor(type, className) {
    const table = TCM_NOTES[type] || {};
    if (className && table[className]) return table[className];
    return '暂无对应参考说明。';
  }

  // ===================================================================
  // 全面舌象分析渲染
  // ===================================================================
  function renderFullAnalysis(data) {
    // 1. 舌体形态
    const bs = data.body_shape || {};
    renderBodyShape(bs);

    // 2. 裂纹检测
    const cr = data.cracks || {};
    renderCracks(cr);

    // 3. 舌苔质地
    const ct = data.coating_texture || {};
    renderCoatingTexture(ct);

    // 4. 舌苔颜色
    const cc = data.coating_color || {};
    renderCoatingColor(cc);

    // 5. 全息分区
    const zn = data.zonal || {};
    renderZonal(zn);

    // 6. 瘀斑/瘀点检测
    const ec = data.ecchymosis || {};
    renderEcchymosis(ec);

    // 7. 舌色细分
    const rc = data.refined_color || {};
    renderRefinedColor(rc);

    // 8. 舌下络脉
    const sl = data.sublingual || {};
    renderSublingual(sl);
  }

  function renderBodyShape(bs) {
    const el = document.getElementById('analysis-body-shape');
    if (!el) return;
    const cat = bs.category || '未能分析';
    const bodyDesc = bs.description || '';
    const tags = [];
    tags.push('<span class="analysis-tag ' +
      (cat === '胖大舌' ? 'accent' : cat === '瘦薄舌' ? 'warning' : 'primary') +
      '">' + escapeHtml(cat) + '</span>');
    if (bs.tooth_marked) {
      tags.push('<span class="analysis-tag warning">有齿痕</span>');
    }
    el.innerHTML = '<div>' + tags.join('') + '</div>' +
      (bodyDesc ? '<p class="analysis-desc">' + escapeHtml(bodyDesc) + '</p>' : '');
  }

  function renderCracks(cr) {
    const el = document.getElementById('analysis-cracks');
    if (!el) return;
    const sev = cr.severity || '无';
    const desc = cr.description || '';
    const tagClass = sev === '明显' ? 'accent' : sev === '轻微' ? 'warning' : 'primary';
    const tagName = sev === '无' ? '未见裂纹' : sev + '裂纹';
    el.innerHTML = '<div><span class="analysis-tag ' + tagClass + '">' + tagName + '</span></div>' +
      (desc ? '<p class="analysis-desc">' + escapeHtml(desc) + '</p>' : '');
  }

  function renderCoatingTexture(ct) {
    const el = document.getElementById('analysis-coating-texture');
    if (!el) return;
    const parts = [];
    if (ct.thickness) {
      const tClass = (ct.thickness === '厚苔' || ct.thickness === '中等') ? 'warning' : 'primary';
      parts.push('<span class="analysis-tag ' + tClass + '">' + escapeHtml(ct.thickness) + '</span>');
    }
    if (ct.moisture && ct.moisture !== '正常' && ct.moisture !== '未知') {
      const mClass = ct.moisture === '燥' ? 'accent' : ct.moisture === '水滑' ? 'info' : 'primary';
      parts.push('<span class="analysis-tag ' + mClass + '">' + escapeHtml(ct.moisture) + '</span>');
    }
    if (ct.texture && ct.texture !== '正常' && ct.texture !== '未知') {
      const tClass = ct.texture === '腻苔' ? 'warning' : 'accent';
      parts.push('<span class="analysis-tag ' + tClass + '">' + escapeHtml(ct.texture) + '</span>');
    }
    // 新增：舌苔细分标签
    if (ct.texture_subtype) {
      const subMap = { '粘腻苔': 'accent', '滑苔': 'info', '松苔': 'warning' };
      const subClass = subMap[ct.texture_subtype] || 'primary';
      parts.push('<span class="analysis-tag ' + subClass + '">' + escapeHtml(ct.texture_subtype) + '</span>');
    }
    const desc = ct.description || '';
    el.innerHTML = (parts.length ? '<div>' + parts.join('') + '</div>' : '') +
      (desc ? '<p class="analysis-desc">' + escapeHtml(desc) + '</p>' : '');
  }

  function renderCoatingColor(cc) {
    const el = document.getElementById('analysis-coating-color');
    if (!el) return;
    const cat = cc.category || '未知';
    const desc = cc.description || '';
    const tagClass = cat === '黄苔' ? 'accent' : cat === '灰黑苔' ? 'warning' : 'primary';
    el.innerHTML = '<div><span class="analysis-tag ' + tagClass + '">' + escapeHtml(cat) + '</span></div>' +
      (desc ? '<p class="analysis-desc">' + escapeHtml(desc) + '</p>' : '');
  }

  function renderZonal(zn) {
    const el = document.getElementById('analysis-zonal');
    if (!el) return;
    const zones = zn.zones || [];
    const desc = zn.description || '';
    if (zones.length === 0) {
      el.innerHTML = '<p class="analysis-desc">' + (desc || '未能分析') + '</p>';
      return;
    }
    const dots = zones.map(z => {
      const dotClass = z.color_desc === '偏红' ? 'warn' : z.color_desc === '偏暗' ? 'muted' : z.color_desc === '偏淡' ? 'info' : 'normal';
      return '<div class="analysis-dot-item">' +
        '<span class="analysis-dot ' + dotClass + '"></span>' +
        '<span>' + escapeHtml(z.name) + '：' + escapeHtml(z.color_desc) + '</span>' +
        '</div>';
    }).join('');
    el.innerHTML = '<div class="analysis-dots">' + dots + '</div>' +
      (desc && desc !== '各分区未见明显异常' ? '<p class="analysis-desc">' + escapeHtml(desc) + '</p>' : '');
  }

  // ===================================================================
  // 新增：瘀斑/瘀点检测渲染
  // ===================================================================
  function renderEcchymosis(ec) {
    const el = document.getElementById('analysis-ecchymosis');
    if (!el) return;
    const parts = [];
    if (ec.ecchymosis_detected) {
      parts.push('<span class="analysis-tag warning">瘀斑 ×' + ec.ecchymosis_count + '</span>');
    } else {
      parts.push('<span class="analysis-tag primary">未见瘀斑</span>');
    }
    if (ec.petechiae_detected) {
      parts.push('<span class="analysis-tag accent">红点/瘀点 ×' + ec.petechiae_count + '</span>');
    } else {
      parts.push('<span class="analysis-tag primary">未见红点</span>');
    }
    const desc = ec.description || '';
    el.innerHTML = '<div>' + parts.join('') + '</div>' +
      (desc ? '<p class="analysis-desc">' + escapeHtml(desc) + '</p>' : '');
  }

  // ===================================================================
  // 新增：舌色细分渲染
  // ===================================================================
  function renderRefinedColor(rc) {
    const el = document.getElementById('analysis-refined-color');
    if (!el) return;
    const refined = rc.refined_class || '未知';
    const original = rc.original_class || '未知';
    const isRefined = rc.is_refined;
    const desc = rc.description || '';
    const riskMap = { '枯白舌': 'accent', '绛紫舌': 'warning', '淡紫舌': 'warning', '紫红舌': 'warning' };
    const tagClass = riskMap[refined] || 'primary';

    let html = '<div>';
    if (isRefined) {
      html += '<span class="analysis-tag primary">原始: ' + escapeHtml(original) + '</span>';
      html += '<span class="analysis-tag ' + tagClass + '">细分: ' + escapeHtml(refined) + '</span>';
    } else {
      html += '<span class="analysis-tag ' + tagClass + '">' + escapeHtml(refined) + '</span>';
    }
    html += '</div>';
    if (desc) html += '<p class="analysis-desc">' + escapeHtml(desc) + '</p>';
    el.innerHTML = html;
  }

  // ===================================================================
  // 新增：舌下络脉渲染
  // ===================================================================
  function renderSublingual(sl) {
    const el = document.getElementById('analysis-sublingual');
    if (!el) return;
    if (!sl.available) {
      el.innerHTML = '<p class="analysis-desc" style="color:var(--muted);font-style:italic">' +
        escapeHtml(sl.description || '未提供舌下照片，无法进行舌下络脉分析') + '</p>';
      return;
    }
    const parts = [];
    if (sl.is_abnormal) {
      parts.push('<span class="analysis-tag accent">舌下络脉异常</span>');
    } else {
      parts.push('<span class="analysis-tag primary">舌下络脉正常</span>');
    }
    if (sl.vein_count > 0) {
      parts.push('<span class="analysis-tag info">' + sl.vein_count + '条络脉</span>');
      parts.push('<span class="analysis-tag info">直径约' + sl.max_diameter_mm + 'mm</span>');
    }
    const desc = sl.description || '';
    el.innerHTML = '<div>' + parts.join('') + '</div>' +
      (desc ? '<p class="analysis-desc">' + escapeHtml(desc) + '</p>' : '');
  }

  // ===================================================================
  // 病理风险评估渲染
  // ===================================================================
  function renderPathological(data) {
    const p = data.pathological || {};
    const riskLevel = p.overall_risk || '低';
    const categories = p.categories || [];
    const table = p.self_check_table || [];
    const disclaimer = p.disclaimer || '';

    // 1. 整体风险等级
    const overallEl = document.getElementById('risk-overall');
    const badgeEl = document.getElementById('risk-badge');
    const levelText = document.getElementById('risk-level-text');
    const noteEl = document.getElementById('risk-overall-note');
    if (overallEl && levelText) {
      overallEl.hidden = false;
      levelText.textContent = riskLevel;
      badgeEl.dataset.level = riskLevel;
      const noteMap = { '低': '综合评估所有维度，未发现明显异常信号', '中': '综合评估存在部分异常信号，建议关注', '高': '综合评估存在较多异常信号，建议专科就诊', '危重': '综合评估存在危重信号，请立即就医' };
      if (noteEl) noteEl.textContent = noteMap[riskLevel] || '';
      // 风险说明提示：明确系统定位为健康参考，不做疾病诊断。
      const noteLineEl = document.getElementById('risk-note-line');
      if (noteLineEl) {
        const backendNote = p.risk_note || '';
        noteLineEl.textContent = (backendNote ? backendNote + '；' : '') +
          '本结果基于舌象视觉特征进行分级，仅用于健康状态参考，不构成医学诊断；如有异常或高风险提示，建议结合实际症状并咨询专业医师进一步检查。';
        noteLineEl.hidden = false;
      }
    }

    // 2. 五类风险卡片
    const riskLevelMap = { '低': 0, '中': 1, '高': 2, '危重': 3 };
    const riskLabelMap = { '低': '低风险', '中': '中风险', '高': '高风险', '危重': '⚠ 危重' };
    categories.forEach(function(cat) {
      const id = cat.id;
      const levelEl = document.getElementById('risk-level-' + id);
      const bodyEl = document.getElementById('risk-body-' + id);
      const actionEl = document.getElementById('risk-action-' + id);
      if (!levelEl || !bodyEl) return;

      levelEl.textContent = riskLabelMap[cat.risk_level] || cat.risk_level;
      levelEl.className = 'risk-level risk-level--' + cat.risk_level;

      const findingsHtml = cat.findings.map(function(f) {
        return '<p class="risk-finding">' + escapeHtml(f) + '</p>';
      }).join('');
      bodyEl.innerHTML = '<p class="risk-summary">' + escapeHtml(cat.summary) + '</p>' + findingsHtml;

      if (actionEl) {
        actionEl.innerHTML = '<span class="risk-action-icon">→</span> ' + escapeHtml(cat.action);
      }

      // 卡片整体风险着色
      const card = document.getElementById('risk-card-' + id);
      if (card) {
        card.dataset.level = cat.risk_level;
      }
    });

    // 3. 危险舌象自查表
    const tableSection = document.getElementById('self-check-section');
    const tableBody = document.getElementById('self-check-body');
    if (tableSection && tableBody) {
      if (table && table.length > 0) {
        tableSection.hidden = false;
        tableBody.innerHTML = table.map(function(row) {
          return '<tr>' +
            '<td class="check-col-sign">' + escapeHtml(row.tongue_sign) + '</td>' +
            '<td class="check-col-disease">' + escapeHtml(row.reference || row.possible_disease) + '</td>' +
            '<td class="check-col-action">' + escapeHtml(row.suggestion) + '</td>' +
            '</tr>';
        }).join('');
      } else {
        tableSection.hidden = true;
      }
    }

    // 4. 免责声明
    const discEl = document.getElementById('risk-disclaimer');
    const discText = document.getElementById('disclaimer-text');
    if (discEl && discText) {
      discEl.hidden = false;
      discText.textContent = disclaimer;
    }
  }

  // ===================================================================
  // 个性化建议渲染
  // ===================================================================
  function renderPersonalized(data) {
    var section = document.getElementById('personalized-section');
    if (!section) return;

    var p = data.personalized;
    if (!p || (!p.advice_items || !p.advice_items.length) && (!p.risk_modifiers || !p.risk_modifiers.length)) {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    // 摘要
    var summaryEl = document.getElementById('personalized-summary');
    if (summaryEl) {
      summaryEl.textContent = p.summary || '';
    }

    // 建议列表
    var listEl = document.getElementById('personalized-list');
    if (listEl && p.advice_items) {
      var iconMap = { high: '⚠', medium: '→', low: 'ℹ' };
      listEl.innerHTML = p.advice_items.map(function(item) {
        return '<div class="personalized-item personalized-item--' + escapeHtml(item.priority) + '">'
          + '<span class="personalized-item-icon">' + (iconMap[item.priority] || '→') + '</span>'
          + '<div><div class="personalized-item-title">' + escapeHtml(item.title) + '</div>'
          + '<div class="personalized-item-content">' + escapeHtml(item.content) + '</div></div>'
          + '</div>';
      }).join('');
    }

    // 风险调整
    var modSection = document.getElementById('personalized-modifiers');
    var modList = document.getElementById('personalized-modifier-list');
    if (modSection && modList && p.risk_modifiers && p.risk_modifiers.length > 0) {
      modSection.hidden = false;
      modList.innerHTML = p.risk_modifiers.map(function(m) {
        return '<li>' + escapeHtml(m) + '</li>';
      }).join('');
    } else if (modSection) {
      modSection.hidden = true;
    }
  }

  // 重新触发 .stagger 动画
  function replayStagger(scope) {
    const nodes = scope.querySelectorAll('.stagger');
    nodes.forEach(n => n.classList.remove('is-in'));
    // 强制重排以重启动画
    void scope.offsetWidth;
    nodes.forEach(n => n.classList.add('is-in'));
  }

  // ===================================================================
  // ECharts 渲染
  // ===================================================================
  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const primary = (cs.getPropertyValue('--primary') || '#2C5F4A').trim() || '#2C5F4A';
    const accent = (cs.getPropertyValue('--accent') || '#C25B3E').trim() || '#C25B3E';
    const muted = (cs.getPropertyValue('--text-muted') || '#8B8278').trim() || '#8B8278';
    const border = (cs.getPropertyValue('--border') || '#E5DDD0').trim() || '#E5DDD0';
    const text = (cs.getPropertyValue('--text') || '#1F1A17').trim() || '#1F1A17';
    const cardBg = (cs.getPropertyValue('--bg-card') || '#FDFBF7').trim() || '#FDFBF7';
    return { primary, accent, muted, border, text, cardBg };
  }

  function renderChart(domId, classes, highlightName) {
    const dom = document.getElementById(domId);
    if (!dom) return;
    // 清理旧实例
    const old = echarts.getInstanceByDom(dom);
    if (old) old.dispose();
    const idx = charts.findIndex(c => c.getDom && c.getDom() === dom);
    if (idx !== -1) charts.splice(idx, 1);

    const chart = echarts.init(dom);
    charts.push(chart);

    const t = themeColors();
    const list = (classes || []).slice().sort((a, b) => b.conf - a.conf);
    const names = list.map(c => c.name);
    const seriesData = list.map(c => ({
      name: c.name,
      value: Math.round(c.conf * 1000) / 10,
      itemStyle: {
        color: c.name === highlightName ? t.accent : t.primary,
        borderRadius: [6, 6, 0, 0]
      }
    }));

    chart.setOption({
      grid: { left: 16, right: 16, top: 30, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(44,95,74,0.06)' } },
        backgroundColor: t.cardBg,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.text, fontFamily: "'Noto Sans SC', sans-serif", fontSize: 12 },
        formatter: (p) => {
          const v = p[0].value;
          return p[0].name + '<br/>置信度 <b>' + v.toFixed(1) + '%</b>';
        }
      },
      xAxis: {
        type: 'category',
        data: names,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: {
          color: t.muted,
          fontFamily: "'Noto Sans SC', sans-serif",
          fontSize: 12,
          interval: 0,
          margin: 12
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: t.muted,
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 13,
          formatter: '{value}%'
        },
        splitLine: { lineStyle: { color: t.border, type: 'dashed' } }
      },
      series: [{
        type: 'bar',
        data: seriesData,
        barWidth: '46%',
        label: {
          show: true,
          position: 'top',
          color: t.text,
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 14,
          fontWeight: 600,
          formatter: (p) => p.value.toFixed(1) + '%'
        },
        animationDuration: 900,
        animationEasing: 'cubicOut'
      }]
    });
  }

  // ===================================================================
  // 历史记录
  // ===================================================================
  function loadHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    // 静态演示站：直接读取本地历史
    const records = demoReadHistory();
    renderHistory(records);
  }

  function renderHistory(records) {
    const listEl = document.getElementById('history-list');
    if (!records.length) {
      listEl.innerHTML = '<p class="history-empty">暂无历史记录</p>';
      return;
    }

    listEl.innerHTML = records.map((r) => {
      const time = escapeHtml(r.created_at || '—');
      const img = r.image_path || '';
      const colorClass = escapeHtml(r.color_class || '—');
      const shapeClass = escapeHtml(r.shape_class || '—');
      const colorConf = pctStr(r.color_conf);
      const shapeConf = pctStr(r.shape_conf);
      return ''
        + '<article class="history-card" data-id="' + r.id + '">'
        +   '<button type="button" class="history-del" data-id="' + r.id + '" title="删除该记录" aria-label="删除">'
        +     '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>'
        +   '</button>'
        +   '<div class="history-thumb">'
        +     (img ? '<img src="' + escapeAttr(img) + '" alt="历史缩略图" loading="lazy" onerror="this.style.display=\'none\'" />' : '')
        +   '</div>'
        +   '<div class="history-body">'
        +     '<p class="history-time">' + time + '</p>'
        +     '<div class="history-tags">'
        +       '<div class="history-tag"><span class="history-tag-label">舌色</span>'
        +         '<span class="history-tag-value">' + colorClass + '</span>'
        +         '<span class="history-tag-conf">' + colorConf + '</span></div>'
        +       '<div class="history-tag"><span class="history-tag-label">舌苔</span>'
        +         '<span class="history-tag-value">' + shapeClass + '</span>'
        +         '<span class="history-tag-conf">' + shapeConf + '</span></div>'
        +     '</div>'
        +   '</div>'
        + '</article>';
    }).join('');

    // 绑定点击：重新查看详情
    listEl.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        const rec = records.find(x => String(x.id) === String(id));
        if (rec) renderResultFromHistory(rec);
      });
    });

    // 删除记录
    listEl.querySelectorAll('.history-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();                                   // 不触发展开详情
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (!window.confirm('确定删除这条历史记录吗？')) return;
        // 静态演示站：直接删除本地历史
        demoRemoveHistory(id);
        const card = listEl.querySelector('.history-card[data-id="' + id + '"]');
        if (card) card.remove();
        const remain = listEl.querySelectorAll('.history-card').length;
        if (remain === 0) {
          listEl.innerHTML = '<p class="history-empty">暂无历史记录</p>';
        }
      });
    });
  }

  // 由历史记录构造数据并复用 renderResult
  function renderResultFromHistory(rec) {
    // 静态演示站：本地历史直接保存了完整结果 JSON，优先直接渲染
    if (rec && rec.data) {
      renderResult(normalizeUrls(rec.data));
      return;
    }
    let morph = {};
    try { morph = JSON.parse(rec.morphology_json || '{}'); } catch (e) { morph = {}; }
    // 解析全面分析字段
    let body_shape = {}, cracks = {}, coating_texture = {}, coating_color = {}, zonal = {}, pathological = {};
    let ecchymosis = {}, refined_color = {}, sublingual = {};
    try { body_shape = JSON.parse(rec.body_shape_json || '{}'); } catch (e) {}
    try { cracks = JSON.parse(rec.cracks_json || '{}'); } catch (e) {}
    try { coating_texture = JSON.parse(rec.coating_texture_json || '{}'); } catch (e) {}
    try { coating_color = JSON.parse(rec.coating_color_json || '{}'); } catch (e) {}
    try { zonal = JSON.parse(rec.zonal_json || '{}'); } catch (e) {}
    try { pathological = JSON.parse(rec.pathological_json || '{}'); } catch (e) {}
    try { ecchymosis = JSON.parse(rec.ecchymosis_json || '{}'); } catch (e) {}
    try { refined_color = JSON.parse(rec.refined_color_json || '{}'); } catch (e) {}
    try { sublingual = JSON.parse(rec.sublingual_json || '{}'); } catch (e) {}
    let quality = {};
    try { quality = JSON.parse(rec.quality_json || '{}'); } catch (e) { quality = {}; }
    let personalized = null;
    try { personalized = JSON.parse(rec.personalized_json || 'null'); } catch (e) {}
    const colorConf = Number(rec.color_conf);
    const shapeConf = Number(rec.shape_conf);
    const data = {
      record_id: rec.id,
      original_url: rec.image_path,
      mask_url: rec.seg_path,
      overlay_url: rec.overlay_path,
      color: {
        classes: [{ name: rec.color_class, key: '', conf: colorConf }],
        top_class: rec.color_class,
        top_key: '',
        top_conf: colorConf
      },
      shape: {
        classes: [{ name: rec.shape_class, key: '', conf: shapeConf }],
        top_class: rec.shape_class,
        top_key: '',
        top_conf: shapeConf
      },
      morphology: morph,
      body_shape: body_shape,
      cracks: cracks,
      coating_texture: coating_texture,
      coating_color: coating_color,
      zonal: zonal,
      ecchymosis: ecchymosis,
      refined_color: refined_color,
      sublingual: sublingual,
      pathological: pathological,
      quality: quality,
      personalized: personalized,
    };
    renderResult(data);
  }

  // ===================================================================
  // 导出 PDF
  // ===================================================================
  function initExport() {
    const btn = document.getElementById('export-pdf-btn');
    if (!btn) return;
    btn.disabled = false;   // 演示站始终可导出
    btn.addEventListener('click', () => {
      if (!currentAnalysis) {
        showError('请先完成一次舌象分析');
        return;
      }
      // 静态演示站：无后端 PDF 生成，改为调起浏览器打印（可另存为 PDF）
      showError('示例演示版不生成 PDF 文件，已为您调起浏览器打印，可另存为 PDF');
      setTimeout(function() { window.print(); }, 400);
    });
  }

  // ===================================================================
  // 悬浮舌象解读对话气泡
  // ===================================================================
  let floatChatState = null;   // { messages: [...], open: bool }
  let floatChatReady = false;

  function floatChatHTML() {
    return ''
      + '<div class="float-chat" id="float-chat">'
      + '  <div class="float-chat-panel" id="float-chat-panel" hidden>'
      + '    <div class="float-chat-head">'
      + '      <div class="float-chat-head-left">'
      + '        <span class="float-chat-head-ico">舌</span>'
      + '        <span>'
      + '          <span class="float-chat-title">舌象解读</span>'
      + '          <br><span class="float-chat-sub">问问你的舌象，我会用大白话解释</span>'
      + '        </span>'
      + '      </div>'
      + '      <button type="button" class="float-chat-close" id="float-chat-close" title="关闭">×</button>'
      + '    </div>'
      + '    <div class="float-chat-body" id="float-chat-body"></div>'
      + '    <div class="float-chat-foot">'
      + '      <input type="text" id="float-chat-input" placeholder="问问舌象，如：为什么偏红？" autocomplete="off" aria-label="舌象问题输入框" />'
      + '      <button type="button" id="float-chat-send" aria-label="发送">发送</button>'
      + '    </div>'
      + '  </div>'
      + '  <button type="button" class="float-chat-bubble" id="float-chat-bubble" title="舌象解读"><img class="float-chat-bubble-img" src="img/bubble.png?v=3" alt="舌象解读" draggable="false" /></button>'
      + '</div>';
  }

  function initFloatChat() {
    if (floatChatReady) return;
    if (document.getElementById('float-chat')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = floatChatHTML();
    document.body.appendChild(wrap.firstElementChild);
    floatChatReady = true;

    const panel = document.getElementById('float-chat-panel');
    const bubble = document.getElementById('float-chat-bubble');
    const closeBtn = document.getElementById('float-chat-close');
    const input = document.getElementById('float-chat-input');
    const sendBtn = document.getElementById('float-chat-send');
    const body = document.getElementById('float-chat-body');

    floatChatState = { messages: [], open: false };

    // 气泡拖拽：可把「舌」气泡拖动到屏幕任意位置。
    // 与点击打开共用 pointerdown，用位移阈值区分：位移超过 5px 视为拖拽并抑制 click，
    // 否则视为点击打开面板。全程 setPointerCapture + 视口边界钳制。
    let bubbleMoved = false;
    bubble.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;                      // 仅左键 / 主触点
      e.preventDefault();
      const rect = bubble.getBoundingClientRect();
      bubble.style.position = 'fixed';                 // 切到视口坐标定位
      bubble.style.left = rect.left + 'px';
      bubble.style.top = rect.top + 'px';
      bubble.style.right = 'auto';
      bubble.style.bottom = 'auto';
      const ox = rect.left, oy = rect.top;
      const sx = e.clientX, sy = e.clientY;
      try { bubble.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      let moved = false;
      function onMove(ev) {
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = rect.width, h = rect.height;
        const pad = 8;
        const nx = Math.min(Math.max(ox + (ev.clientX - sx), pad), vw - w - pad);
        const ny = Math.min(Math.max(oy + (ev.clientY - sy), pad), vh - h - pad);
        bubble.style.left = nx + 'px';
        bubble.style.top = ny + 'px';
        if (Math.abs(ev.clientX - sx) > 5 || Math.abs(ev.clientY - sy) > 5) moved = true;
      }
      function onEnd() {
        bubbleMoved = moved;
        try { bubble.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        bubble.removeEventListener('pointermove', onMove);
        bubble.removeEventListener('pointerup', onEnd);
        bubble.removeEventListener('pointercancel', onEnd);
      }
      bubble.addEventListener('pointermove', onMove);
      bubble.addEventListener('pointerup', onEnd);
      bubble.addEventListener('pointercancel', onEnd);
    });

    bubble.addEventListener('click', () => {
      if (bubbleMoved) { bubbleMoved = false; return; } // 刚拖拽完，忽略本次点击
      // 面板打开时气泡已被 CSS 隐藏，因此这里只负责「打开面板」
      setFloatChatOpen(true);
      if (floatChatState.messages.length === 0) {
        if (currentAnalysis) {
          pushFloatMsg('assistant', '你好，我已经分析了你的舌象。想了解舌色、舌苔或瘀斑，直接问我吧。');
        } else {
          pushFloatMsg('assistant', '先做一次舌象分析，然后我就能帮你解读结果了。');
        }
      }
    });

    closeBtn.addEventListener('click', () => setFloatChatOpen(false));

    // 拦截面板内点击，防止任何外层事件冒泡把面板隐藏
    ['mousedown', 'click', 'mouseup'].forEach((evtName) => {
      panel.addEventListener(evtName, (e) => e.stopPropagation());
    });

    function send() {
      const q = (input.value || '').trim();
      if (!q) return;
      input.value = '';
      pushFloatMsg('user', q);
      askFloatChat(q);
    }
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });
    // 通过面板头部拖拽移动面板。
    // 关键：用 Pointer Events + setPointerCapture 把捕获权绑定到头部，
    // 光标即便在窗口外松开也会收到 pointerup，保证监听器被清理、不会"粘住"。
    // 同时全程按视口坐标定位并做边界钳制，面板不会拖出屏幕外。
    const head = panel.querySelector('.float-chat-head');
    if (head) {
      head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;                      // 仅左键 / 主触点
        if (e.target.closest('.float-chat-close')) return; // 点关闭按钮不拖拽
        e.preventDefault();
        e.stopPropagation();
        const rect = panel.getBoundingClientRect();
        panel.style.position = 'fixed';                  // 切到视口坐标定位
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.cursor = 'grabbing';
        const ox = rect.left, oy = rect.top;
        const sx = e.clientX, sy = e.clientY;
        try { head.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

        function onMove(ev) {
          // 边界钳制，始终把面板完全保留在视口内
          const vw = window.innerWidth, vh = window.innerHeight;
          const w = rect.width, h = rect.height;
          const pad = 8;
          const nx = Math.min(Math.max(ox + (ev.clientX - sx), pad), vw - w - pad);
          const ny = Math.min(Math.max(oy + (ev.clientY - sy), pad), vh - h - pad);
          panel.style.left = nx + 'px';
          panel.style.top = ny + 'px';
        }
        function onEnd() {
          // 记录拖拽后的视口位置，供下次重开时恢复
          floatChatState.dragPos = {
            left: parseFloat(panel.style.left) || ox,
            top: parseFloat(panel.style.top) || oy
          };
          panel.style.cursor = '';
          try { head.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          head.removeEventListener('pointermove', onMove);
          head.removeEventListener('pointerup', onEnd);
          head.removeEventListener('pointercancel', onEnd);
        }
        head.addEventListener('pointermove', onMove);
        head.addEventListener('pointerup', onEnd);
        head.addEventListener('pointercancel', onEnd);
      });
    }

    // 四边 + 四角缩放：在 panel 上用 capture 阶段拦截命中边缘的按下，
    // 统一处理上/下/左/右四边及 nw/ne/sw/se 四角拉伸。
    // 命中边缘才进入缩放；否则放行，让标题栏拖动与内容交互正常工作。
    const edgePx = 6, cornerPx = 10;
    panel.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;                      // 仅左键 / 主触点
      if (e.target.closest('.float-chat-close')) return;
      const rect = panel.getBoundingClientRect();
      const x = e.clientX, y = e.clientY;
      const dL = x - rect.left, dR = rect.right - x;
      const dT = y - rect.top, dB = rect.bottom - y;
      // 命中哪条边 / 哪个角
      const nearL = dL < edgePx, nearR = dR < edgePx;
      const nearT = dT < edgePx, nearB = dB < edgePx;
      let dir = null;
      if (nearT && nearL) dir = 'nw'; else if (nearT && nearR) dir = 'ne';
      else if (nearB && nearL) dir = 'sw'; else if (nearB && nearR) dir = 'se';
      else if (nearT) dir = 'n'; else if (nearB) dir = 's';
      else if (nearL) dir = 'w'; else if (nearR) dir = 'e';
      if (!dir) return;                                // 非边缘：不拦截
      e.preventDefault();
      e.stopPropagation();                             // 命中边缘时阻止标题栏拖拽等
      // 转 fixed，便于直接修改 left/top/width/height
      panel.style.position = 'fixed';
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      const sx = x, sy = y;
      const minW = 280, minH = 320;
      const vw = window.innerWidth, vh = window.innerHeight;
      const r0L = rect.left, r0T = rect.top, r0W = rect.width, r0H = rect.height;
      try { panel.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

      function onMove(ev) {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        let L = r0L, T = r0T, W = r0W, H = r0H;
        if (dir.indexOf('w') >= 0) { L = r0L + dx; W = r0W - dx; }
        if (dir.indexOf('e') >= 0) { W = r0W + dx; }
        if (dir.indexOf('n') >= 0) { T = r0T + dy; H = r0H - dy; }
        if (dir.indexOf('s') >= 0) { H = r0H + dy; }
        if (W < minW) { if (dir.indexOf('w') >= 0) L = L + W - minW; W = minW; }
        if (H < minH) { if (dir.indexOf('n') >= 0) T = T + H - minH; H = minH; }
        // 视口边界钳制，避免拖出屏幕
        if (L < 0) { W += L; L = 0; }
        if (T < 0) { H += T; T = 0; }
        if (L + W > vw - 8) W = vw - 8 - L;
        if (T + H > vh - 8) H = vh - 8 - T;
        panel.style.left = L + 'px';
        panel.style.top = T + 'px';
        panel.style.width = Math.max(W, 0) + 'px';
        panel.style.height = Math.max(H, 0) + 'px';
        floatChatState.dragPos = { left: L, top: T };
      }
      function onEnd() {
        try { panel.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        panel.removeEventListener('pointermove', onMove);
        panel.removeEventListener('pointerup', onEnd);
        panel.removeEventListener('pointercancel', onEnd);
      }
      panel.addEventListener('pointermove', onMove);
      panel.addEventListener('pointerup', onEnd);
      panel.addEventListener('pointercancel', onEnd);
    }, true);

    // 边缘 cursor 反馈：鼠标悬停在四边/四角时给出对应的拉伸指针
    panel.addEventListener('mousemove', (e) => {
      const r = panel.getBoundingClientRect();
      const x = e.clientX, y = e.clientY;
      const nL = x - r.left < edgePx, nR = r.right - x < edgePx;
      const nT = y - r.top  < edgePx, nB = r.bottom - y < edgePx;
      let cur = '';
      if ((nT && nL) || (nB && nR)) cur = 'nwse-resize';
      else if ((nT && nR) || (nB && nL)) cur = 'nesw-resize';
      else if (nL || nR) cur = 'ew-resize';
      else if (nT || nB) cur = 'ns-resize';
      else cur = '';
      if (panel.style.cursor !== cur) panel.style.cursor = cur;
    });
  }

  function setFloatChatOpen(open) {
    if (!floatChatState) return;
    floatChatState.open = open;
    const panel = document.getElementById('float-chat-panel');
    const bubble = document.getElementById('float-chat-bubble');
    const input = document.getElementById('float-chat-input');
    if (panel) {
      if (open) {
        const pos = floatChatState.dragPos;
        if (pos) {
          // 已被拖拽过：按记录的视口位置恢复
          panel.style.position = 'fixed';
          panel.style.left = pos.left + 'px';
          panel.style.top = pos.top + 'px';
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
        } else {
          // 未拖拽：复位到 CSS 设定的右下角默认位置
          panel.style.position = '';
          panel.style.left = '';
          panel.style.top = '';
          panel.style.right = '';
          panel.style.bottom = '';
        }
      }
      panel.hidden = !open;
    }
    if (bubble) bubble.classList.toggle('is-open', open);
    if (open && input) input.focus();
  }

  function floatRender(text) {
    // 轻量渲染：转义 HTML 防脚本注入
    let s = String(text || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    // 行首的横线/星号列表符号去掉
    s = s.replace(/^\s*[-*•]\s+/gm, '');
    // 加粗 **xx**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 换行
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  function pushFloatMsg(role, text) {
    if (!floatChatState) return;
    const body = document.getElementById('float-chat-body');
    if (!body) return;
    const row = document.createElement('div');
    row.className = 'float-msg ' + (role === 'user' ? 'from-user' : 'from-bot');
    const textEl = document.createElement('div');
    textEl.className = 'float-msg-text';
    if (role === 'user') {
      textEl.textContent = text;
    } else {
      textEl.innerHTML = floatRender(text);
    }
    row.appendChild(textEl);
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
    floatChatState.messages.push({ role: role, content: text });
  }

  async function askFloatChat(q) {
    const input = document.getElementById('float-chat-input');
    if (input) input.disabled = true;

    // 占位思考气泡
    const body = document.getElementById('float-chat-body');
    const placeholder = document.createElement('div');
    placeholder.className = 'float-msg from-bot';
    const phText = document.createElement('div');
    phText.className = 'float-msg-text';
    phText.textContent = '正在解读…';
    placeholder.appendChild(phText);
    if (body) { body.appendChild(placeholder); body.scrollTop = body.scrollHeight; }

    try {
      // 静态演示站：本地规则解读引擎替代后端 /api/chat
      const reply = await localChatReply(q, currentAnalysis || {}, floatChatState.messages || []);
      if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      pushFloatMsg('assistant', reply);
    } catch (err) {
      if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      pushFloatMsg('assistant', '解读暂时不可用，请稍后再试。');
    } finally {
      if (input) { input.disabled = false; input.focus(); }
    }
  }

  // ===================================================================
  // 静态演示站本地舌象解读引擎（替代后端 /api/chat）
  // 基于当前分析结果的视觉特征做规则化解读，支持多轮上下文
  // ===================================================================
  function chatDelay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function riskLabel(level) {
    return { '低': '低', '中': '中等', '高': '偏高', '危重': '较高' }[level] || level || '低';
  }

  async function localChatReply(q, analysis, history) {
    await chatDelay(650 + Math.random() * 550);
    if (!analysis || !analysis.color) {
      return '请先完成一次舌象分析，我才能基于你的舌象特征进行解读。\n\n提示：直接点击页面上的「开始分析」或「试用示例」即可体验完整流程。';
    }
    const text = String(q || '').toLowerCase();
    const colorClass = (analysis.color && analysis.color.top_class) || '';
    const shapeClass = (analysis.shape && analysis.shape.top_class) || '';
    const bodyShape = (analysis.body_shape && analysis.body_shape.category) || '';
    const cracks = (analysis.cracks && analysis.cracks.severity) || '';
    const ecCount = (analysis.ecchymosis && analysis.ecchymosis.ecchymosis_detected) ? (analysis.ecchymosis.ecchymosis_count || 0) : 0;
    const refined = (analysis.refined_color && analysis.refined_color.refined_class) || '';
    const overallRisk = (analysis.pathological && analysis.pathological.overall_risk) || '低';

    if (/你好|您好|嗨|哈喽|hi|hello|在吗|感谢/.test(text)) {
      return '你好，我已经看过这份舌象的视觉特征了。当前分析为「' + colorClass + ' · ' + shapeClass + '」，整体风险等级' + riskLabel(overallRisk) + '。想了解舌色、舌苔、裂纹、瘀斑还是调理建议，直接问我即可。';
    }
    if (/舌色|颜色|为什么.*红|为什么.*白|为什么.*紫|为什么.*绛|color/.test(text)) {
      return colorReply(colorClass, refined, analysis.color);
    }
    if (/舌苔|苔质|厚|腻|薄|coating/.test(text)) {
      return shapeReply(shapeClass, analysis.coating_texture);
    }
    if (/裂纹|裂|沟|crack/.test(text)) {
      return cracksReply(cracks);
    }
    if (/瘀|斑|血瘀|紫暗|petechia/.test(text)) {
      return ecchymosisReply(ecCount, analysis.ecchymosis);
    }
    if (/齿|胖|水肿|脾虚/.test(text)) {
      return bodyReply(bodyShape, analysis.body_shape);
    }
    if (/风险|严重|危险|要紧|就医|医院|risky/.test(text)) {
      return riskReply(overallRisk, analysis.pathological);
    }
    if (/建议|调理|养生|怎么办|注意|advice/.test(text)) {
      return adviceReply(analysis);
    }
    if (/示例|演示|假|真实|demo/.test(text)) {
      return '本页面是静态示例演示站，展示的分析结果来自内置示例数据（由真实模型推理生成后预置），不代表对您实际身体的诊断。您可以完整体验流程：上传图片、查看数字舌象画像、导出打印、多轮解读。';
    }
    return defaultReply(analysis, history);
  }

  function colorReply(colorClass, refined, colorData) {
    const conf = colorData && colorData.top_conf ? Math.round(colorData.top_conf * 100) + '%' : '—';
    const map = {
      '红舌': '舌色偏红，主热证。本次示例中红色以' + conf + '的置信度占主导，舌红多提示体内有热：舌尖红多为心火，舌边红多为肝火，全舌红而少苔多为阴虚内热。日常宜清淡饮食、少辛辣，观察是否伴口干、口苦、心烦。',
      '绛舌': '绛舌比红舌更深，提示热邪深入营血，常见于高热或阴虚火旺较重的情况。舌绛而干多为津液耗伤，绛而润多为血热。建议结合体温与症状，必要时尽早就医评估。',
      '紫舌': '紫舌主血瘀。青紫偏寒凝血瘀，绛紫偏热盛血瘀，提示气血运行不畅，常与痛经、胸闷、肢体麻木相伴。可配合适度运动与活血调理，但不可自行随意用药。',
      '淡白舌': '淡白舌血色不足，主虚证、寒证，多提示气血两虚或阳气亏虚，常伴乏力、怕冷。建议规律作息、适当温补，必要时查血常规评估有无贫血倾向。',
      '黄舌': '黄舌多主热证、里证，淡黄为热轻、深黄为热盛，多与湿热内蕴相关，可伴口苦、口干。饮食宜清淡，避免油腻辛辣，留意舌苔变化。'
    };
    let base = map[colorClass] || ('当前舌色分类为「' + colorClass + '」。');
    if (refined && refined !== colorClass) {
      base += ' 细分后归入「' + refined + '」，用于更精细地描述色泽倾向。';
    }
    return base + '\n\n（示例演示：此解读基于内置示例的视觉特征，仅供功能体验，不作诊断依据。）';
  }

  function shapeReply(shapeClass, coatingTexture) {
    const desc = coatingTexture ? coatingTexture.description : '';
    const map = {
      '正常薄白苔': '舌苔薄白而均匀、润泽适中，是胃气充盛、脏腑功能相对协调的常见表现，属较健康的舌苔形态。',
      '厚腻苔': '舌苔厚腻、苔质致密粘腻，多提示湿浊、痰饮或食积。白腻偏寒湿，黄腻偏湿热。饮食宜清淡易消化，减少生冷油腻，配合适量运动帮助脾胃运化。',
      '剥落苔/地图舌': '舌苔片状剥脱、形似地图，提示胃气、胃阴不足，常见于阴虚体质或过敏人群。宜养胃阴、调脾胃，规律三餐，少食刺激性食物。'
    };
    let base = map[shapeClass] || ('舌苔分类为「' + shapeClass + '」。');
    if (desc) base += ' 结合苔质细节：' + desc;
    return base + '\n\n（示例演示：以上解读基于内置示例的视觉特征，仅供功能体验。）';
  }

  function cracksReply(severity) {
    const map = {
      '无': '本次示例舌面未见明显裂纹，舌体表面光滑完整。',
      '轻微': '舌面可见少量细微裂纹，提示可能有阴液不足或热盛伤津的倾向，日常注意补水与规律作息即可。',
      '明显': '舌面裂纹明显，若少苔而干多为阴虚津亏，若厚苔伴裂纹多为热盛伤津。建议减少熬夜、避免过度辛辣，持续明显时建议就医评估。'
    };
    return (map[severity] || '本次未提取到明确的裂纹特征。') + '\n\n（示例演示：仅供功能体验，不作诊断依据。）';
  }

  function ecchymosisReply(count, ec) {
    if (count > 0) {
      return '本次示例在舌面检出' + count + '处瘀斑，提示血瘀证倾向，气血运行或欠通畅，常与心血管风险相关。结合整体风险提示，建议关注血压、血脂，保持适度活动，必要时完善心脑血管相关检查。\n\n（示例演示：仅供功能体验，请勿据此自行诊断。）';
    }
    return '本次示例舌面未见明显瘀斑或瘀点，未见明显血瘀信号。';
  }

  function bodyReply(category, bs) {
    const map = {
      '胖大舌': '舌体胖大、边缘可见齿痕，多提示脾虚湿盛，水湿运化偏弱，易有水肿、大便黏腻、乏力。宜健脾祛湿，规律饮食、少生冷、适度运动。',
      '瘦薄舌': '舌体瘦薄，多提示气血两虚或阴虚火旺，宜益气养血或滋阴清热，避免过度劳累。',
      '正常': '舌体大小形态正常，未见明显异常，形态特征表现平稳。'
    };
    let base = map[category] || ('舌体形态分类为「' + category + '」。');
    if (bs && bs.tooth_marked) base += ' 本次示例检出明显齿痕印迹，与脾虚湿盛的判断一致。';
    return base + '\n\n（示例演示：仅供功能体验。）';
  }

  function riskReply(level, p) {
    const note = (p && p.risk_note) || '';
    const map = {
      '低': '本次示例整体风险等级为低，未检出明显异常信号，保持良好生活习惯即可。',
      '中': '本次示例整体风险等级为中，存在部分异常信号，建议关注睡眠、饮食与情绪管理，持续异常时就医。',
      '高': '本次示例整体风险等级为高，存在较多异常信号（如瘀斑、胖大舌伴齿痕、舌红干燥等）。请结合症状，建议尽早就医完善相关检查，不要仅凭舌象自行用药。',
      '危重': '本次示例出现危重等级信号，请立即就医。'
    };
    let base = map[level] || ('整体风险等级为「' + level + '」。');
    if (note) base += '\n系统提示：' + note;
    return base + '\n\n（示例演示：风险分级基于内置示例的视觉特征，不构成医学诊断。）';
  }

  function adviceReply(analysis) {
    const items = [];
    const colorClass = (analysis.color && analysis.color.top_class) || '';
    const bodyShape = (analysis.body_shape && analysis.body_shape.category) || '';
    if (colorClass === '红舌' || colorClass === '绛舌' || colorClass === '黄舌') items.push('饮食：以清淡为主，减少辛辣、油炸与烧烤，避免过量饮酒。');
    if (colorClass === '淡白舌') items.push('饮食：适当增加温补与富含铁质的食物，规律三餐，注意休息。');
    if (colorClass === '紫舌') items.push('运动：建议每日适度有氧运动促进气血运行，避免久坐久卧。');
    if (bodyShape === '胖大舌') items.push('生活：控制生冷与甜腻食物摄入，少食多餐，健脾祛湿。');
    if (analysis.cracks && analysis.cracks.severity === '明显') items.push('作息：减少熬夜，保证水分摄入，避免长期干燥环境。');
    if (analysis.pathological && analysis.pathological.overall_risk === '高') items.push('就医：整体风险较高，建议结合体检与专科检查，请专业医师综合辨证。');
    if (!items.length) items.push('作息规律、均衡饮食、适度运动、保持心情舒畅，是维持良好舌象状态的基础。');
    return '基于本次示例舌象的视觉特征，给出以下生活参考：\n\n' + items.join('\n') + '\n\n（示例演示：以上为通用健康建议，不替代医师诊疗。）';
  }

  function defaultReply(analysis, history) {
    const colorClass = (analysis.color && analysis.color.top_class) || '';
    const shapeClass = (analysis.shape && analysis.shape.top_class) || '';
    const confC = analysis.color ? Math.round(analysis.color.top_conf * 100) + '%' : '—';
    const confS = analysis.shape ? Math.round(analysis.shape.top_conf * 100) + '%' : '—';
    const risk = (analysis.pathological && analysis.pathological.overall_risk) || '低';
    const ec = (analysis.ecchymosis && analysis.ecchymosis.ecchymosis_detected) ? ('检出' + analysis.ecchymosis.ecchymosis_count + '处瘀斑，') : '未见明显瘀斑，';
    const crack = (analysis.cracks && analysis.cracks.severity) || '无';
    let head = '这份舌象可以这样理解：舌色以「' + colorClass + '」为主（置信度 ' + confC + '），舌苔以「' + shapeClass + '」为主（置信度 ' + confS + '），' + ec + '裂纹程度为「' + crack + '」，整体风险等级' + riskLabel(risk) + '。';
    if (risk === '高') {
      head += ' 风险信号较多，建议结合症状尽早就医。';
    } else {
      head += ' 特征整体平稳，注意生活方式即可。';
    }
    head += '\n\n你可以继续追问，比如：\n「舌色为什么偏红？」\n「厚腻苔该怎么调理？」\n「整体风险高吗？」\n「怎么导出报告？」';
    if (history && history.length > 1) {
      head += '\n\n（我们已经聊了几轮，直接问你想知道的具体细节即可。）';
    }
    return head + '\n\n（示例演示：以上解读由本地规则引擎基于内置示例生成，非实时 AI 推理。）';
  }

  // ===================================================================
  // 加载状态 / 错误提示
  // ===================================================================
  function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    overlay.hidden = !show;
    if (show) setLoadingText('准备就绪');
  }

  function setLoadingText(text) {
    const el = document.getElementById('loading-status');
    if (el) el.textContent = text || '';
  }

  // 分析过程四步打勾展示
  var ANALYSIS_STEPS = [
    { model: 'TQI', desc: '图像质量评估' },
    { model: 'YOLOX', desc: '舌体精准定位' },
    { model: 'TongueSAM', desc: '精细语义分割' },
    { model: 'ViT', desc: '特征解析' }
  ];
  var stepTimer = null;

  function renderAnalysisSteps() {
    var box = document.getElementById('loading-steps');
    if (!box) return;
    box.innerHTML = '';
    ANALYSIS_STEPS.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'loading-step loading-step--pending';
      row.dataset.state = 'pending';
      row.id = 'lstep-' + i;
      row.innerHTML = '<span class="step-dot"></span><span class="step-body"><span class="step-model"></span><span class="step-desc"></span></span><span class="step-val" id="lv-' + i + '"></span>';
      row.querySelector('.step-model').textContent = s.model;
      row.querySelector('.step-desc').textContent = s.desc;
      box.appendChild(row);
    });
  }

  function setStepState(i, state) {
    var el = document.getElementById('lstep-' + i);
    if (!el) return;
    el.className = 'loading-step loading-step--' + state;
    el.dataset.state = state;
  }

  var STEP_MARK = [25, 50, 75, 100];

  function setStepVal(i, text) {
    var el = document.getElementById('lv-' + i);
    if (el) el.textContent = text || '';
  }

  var analysisFinalMetrics = null;

  function fillRealMetrics(m) {
    if (!m) return;
    if (m[0] != null) setStepVal(0, Math.round(m[0]) + '分');
    if (m[1]) setStepVal(1, m[1]);
    if (m[2] != null) setStepVal(2, m[2]);
    if (m[3] != null) setStepVal(3, m[3]);
  }

  function setProgress(pct) {
    var bar = document.getElementById('loading-bar');
    var num = document.getElementById('loading-progress-num');
    if (bar) bar.style.width = pct + '%';
    if (num) num.textContent = Math.round(pct) + '%';
  }

  function startAnalysisSteps() {
    if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
    renderAnalysisSteps();
    setStepState(0, 'active');
    setStepVal(0, '…');
    setLoadingText(ANALYSIS_STEPS[0].model + ' ' + ANALYSIS_STEPS[0].desc + '...');
    setProgress(4);
    var idx = 0;
    var progress = 4;
    stepTimer = setInterval(function () {
      progress += 3;
      if (progress >= 100) {
        progress = 100;
        setProgress(progress);
        clearInterval(stepTimer); stepTimer = null;
        return;
      }
      if (progress >= STEP_MARK[idx] && idx < ANALYSIS_STEPS.length - 1) {
        setStepState(idx, 'done');
        idx++;
        setStepState(idx, 'active');
        setStepVal(idx, '…');
        setLoadingText(ANALYSIS_STEPS[idx].model + ' ' + ANALYSIS_STEPS[idx].desc + '...');
      }
      setProgress(progress);
    }, 460);
  }

  function finishAnalysisSteps() {
    if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
    for (var k = 0; k < ANALYSIS_STEPS.length; k++) setStepState(k, 'done');
    fillRealMetrics(analysisFinalMetrics);
    setProgress(100);
    setLoadingText('分析完成');
  }

  function showError(msg) {
    const section = document.getElementById('error-section');
    const msgEl = document.getElementById('error-msg');
    if (!section || !msgEl) return;
    msgEl.textContent = msg || '发生未知错误';
    section.hidden = false;
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(() => { section.hidden = true; }, 6000);
  }

  function hideError() {
    const section = document.getElementById('error-section');
    if (section) section.hidden = true;
  }

  // ===================================================================
  // 工具函数
  // ===================================================================
  function pct(v) {
    const n = Number(v);
    if (!isFinite(n)) return 0;
    return n * 100;
  }
  function pctStr(v) {
    const n = Number(v);
    if (!isFinite(n)) return '—';
    return (n * 100).toFixed(1) + '%';
  }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ===================================================================
  // 用户中心
  // ===================================================================
  function openProfileModal() {
    var modal = document.getElementById('profile-modal');
    modal.hidden = false;
    // 默认选中个人资料标签
    switchProfileTab('info');
    // 加载个人资料
    loadProfile();
    // 加载历史记录
    loadProfileHistory();
  }

  function closeProfileModal() {
    document.getElementById('profile-modal').hidden = true;
  }

  function switchProfileTab(tab) {
    // 切换 tab 样式
    document.querySelectorAll('.profile-tab').forEach(function(t) {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    // 切换面板
    ['info', 'password', 'history'].forEach(function(p) {
      document.getElementById('profile-panel-' + p).hidden = (p !== tab);
    });
  }

  function loadProfile() {
    var u = currentUser || demoLoadUser();
    if (u) {
      document.getElementById('profile-username').value = u.username || '';
      document.getElementById('profile-age').value = u.age || '';
      document.getElementById('profile-gender').value = u.gender || '';
      document.getElementById('profile-medical').value = u.medical_history || '';
    }
  }

  function saveProfile() {
    var age = document.getElementById('profile-age').value.trim();
    var gender = document.getElementById('profile-gender').value;
    var medical_history = document.getElementById('profile-medical').value.trim();
    var errorEl = document.getElementById('profile-error');
    var successEl = document.getElementById('profile-success');
    var btn = document.getElementById('profile-save-btn');

    errorEl.hidden = true;
    successEl.hidden = true;
    btn.disabled = true;
    btn.textContent = '保存中...';

    // 静态演示站：资料保存在本机 localStorage
    setTimeout(function() {
      var u = currentUser || demoLoadUser();
      if (!u) {
        errorEl.textContent = '当前未登录，无法保存资料（演示站账号仅保存在本机浏览器）';
        errorEl.hidden = false;
      } else {
        u.age = age || '';
        u.gender = gender || '';
        u.medical_history = medical_history || '';
        var list = demoLoadUsers();
        var idx = list.findIndex(function(x) { return x.username === u.username; });
        if (idx >= 0) { list[idx] = u; demoSaveUsers(list); }
        demoSetUser(u);
        currentUser = u;
        successEl.textContent = '个人资料已保存（本机演示）';
        successEl.hidden = false;
        setTimeout(function() { successEl.hidden = true; }, 3000);
      }
      btn.disabled = false;
      btn.textContent = '保存资料';
    }, 300);
  }

  function changePassword() {
    var oldPwd = document.getElementById('profile-old-pwd').value;
    var newPwd = document.getElementById('profile-new-pwd').value;
    var confirmPwd = document.getElementById('profile-confirm-pwd').value;
    var errorEl = document.getElementById('profile-pwd-error');
    var successEl = document.getElementById('profile-pwd-success');
    var btn = document.getElementById('profile-pwd-btn');

    errorEl.hidden = true;
    successEl.hidden = true;

    if (!oldPwd) {
      errorEl.textContent = '请输入原密码';
      errorEl.hidden = false;
      return;
    }
    if (newPwd.length < 6) {
      errorEl.textContent = '新密码至少 6 个字符';
      errorEl.hidden = false;
      return;
    }
    if (!/[0-9]/.test(newPwd)) {
      errorEl.textContent = '新密码必须包含数字';
      errorEl.hidden = false;
      return;
    }
    if (!/[a-zA-Z]/.test(newPwd)) {
      errorEl.textContent = '新密码必须包含英文字母';
      errorEl.hidden = false;
      return;
    }
    if (newPwd !== confirmPwd) {
      errorEl.textContent = '两次输入的新密码不一致';
      errorEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = '修改中...';

    // 静态演示站：本地校验并更新密码
    setTimeout(function() {
      var u = currentUser || demoLoadUser();
      if (!u) {
        errorEl.textContent = '当前未登录，无法修改密码';
        errorEl.hidden = false;
      } else if (u.password !== oldPwd) {
        errorEl.textContent = '原密码不正确';
        errorEl.hidden = false;
      } else {
        u.password = newPwd;
        var list = demoLoadUsers();
        var idx = list.findIndex(function(x) { return x.username === u.username; });
        if (idx >= 0) { list[idx] = u; demoSaveUsers(list); }
        demoSetUser(u);
        currentUser = u;
        successEl.textContent = '密码已修改，请下次登录时使用新密码';
        successEl.hidden = false;
        document.getElementById('profile-old-pwd').value = '';
        document.getElementById('profile-new-pwd').value = '';
        document.getElementById('profile-confirm-pwd').value = '';
        setTimeout(function() { successEl.hidden = true; }, 4000);
      }
      btn.disabled = false;
      btn.textContent = '修改密码';
    }, 300);
  }

  function loadProfileHistory() {
    var listEl = document.getElementById('profile-history-list');
    var countEl = document.getElementById('profile-history-count');
    if (!listEl) return;

    // 静态演示站：读取本地历史
    var records = demoReadHistory();
    if (countEl) countEl.textContent = '共 ' + records.length + ' 条记录';
    if (records.length === 0) {
      listEl.innerHTML = '<p class="history-empty">暂无历史记录</p>';
      return;
    }
    listEl.innerHTML = records.map(function(r) {
      var time = escapeHtml(r.created_at || '—');
      var img = r.image_path || '';
      var colorClass = escapeHtml(r.color_class || '—');
      var shapeClass = escapeHtml(r.shape_class || '—');
      return '<div class="profile-history-item" data-id="' + r.id + '">'
        + '<div class="profile-history-thumb">'
        + (img ? '<img src="' + escapeAttr(img) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />' : '')
        + '</div>'
        + '<div class="profile-history-body">'
        + '<div class="profile-history-time">' + time + '</div>'
        + '<div class="profile-history-tags">'
        + '<span class="profile-history-tag">舌色: <span>' + colorClass + '</span></span>'
        + '<span class="profile-history-tag">舌苔: <span>' + shapeClass + '</span></span>'
        + '</div>'
        + '</div>'
        + '<span class="profile-history-view">查看详情 →</span>'
        + '</div>';
    }).join('');

    // 点击查看详情
    listEl.querySelectorAll('.profile-history-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var id = this.dataset.id;
        var rec = records.find(function(x) { return String(x.id) === String(id); });
        if (rec) {
          closeProfileModal();
          renderResultFromHistory(rec);
        }
      });
    });
  }

  // ===================================================================
  // 趋势分析（独立弹窗）
  // ===================================================================
  var trendChart = null;

  function openTrendModal() {
    var modal = document.getElementById('trend-modal');
    modal.hidden = false;
    loadTrend();
  }

  function closeTrendModal() {
    document.getElementById('trend-modal').hidden = true;
  }

  function loadTrend() {
    var chartEl = document.getElementById('trend-chart');
    var emptyEl = document.getElementById('trend-empty');
    var containerEl = document.getElementById('trend-chart-container');
    if (!chartEl || !emptyEl || !containerEl) return;

    // 静态演示站：基于本地历史记录构造趋势数据（无后端）
    var records = demoReadHistory().slice(0, 10).reverse();
    var trend = records.map(function(r) {
      var riskScore = 1;
      var riskName = '低';
      if (r.data && r.data.pathological && r.data.pathological.overall_risk) {
        var ov = r.data.pathological.overall_risk;
        if (ov === '高') { riskScore = 3; riskName = '高'; }
        else if (ov === '中') { riskScore = 2; riskName = '中'; }
      }
      return {
        date: (r.created_at || '').split(' ')[0] || '—',
        color_score: Math.round((r.color_conf || 0) * 10) / 10,
        shape_score: Math.round((r.shape_conf || 0) * 10) / 10,
        risk_score: riskScore,
        color_name: r.color_class || '—',
        shape_name: r.shape_class || '—',
        risk_name: riskName
      };
    });

    if (trend.length < 2) {
      if (emptyEl) {
        emptyEl.querySelector('p').textContent = '至少需要 2 条分析记录才能生成趋势图';
        emptyEl.hidden = false;
      }
      if (containerEl) containerEl.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (containerEl) containerEl.hidden = false;

    var dates = trend.map(function(d) { return d.date; });
    var colorScores = trend.map(function(d) { return d.color_score; });
    var shapeScores = trend.map(function(d) { return d.shape_score; });
    var riskScores = trend.map(function(d) { return d.risk_score; });

    // 构建 tooltip 中的分类名映射
    var colorLabels = {};
    var shapeLabels = {};
    var riskLabels = {};
    trend.forEach(function(d) {
      colorLabels[d.color_score] = d.color_name;
      shapeLabels[d.shape_score] = d.shape_name;
      riskLabels[d.risk_score] = d.risk_name;
    });

    var colorNameMap = {};
    var shapeNameMap = {};
    var riskNameMap = {};
    Object.keys(colorLabels).forEach(function(k) { colorNameMap[colorLabels[k]] = k; });
    Object.keys(shapeLabels).forEach(function(k) { shapeNameMap[shapeLabels[k]] = k; });
    Object.keys(riskLabels).forEach(function(k) { riskNameMap[riskLabels[k]] = k; });

    var option = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#FDFBF7',
        borderColor: '#E5DDD0',
        textStyle: { color: '#1F1A17', fontSize: 12 },
        formatter: function(params) {
          var parts = [params[0].axisValue];
          params.forEach(function(p) {
            var nameMap = p.seriesName === '舌色' ? colorNameMap :
                          p.seriesName === '舌苔' ? shapeNameMap : riskNameMap;
            var label = nameMap[p.value] || p.value;
            parts.push(p.marker + ' ' + p.seriesName + '：' + label);
          });
          return parts.join('<br/>');
        }
      },
      legend: { show: false },
      grid: { left: 40, right: 24, top: 24, bottom: 32 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#D4C9B8' } },
        axisLabel: { color: '#8B8278', fontSize: 11 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0.5,
        max: function() {
          // 根据数据类型动态调整最大值
          var maxVal = Math.max.apply(null, colorScores.concat(shapeScores, riskScores));
          return maxVal + 0.5;
        }(),
        interval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: '#F0EBE0', type: 'dashed' } },
      },
      series: [
        {
          name: '舌色',
          type: 'line',
          data: colorScores,
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { color: '#C25B3E', width: 2.5 },
          itemStyle: { color: '#C25B3E' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(194,91,62,0.15)' }, { offset: 1, color: 'rgba(194,91,62,0)' }] } },
        },
        {
          name: '舌苔',
          type: 'line',
          data: shapeScores,
          smooth: true,
          symbol: 'diamond',
          symbolSize: 8,
          lineStyle: { color: '#2C5F4A', width: 2.5 },
          itemStyle: { color: '#2C5F4A' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(44,95,74,0.12)' }, { offset: 1, color: 'rgba(44,95,74,0)' }] } },
        },
        {
          name: '风险',
          type: 'line',
          data: riskScores,
          smooth: true,
          symbol: 'triangle',
          symbolSize: 9,
          lineStyle: { color: '#F9A825', width: 2.5, type: 'dashed' },
          itemStyle: { color: '#F9A825' },
        },
      ],
    };

    if (trendChart) {
      trendChart.dispose();
    }
    trendChart = echarts.init(chartEl);
    trendChart.setOption(option);
  }

  // ===================================================================
  // 试用示例
  // ===================================================================
  // 预生成时刻零推理：直接读取静态 sample_data.json（真实推理的一次性结果），
  // 写入 pendingAnalysis 后跳回首页复用结果渲染路径，规避模型冷启动。
  function initDemo() {
    var btn = document.getElementById('demo-btn');
    if (!btn) return;
    btn.addEventListener('click', async function() {
      btn.disabled = true;
      btn.textContent = '加载示例中…';
      try {
        var resp = await fetch('assets/sample/sample_data.json?v=1');
        if (!resp.ok) throw new Error('示例数据加载失败');
        var data = await resp.json();
        if (!data || data.success !== true) throw new Error('示例数据无效');
        try { sessionStorage.setItem('pendingAnalysis', JSON.stringify(data)); } catch (e) { throw new Error('浏览器存储不可用'); }
        window.location.href = './?capture=1';
        return;
      } catch (err) {
        showError('示例加载失败，请手动上传图片');
      } finally {
        btn.disabled = false;
        btn.textContent = '试用示例';
      }
    });
  }

  // ===================================================================
  // 示例图库（多证型真实推理案例）
  // ===================================================================
  // 案例信息来自对真实舌象图的本地推理结果（assets/samples/ 下各 caseN 目录）
  const DEMO_CASES = [
    { id: 'case1', label: '黄舌 · 正常薄白苔', risk: '高', quality: 86 },
    { id: 'case2', label: '红舌 · 厚腻苔', risk: '高', quality: 88 },
    { id: 'case3', label: '紫舌 · 正常薄白苔', risk: '高', quality: 86 },
    { id: 'case4', label: '淡白舌 · 正常薄白苔', risk: '中', quality: 89 },
    { id: 'case5', label: '黄舌 · 厚腻苔', risk: '高', quality: 84 },
    { id: 'case6', label: '绛舌 · 正常薄白苔', risk: '高', quality: 80 },
    { id: 'case7', label: '黄舌 · 厚腻苔', risk: '高', quality: 80 }
  ];

  async function runDemoCase(cid) {
    var url = 'assets/samples/' + cid + '/' + cid + '.json?v=2';
    var analyzeBtn = document.getElementById('analyze-btn');
    showLoading(true);
    startAnalysisSteps();
    hideError();
    if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.textContent = '分析中…'; }
    try {
      var resp = await fetch(url);
      if (!resp.ok) throw new Error('示例加载失败');
      var data = await resp.json();
      if (!data || data.success !== true) throw new Error('示例数据无效');
      normalizeUrls(data);
      data.record_id = genLocalRecordId();
      data.is_guest = true;
      demoPushHistory(data);
      renderResult(data);
      loadHistory();
      var rs = document.getElementById('result-section');
      if (rs) {
        setTimeout(function() { rs.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
      }
    } catch (err) {
      showError('示例加载失败，请刷新页面后重试');
    } finally {
      finishAnalysisSteps();
      showLoading(false);
      if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.textContent = '开始分析'; }
    }
  }

  function initDemoGallery() {
    var grid = document.getElementById('demo-gallery-grid');
    if (!grid) return;
    DEMO_CASES.forEach(function(c) {
      var card = document.createElement('div');
      card.className = 'demo-gallery-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('title', '运行案例：' + c.label + '（示例演示）');
      card.innerHTML =
        '<img class="demo-gallery-thumb" src="assets/samples/' + c.id + '/original.jpg?v=1" alt="' + escapeAttr(c.label) + '" loading="lazy" />'
        + '<span class="demo-gallery-label">' + escapeHtml(c.label) + '</span>'
        + '<span class="demo-gallery-meta">风险' + escapeHtml(c.risk) + ' · 质量 ' + c.quality + '</span>';
      card.addEventListener('click', function() { runDemoCase(c.id); });
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); runDemoCase(c.id); }
      });
      grid.appendChild(card);
    });
  }

  // ===================================================================
  // 键盘快捷键
  // ===================================================================
  function initKeyboard() {
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      // 如果有输入框聚焦，不关闭弹窗
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;

      var authModal = document.getElementById('auth-modal');
      var profileModal = document.getElementById('profile-modal');
      var trendModal = document.getElementById('trend-modal');

      if (trendModal && !trendModal.hidden) {
        closeTrendModal();
      } else if (profileModal && !profileModal.hidden) {
        closeProfileModal();
      } else if (authModal && !authModal.hidden) {
        closeAuthModal();
      }
    });
  }

})();
