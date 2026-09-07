import { AppSettings, Book, BookSearchResponse } from '../types';
import { getSettings, saveSettings, getSessionCache, setSessionCache } from '../services/storage';
import { testNodeLatency } from '../services/nodeManager';
import {
  getAuthState,
  AuthState,
  sniffAllZLibCookies,
  syncCookiesToNode,
  listenCookieChanges
} from '../services/auth';
import { searchBooks, fetchDownloadUrl, downloadBookFile } from '../services/api';
import { syncMirrorsFromRemote } from '../services/mirrorCrawler';

interface CachedSessionState {
  query: string;
  extension: string;
  response: BookSearchResponse;
}

let currentSettings: AppSettings;
let currentAuthState: AuthState;
let currentBooks: Book[] = [];
let currentPage = 1;
let currentTotalPages = 1;
let currentQuery = '';
let currentExtension = 'all';
let isLoading = false;

// DOM Elements
const activeNodeNameEl = document.getElementById('active-node-name') as HTMLElement;
const activeNodeLatencyEl = document.getElementById('active-node-latency') as HTMLElement;
const nodeSelectorBtn = document.getElementById('node-selector-btn') as HTMLButtonElement;
const openSettingsBtn = document.getElementById('open-settings-btn') as HTMLButtonElement;

const userStatusTextEl = document.getElementById('user-status-text') as HTMLElement;
const quotaInfoEl = document.getElementById('quota-info') as HTMLElement;
const quotaUsedEl = document.getElementById('quota-used') as HTMLElement;
const quotaLimitEl = document.getElementById('quota-limit') as HTMLElement;

const searchForm = document.getElementById('search-form') as HTMLFormElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const clearSearchBtn = document.getElementById('clear-search-btn') as HTMLButtonElement;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const formatPills = document.querySelectorAll('#format-filters .pill');

const notificationBar = document.getElementById('notification-bar') as HTMLElement;
const resultMeta = document.getElementById('result-meta') as HTMLElement;
const totalCountEl = document.getElementById('total-count') as HTMLElement;

const bookScrollContainer = document.getElementById('book-scroll-container') as HTMLElement;
const welcomeView = document.getElementById('welcome-view') as HTMLElement;
const loadingSpinner = document.getElementById('loading-spinner') as HTMLElement;
const loadingText = document.getElementById('loading-text') as HTMLElement;
const bookListEl = document.getElementById('book-list') as HTMLElement;
const loadMoreWrapper = document.getElementById('load-more-wrapper') as HTMLElement;
const loadMoreBtn = document.getElementById('load-more-btn') as HTMLButtonElement;

async function init() {
  currentSettings = await getSettings();
  bindEvents();
  updateNodeStatusUI();

  // Load user session
  await checkAuthAndUser();

  // Restore last search session if exists
  const cached = await getSessionCache<CachedSessionState>('search_session');
  if (cached && cached.response && cached.response.books.length > 0) {
    currentQuery = cached.query;
    currentExtension = cached.extension;
    searchInput.value = currentQuery;
    clearSearchBtn.classList.remove('hidden');

    // Update pill active state
    formatPills.forEach((p) => {
      const ext = p.getAttribute('data-ext');
      if (ext === currentExtension) p.classList.add('active');
      else p.classList.remove('active');
    });

    displaySearchResults(cached.response, false);
  }

  // Quick test active node latency
  testCurrentNode();

  // 后台无感自动同步 Awesome-Zlibrary 最新镜像列表（默认周期：24小时）
  if (currentSettings.autoSyncMirrors) {
    const isDue = !currentSettings.lastSyncTime || (Date.now() - currentSettings.lastSyncTime > 24 * 3600 * 1000);
    if (isDue) {
      syncMirrorsFromRemote(false).then((res) => {
        if (res.addedCount > 0) {
          console.log(`[Z-Lib Pro] 自动同步完成，新增 ${res.addedCount} 个镜像节点`);
          getSettings().then((s) => {
            currentSettings = s;
            updateNodeStatusUI();
          });
        }
      }).catch((err) => {
        console.warn('[Z-Lib Pro] 后台同步跳过:', err);
      });
    }
  }

  // 监听 Cookie 变化或标签页焦点切换，用户在网页登录完成后自动激活
  listenCookieChanges(() => {
    checkAuthAndUser();
  });
  window.addEventListener('focus', () => {
    checkAuthAndUser();
  });
}

function bindEvents() {
  // Settings & Node config jump
  openSettingsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('/options.html');
    }
  });

  nodeSelectorBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('/options.html');
    }
  });

  // Search input controls
  searchInput.addEventListener('input', () => {
    if (searchInput.value.trim().length > 0) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    searchInput.focus();
  });

  // Format filter pills
  formatPills.forEach((btn) => {
    btn.addEventListener('click', () => {
      formatPills.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      currentExtension = btn.getAttribute('data-ext') || 'all';

      if (searchInput.value.trim().length > 0) {
        performSearch(true);
      }
    });
  });

  // Search form submit
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    performSearch(true);
  });

  // Load more button
  loadMoreBtn.addEventListener('click', () => {
    if (!isLoading && currentPage < currentTotalPages) {
      loadNextPage();
    }
  });

  // Infinite scroll listener (带节流防抖控制)
  let scrollThrottleTimer: any = null;
  bookScrollContainer.addEventListener('scroll', () => {
    if (isLoading || currentPage >= currentTotalPages) return;
    if (scrollThrottleTimer) return;

    scrollThrottleTimer = setTimeout(() => {
      scrollThrottleTimer = null;
      const { scrollTop, scrollHeight, clientHeight } = bookScrollContainer;
      if (scrollTop + clientHeight >= scrollHeight - 80) {
        loadNextPage();
      }
    }, 150);
  });
}

function updateNodeStatusUI() {
  const activeUrl = currentSettings.activeNodeUrl;
  const node = currentSettings.nodes.find((n) => n.url === activeUrl);
  const name = node ? node.name : new URL(activeUrl).hostname;

  activeNodeNameEl.textContent = name;
  nodeSelectorBtn.className = 'node-badge';

  if (node?.status === 'available' && node.latency !== undefined) {
    nodeSelectorBtn.classList.add('online');
    activeNodeLatencyEl.textContent = `${node.latency}ms`;
  } else if (node?.status === 'testing') {
    nodeSelectorBtn.classList.add('testing');
    activeNodeLatencyEl.textContent = '测速中...';
  } else if (node?.status === 'error') {
    nodeSelectorBtn.classList.add('error');
    activeNodeLatencyEl.textContent = '不可达';
  } else {
    activeNodeLatencyEl.textContent = '--';
  }
}

async function testCurrentNode() {
  const activeUrl = currentSettings.activeNodeUrl;
  let node = currentSettings.nodes.find((n) => n.url === activeUrl);
  if (!node) {
    node = {
      id: 'custom-active',
      name: new URL(activeUrl).hostname,
      url: activeUrl,
      status: 'unknown'
    };
  }

  nodeSelectorBtn.className = 'node-badge testing';
  activeNodeLatencyEl.textContent = '测速中...';

  const tested = await testNodeLatency(node, 3000);
  if (tested.status === 'available') {
    nodeSelectorBtn.className = 'node-badge online';
    activeNodeLatencyEl.textContent = `${tested.latency}ms`;
  } else {
    nodeSelectorBtn.className = 'node-badge error';
    activeNodeLatencyEl.textContent = '超时';
    showNotification('当前镜像访问超时，建议点击左上方切换至其他可用节点', 'error', 6000);
  }
}

let isCheckingAuth = false;

async function checkAuthAndUser() {
  if (isCheckingAuth) return;
  isCheckingAuth = true;

  try {
    userStatusTextEl.textContent = '正在检查登录状态...';
    currentAuthState = await getAuthState(currentSettings.activeNodeUrl);

    if (currentAuthState.isLoggedIn && currentAuthState.userProfile) {
      const prof = currentAuthState.userProfile;
      userStatusTextEl.innerHTML = `已登录: <strong>${escapeHtml(prof.name)}</strong>`;
      quotaUsedEl.textContent = String(prof.downloads_today);
      quotaLimitEl.textContent = String(prof.downloads_limit);
      quotaInfoEl.classList.remove('hidden');
    } else {
    quotaInfoEl.classList.add('hidden');
    userStatusTextEl.innerHTML = `
      <span>未登录 ·</span>
      <a href="${escapeHtml(currentSettings.activeNodeUrl)}/login" target="_blank" class="auth-action-link" title="在浏览器新标签页打开官方登录界面">网页登录</a>
      <span class="auth-sep">|</span>
      <button type="button" id="btn-quick-sniff" class="auth-action-btn" title="在网页登录成功后点击立即提取 Cookie">提取凭据</button>
      <span class="auth-sep">|</span>
      <button type="button" id="btn-quick-login" class="auth-action-btn" title="直接输入账号密码登录">账号登录</button>
    `;

    // 绑定快捷提取凭据按钮
    const quickSniffBtn = document.getElementById('btn-quick-sniff');
    if (quickSniffBtn) {
      quickSniffBtn.addEventListener('click', async () => {
        quickSniffBtn.textContent = '嗅探中...';
        try {
          const sniffed = await sniffAllZLibCookies();
          if (sniffed.userId && sniffed.userKey) {
            currentSettings.manualUserId = sniffed.userId;
            currentSettings.manualUserKey = sniffed.userKey;
            await saveSettings(currentSettings);
            await syncCookiesToNode(currentSettings.activeNodeUrl, sniffed.userId, sniffed.userKey);
            await checkAuthAndUser();
            showNotification(`提取成功！欢迎回来`, 'success', 3000);
          } else {
            showNotification('未在浏览器中找到登录 Cookie，建议点击“账号登录”直接输入密码', 'error', 4500);
            quickSniffBtn.textContent = '提取凭据';
          }
        } catch {
          quickSniffBtn.textContent = '提取凭据';
        }
      });
    }

    // 绑定账号登录跳转
    const quickLoginBtn = document.getElementById('btn-quick-login');
    if (quickLoginBtn) {
      quickLoginBtn.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else {
          window.open('/options.html');
        }
      });
    }
  }
} finally {
  isCheckingAuth = false;
}
}

async function performSearch(isNewSearch: boolean = true) {
  const query = searchInput.value.trim();
  if (!query) {
    showNotification('请输入要搜索的书名、作者或关键词', 'error');
    searchInput.focus();
    return;
  }

  if (isNewSearch) {
    currentPage = 1;
    currentBooks = [];
    bookListEl.innerHTML = '';
  }

  currentQuery = query;
  isLoading = true;

  welcomeView.classList.add('hidden');
  loadingSpinner.classList.remove('hidden');
  loadingText.textContent = isNewSearch ? '正在全网检索图书...' : '正在加载下一页...';
  submitBtn.disabled = true;

  try {
    const res = await searchBooks(currentSettings.activeNodeUrl, query, {
      page: currentPage,
      limit: 20,
      extension: currentExtension
    });

    displaySearchResults(res, !isNewSearch);

    // Save session (最多缓存前 40 本，节约内存与会话存储开销)
    await setSessionCache('search_session', {
      query: currentQuery,
      extension: currentExtension,
      response: {
        ...res,
        books: currentBooks.slice(0, 40)
      }
    });
  } catch (err: any) {
    console.error('Search failed:', err);
    showNotification(`检索失败: ${err.message || '请检查当前节点网络连通性'}`, 'error', 6000);
  } finally {
    isLoading = false;
    loadingSpinner.classList.add('hidden');
    submitBtn.disabled = false;
  }
}

async function loadNextPage() {
  currentPage++;
  await performSearch(false);
}

function displaySearchResults(res: BookSearchResponse, isAppend: boolean) {
  if (!isAppend) {
    currentBooks = res.books;
    bookListEl.innerHTML = '';
  } else {
    currentBooks = [...currentBooks, ...res.books];
  }

  currentPage = res.pagination.current;
  currentTotalPages = res.pagination.total_pages;

  resultMeta.classList.remove('hidden');
  totalCountEl.textContent = String(res.pagination.total_items);

  if (currentBooks.length === 0) {
    bookListEl.innerHTML = `
      <div class="welcome-view">
        <div class="welcome-icon">🔍</div>
        <h3>未找到相关图书</h3>
        <p>可以尝试更换关键词、切换格式筛选或更换镜像节点重新搜索。</p>
      </div>
    `;
    loadMoreWrapper.classList.add('hidden');
    return;
  }

  renderBookCards(res.books);

  if (currentPage < currentTotalPages) {
    loadMoreWrapper.classList.remove('hidden');
  } else {
    loadMoreWrapper.classList.add('hidden');
  }
}

function renderBookCards(books: Book[]) {
  const fragment = document.createDocumentFragment();

  books.forEach((book) => {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.setAttribute('data-book-id', String(book.id));

    // Cover
    const coverWrap = document.createElement('div');
    coverWrap.className = 'book-cover-wrap';
    if (book.cover) {
      const img = document.createElement('img');
      img.className = 'book-cover';
      img.src = book.cover;
      img.alt = book.title;
      img.loading = 'lazy';
      img.onerror = () => {
        coverWrap.innerHTML = '<span class="book-cover-placeholder">📖</span>';
      };
      coverWrap.appendChild(img);
    } else {
      coverWrap.innerHTML = '<span class="book-cover-placeholder">📖</span>';
    }

    // Content
    const content = document.createElement('div');
    content.className = 'book-content';

    const titleEl = document.createElement('h4');
    titleEl.className = 'book-title';
    titleEl.title = book.title;
    titleEl.textContent = book.title;

    const authorEl = document.createElement('div');
    authorEl.className = 'book-author';
    authorEl.textContent = book.author || '未知作者';

    const detailsEl = document.createElement('div');
    detailsEl.className = 'book-details';

    const detailsItems: string[] = [];
    if (book.publisher) detailsItems.push(`出版: ${book.publisher}`);
    if (book.year) detailsItems.push(`年份: ${book.year}`);
    if (book.language) detailsItems.push(`语言: ${book.language}`);
    if (book.pages) detailsItems.push(`${book.pages} 页`);
    detailsEl.textContent = detailsItems.join(' · ') || '无更多元数据';

    // Bottom action bar
    const bottomBar = document.createElement('div');
    bottomBar.className = 'book-bottom-bar';

    const tags = document.createElement('div');
    tags.className = 'book-tags';
    tags.innerHTML = `
      <span class="ext-badge">${escapeHtml(book.extension || 'FILE')}</span>
      <span class="size-badge">${escapeHtml(book.filesizeString || '')}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'book-actions';

    if (book.readOnlineUrl) {
      const readBtn = document.createElement('a');
      readBtn.className = 'btn-read-online';
      readBtn.href = book.readOnlineUrl;
      readBtn.target = '_blank';
      readBtn.textContent = '在线阅读';
      actions.appendChild(readBtn);
    }

    // 复制下载链接按钮
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-copy-link';
    copyBtn.title = '解析并复制真实下载链接到剪贴板（可粘贴至迅雷/IDM等下载器）';
    copyBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>复制链接</span>
    `;
    copyBtn.addEventListener('click', () => handleCopyDownloadLink(book, copyBtn));
    actions.appendChild(copyBtn);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-download';
    downloadBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>下载</span>
    `;

    downloadBtn.addEventListener('click', () => handleDownload(book, downloadBtn));
    actions.appendChild(downloadBtn);

    bottomBar.appendChild(tags);
    bottomBar.appendChild(actions);

    content.appendChild(titleEl);
    content.appendChild(authorEl);
    content.appendChild(detailsEl);
    content.appendChild(bottomBar);

    card.appendChild(coverWrap);
    card.appendChild(content);

    fragment.appendChild(card);
  });

  bookListEl.appendChild(fragment);
}

async function handleCopyDownloadLink(book: Book, btn: HTMLButtonElement) {
  const originalHtml = btn.innerHTML;
  btn.classList.add('loading');
  btn.innerHTML = `
    <span class="mini-spinner"></span>
    <span>解析中...</span>
  `;

  try {
    const downloadUrl = await fetchDownloadUrl(currentSettings.activeNodeUrl, book);
    await copyToClipboard(downloadUrl);

    btn.classList.remove('loading');
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>已复制!</span>
    `;

    showNotification(`已复制《${book.title}》的真实下载直链到剪贴板`, 'success', 3500);

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = originalHtml;
    }, 2000);
  } catch (err: any) {
    console.error('Copy download link error:', err);
    btn.classList.remove('loading');
    btn.innerHTML = originalHtml;
    showNotification(err.message || '获取下载链接失败，请检查登录凭据或节点状态', 'error', 6000);
  }
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 降级使用 textarea 复制
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const successful = document.execCommand('copy');
    if (!successful) throw new Error('复制操作未被支持');
  } finally {
    document.body.removeChild(textArea);
  }
}

async function handleDownload(book: Book, btn: HTMLButtonElement) {
  const originalHtml = btn.innerHTML;
  btn.classList.add('loading');
  btn.innerHTML = `
    <span class="mini-spinner"></span>
    <span>解析中...</span>
  `;

  try {
    const downloadUrl = await fetchDownloadUrl(currentSettings.activeNodeUrl, book);
    btn.innerHTML = '<span>下载中...</span>';

    const safeFilename = `${book.title}.${(book.extension || 'epub').toLowerCase()}`;
    await downloadBookFile(downloadUrl, safeFilename);

    showNotification(`已启动下载: 《${book.title}》`, 'success', 4000);
    // Refresh user profile after download
    setTimeout(() => checkAuthAndUser(), 1500);
  } catch (err: any) {
    console.error('Download error:', err);
    showNotification(err.message || '下载失败，请检查登录凭据或节点状态', 'error', 6000);
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = originalHtml;
  }
}

function showNotification(msg: string, type: 'error' | 'success', duration: number = 3000) {
  notificationBar.textContent = msg;
  notificationBar.className = `notification-bar ${type}`;

  setTimeout(() => {
    notificationBar.className = 'notification-bar hidden';
  }, duration);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
