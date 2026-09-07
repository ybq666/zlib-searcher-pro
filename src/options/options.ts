import { AppSettings, ZLibNode } from '../types';
import { getSettings, saveSettings } from '../services/storage';
import {
  testNodeLatency,
  testAllNodes,
  sortNodesBySpeed,
  requestHostPermissionForUrl
} from '../services/nodeManager';
import { getAuthState, fetchUserProfile } from '../services/auth';
import { syncMirrorsFromRemote } from '../services/mirrorCrawler';

let currentSettings: AppSettings;

// DOM Elements
const nodesTbody = document.getElementById('nodes-tbody') as HTMLElement;
const btnSpeedtestAll = document.getElementById('btn-speedtest-all') as HTMLButtonElement;
const btnSyncMirrors = document.getElementById('btn-sync-mirrors') as HTMLButtonElement;
const btnAutoBest = document.getElementById('btn-auto-best') as HTMLButtonElement;
const btnShowAddModal = document.getElementById('btn-show-add-modal') as HTMLButtonElement;
const syncStatusText = document.getElementById('sync-status-text') as HTMLElement;

const authBadge = document.getElementById('auth-badge') as HTMLElement;
const authForm = document.getElementById('auth-form') as HTMLFormElement;
const inputUserId = document.getElementById('input-userid') as HTMLInputElement;
const inputUserKey = document.getElementById('input-userkey') as HTMLInputElement;
const btnTestAuth = document.getElementById('btn-test-auth') as HTMLButtonElement;
const btnClearAuth = document.getElementById('btn-clear-auth') as HTMLButtonElement;

const prefAutoSync = document.getElementById('pref-auto-sync') as HTMLInputElement;
const prefAutoSpeedtest = document.getElementById('pref-auto-speedtest') as HTMLInputElement;
const prefDefaultExt = document.getElementById('pref-default-ext') as HTMLSelectElement;

const addModal = document.getElementById('add-modal') as HTMLElement;
const modalCloseBtn = document.getElementById('modal-close-btn') as HTMLButtonElement;
const modalCancelBtn = document.getElementById('modal-cancel-btn') as HTMLButtonElement;
const addNodeForm = document.getElementById('add-node-form') as HTMLFormElement;
const customNodeName = document.getElementById('custom-node-name') as HTMLInputElement;
const customNodeUrl = document.getElementById('custom-node-url') as HTMLInputElement;

const toastEl = document.getElementById('toast') as HTMLElement;

async function init() {
  currentSettings = await getSettings();
  populateForm();
  renderNodesTable();
  bindEvents();
  checkAuthStatus();
}

function populateForm() {
  inputUserId.value = currentSettings.manualUserId || '';
  inputUserKey.value = currentSettings.manualUserKey || '';
  prefAutoSync.checked = currentSettings.autoSyncMirrors ?? true;
  prefAutoSpeedtest.checked = currentSettings.autoSpeedTest;
  prefDefaultExt.value = currentSettings.defaultExtension || 'all';
  updateSyncStatusDisplay();
}

function bindEvents() {
  // Sync mirrors from Awesome-Zlibrary
  btnSyncMirrors.addEventListener('click', handleSyncMirrors);

  // Speed test all
  btnSpeedtestAll.addEventListener('click', handleSpeedtestAll);

  // Auto best
  btnAutoBest.addEventListener('click', handleAutoBest);

  // Modal events
  btnShowAddModal.addEventListener('click', () => {
    addModal.classList.remove('hidden');
    customNodeName.focus();
  });
  modalCloseBtn.addEventListener('click', () => addModal.classList.add('hidden'));
  modalCancelBtn.addEventListener('click', () => addModal.classList.add('hidden'));
  addNodeForm.addEventListener('submit', handleAddCustomNode);

  // Auth events
  authForm.addEventListener('submit', handleSaveAuth);
  btnTestAuth.addEventListener('click', handleTestAuth);
  btnClearAuth.addEventListener('click', handleClearAuth);

  // Pref events
  prefAutoSync.addEventListener('change', async () => {
    currentSettings.autoSyncMirrors = prefAutoSync.checked;
    await saveSettings(currentSettings);
    showToast('偏好设置已更新', 'success');
  });

  prefAutoSpeedtest.addEventListener('change', async () => {
    currentSettings.autoSpeedTest = prefAutoSpeedtest.checked;
    await saveSettings(currentSettings);
    showToast('偏好设置已更新', 'success');
  });

  prefDefaultExt.addEventListener('change', async () => {
    currentSettings.defaultExtension = prefDefaultExt.value;
    await saveSettings(currentSettings);
    showToast('偏好设置已更新', 'success');
  });
}

async function handleSyncMirrors() {
  btnSyncMirrors.disabled = true;
  btnSyncMirrors.classList.add('spinning');
  showToast('正在从 Awesome-Zlibrary 抓取最新可用镜像...', 'info');

  try {
    const result = await syncMirrorsFromRemote(true);
    currentSettings = await getSettings();
    renderNodesTable();
    updateSyncStatusDisplay();
    showToast(result.message, 'success');
  } catch (err: any) {
    showToast(`同步失败: ${err.message}`, 'error');
  } finally {
    btnSyncMirrors.disabled = false;
    btnSyncMirrors.classList.remove('spinning');
  }
}

function updateSyncStatusDisplay() {
  if (currentSettings.lastSyncTime) {
    const d = new Date(currentSettings.lastSyncTime);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    syncStatusText.textContent = `上次同步: ${dateStr}`;
  } else {
    syncStatusText.textContent = '上次同步: 尚未同步';
  }
}

function renderNodesTable() {
  nodesTbody.innerHTML = '';

  currentSettings.nodes.forEach((node) => {
    const tr = document.createElement('tr');
    const isActive = node.url === currentSettings.activeNodeUrl;
    if (isActive) tr.classList.add('active-row');

    // Radio
    const tdActive = document.createElement('td');
    tdActive.style.textAlign = 'center';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'active-node-group';
    radio.className = 'active-radio';
    radio.checked = isActive;
    radio.title = '设为当前使用节点';
    radio.addEventListener('change', async () => {
      currentSettings.activeNodeUrl = node.url;
      await saveSettings(currentSettings);
      renderNodesTable();
      checkAuthStatus();
      showToast(`已切换当前节点为: ${node.name}`, 'success');
    });
    tdActive.appendChild(radio);

    // Name
    const tdName = document.createElement('td');
    tdName.className = 'node-title-cell';
    tdName.textContent = node.name;
    if (node.isOfficial) {
      const tag = document.createElement('span');
      tag.className = 'official-tag';
      tag.textContent = '官方/镜像';
      tdName.appendChild(tag);
    }
    if (node.isCustom) {
      const tag = document.createElement('span');
      tag.className = 'custom-tag';
      tag.textContent = '自定义';
      tdName.appendChild(tag);
    }

    // URL
    const tdUrl = document.createElement('td');
    tdUrl.className = 'node-url-cell';
    tdUrl.textContent = node.url;

    // Latency
    const tdLatency = document.createElement('td');
    const latencyBadge = document.createElement('span');
    if (node.status === 'testing') {
      latencyBadge.className = 'latency-badge none';
      latencyBadge.textContent = '测速中...';
    } else if (node.status === 'available' && node.latency !== undefined) {
      if (node.latency < 350) latencyBadge.className = 'latency-badge fast';
      else if (node.latency < 800) latencyBadge.className = 'latency-badge medium';
      else latencyBadge.className = 'latency-badge slow';
      latencyBadge.textContent = `${node.latency} ms`;
    } else if (node.status === 'error') {
      latencyBadge.className = 'latency-badge slow';
      latencyBadge.textContent = '不可达';
    } else {
      latencyBadge.className = 'latency-badge none';
      latencyBadge.textContent = '--';
    }
    tdLatency.appendChild(latencyBadge);

    // Status
    const tdStatus = document.createElement('td');
    const statusSpan = document.createElement('span');
    statusSpan.className = `status-badge ${node.status}`;
    if (node.status === 'available') statusSpan.textContent = '● 可用';
    else if (node.status === 'testing') statusSpan.textContent = '◐ 测试中';
    else if (node.status === 'error') statusSpan.textContent = '✕ 超时/离线';
    else statusSpan.textContent = '○ 未测';
    tdStatus.appendChild(statusSpan);

    // Actions
    const tdActions = document.createElement('td');
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'table-actions';

    // Test single
    const btnTest = document.createElement('button');
    btnTest.className = 'action-sm-btn';
    btnTest.textContent = '测速';
    btnTest.addEventListener('click', async () => {
      btnTest.disabled = true;
      btnTest.textContent = '...';
      const updated = await testNodeLatency(node);
      Object.assign(node, updated);
      await saveSettings(currentSettings);
      renderNodesTable();
    });
    actionsDiv.appendChild(btnTest);

    // Visit link
    const btnVisit = document.createElement('a');
    btnVisit.className = 'action-sm-btn';
    btnVisit.href = node.url;
    btnVisit.target = '_blank';
    btnVisit.textContent = '访问';
    actionsDiv.appendChild(btnVisit);

    // Delete (custom only)
    if (node.isCustom) {
      const btnDelete = document.createElement('button');
      btnDelete.className = 'action-sm-btn danger';
      btnDelete.textContent = '删除';
      btnDelete.addEventListener('click', async () => {
        if (confirm(`确认删除自定义节点 [${node.name}] 吗？`)) {
          currentSettings.nodes = currentSettings.nodes.filter((n) => n.id !== node.id);
          if (currentSettings.activeNodeUrl === node.url) {
            currentSettings.activeNodeUrl = currentSettings.nodes[0]?.url || 'https://z-lib.sk';
          }
          await saveSettings(currentSettings);
          renderNodesTable();
          showToast('节点已删除', 'info');
        }
      });
      actionsDiv.appendChild(btnDelete);
    }

    tdActions.appendChild(actionsDiv);

    tr.appendChild(tdActive);
    tr.appendChild(tdName);
    tr.appendChild(tdUrl);
    tr.appendChild(tdLatency);
    tr.appendChild(tdStatus);
    tr.appendChild(tdActions);

    nodesTbody.appendChild(tr);
  });
}

async function handleSpeedtestAll() {
  btnSpeedtestAll.disabled = true;
  btnSpeedtestAll.innerHTML = '<span>正在并发测速...</span>';

  // Mark all nodes as testing
  currentSettings.nodes.forEach((n) => (n.status = 'testing'));
  renderNodesTable();

  try {
    const tested = await testAllNodes(currentSettings.nodes, (updatedNode) => {
      const idx = currentSettings.nodes.findIndex((n) => n.id === updatedNode.id);
      if (idx !== -1) {
        currentSettings.nodes[idx] = updatedNode;
        renderNodesTable();
      }
    });

    // Auto sort by latency
    currentSettings.nodes = sortNodesBySpeed(tested);
    await saveSettings(currentSettings);
    renderNodesTable();

    const availableCount = tested.filter((n) => n.status === 'available').length;
    showToast(`测速完成！${availableCount}/${tested.length} 个节点在线可用`, 'success');
  } catch (err: any) {
    showToast(`测速过程发生错误: ${err.message}`, 'error');
  } finally {
    btnSpeedtestAll.disabled = false;
    btnSpeedtestAll.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      <span>一键全面测速</span>
    `;
  }
}

async function handleAutoBest() {
  btnAutoBest.disabled = true;
  btnAutoBest.textContent = '优选中...';

  try {
    await handleSpeedtestAll();
    const best = currentSettings.nodes.find((n) => n.status === 'available');
    if (best) {
      currentSettings.activeNodeUrl = best.url;
      await saveSettings(currentSettings);
      renderNodesTable();
      checkAuthStatus();
      showToast(`已自动优选并切换至最快节点: ${best.name} (${best.latency}ms)`, 'success');
    } else {
      showToast('未检测到任何可用节点，请检查本地代理或网络', 'error');
    }
  } finally {
    btnAutoBest.disabled = false;
    btnAutoBest.textContent = '自动优选最快节点';
  }
}

async function handleAddCustomNode(e: Event) {
  e.preventDefault();
  const name = customNodeName.value.trim();
  let url = customNodeUrl.value.trim().replace(/\/+$/, '');

  if (!name || !url) return;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showToast('网址必须以 http:// 或 https:// 开头', 'error');
    return;
  }

  // Request host permission if needed
  const hasPerm = await requestHostPermissionForUrl(url);
  if (!hasPerm) {
    showToast('未获得该域名的访问权限，请求可能受阻', 'error');
  }

  const newNode: ZLibNode = {
    id: `custom-${Date.now()}`,
    name,
    url,
    status: 'testing',
    isCustom: true
  };

  currentSettings.nodes.push(newNode);
  addModal.classList.add('hidden');
  addNodeForm.reset();

  renderNodesTable();
  showToast('节点已添加，正在测试连通性...', 'info');

  const tested = await testNodeLatency(newNode);
  const idx = currentSettings.nodes.findIndex((n) => n.id === newNode.id);
  if (idx !== -1) {
    currentSettings.nodes[idx] = tested;
    await saveSettings(currentSettings);
    renderNodesTable();
    if (tested.status === 'available') {
      showToast(`节点添加成功！延迟: ${tested.latency}ms`, 'success');
    } else {
      showToast('节点添加完成，但当前测试超时，请核对网址', 'error');
    }
  }
}

async function checkAuthStatus() {
  authBadge.textContent = '检查中...';
  authBadge.className = 'badge';

  const authState = await getAuthState(currentSettings.activeNodeUrl);
  if (authState.isLoggedIn && authState.userProfile) {
    authBadge.textContent = `已认证: ${authState.userProfile.name} (今日已下载 ${authState.userProfile.downloads_today}/${authState.userProfile.downloads_limit})`;
    authBadge.className = 'badge online';
  } else {
    authBadge.textContent = '未检测到有效登录凭据';
    authBadge.className = 'badge';
  }
}

async function handleSaveAuth(e: Event) {
  e.preventDefault();
  currentSettings.manualUserId = inputUserId.value.trim();
  currentSettings.manualUserKey = inputUserKey.value.trim();

  await saveSettings(currentSettings);
  showToast('认证凭据已成功保存', 'success');
  await checkAuthStatus();
}

async function handleTestAuth() {
  btnTestAuth.disabled = true;
  btnTestAuth.textContent = '测试中...';

  const uid = inputUserId.value.trim() || currentSettings.manualUserId;
  const ukey = inputUserKey.value.trim() || currentSettings.manualUserKey;

  if (!uid || !ukey) {
    // Try test with auto cookies
    const state = await getAuthState(currentSettings.activeNodeUrl);
    if (state.isLoggedIn && state.userProfile) {
      showToast(`当前节点 Cookie 验证成功！用户: ${state.userProfile.name}`, 'success');
    } else {
      showToast('未检测到有效凭据，请在上方填入 UserID 与 UserKey', 'error');
    }
    btnTestAuth.disabled = false;
    btnTestAuth.textContent = '测试当前凭据';
    return;
  }

  try {
    const profile = await fetchUserProfile(currentSettings.activeNodeUrl, uid, ukey);
    if (profile) {
      showToast(`凭据验证成功！用户: ${profile.name} (今日已下载: ${profile.downloads_today}/${profile.downloads_limit})`, 'success');
      await checkAuthStatus();
    } else {
      showToast('凭据验证失败，请确认 UserID 与 UserKey 是否准确无误', 'error');
    }
  } catch (err: any) {
    showToast(`验证异常: ${err.message}`, 'error');
  } finally {
    btnTestAuth.disabled = false;
    btnTestAuth.textContent = '测试当前凭据';
  }
}

async function handleClearAuth() {
  if (confirm('确认清空手动保存的凭据吗？')) {
    inputUserId.value = '';
    inputUserKey.value = '';
    currentSettings.manualUserId = '';
    currentSettings.manualUserKey = '';
    await saveSettings(currentSettings);
    showToast('手动凭据已清空', 'info');
    await checkAuthStatus();
  }
}

function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type}`;

  setTimeout(() => {
    toastEl.className = 'toast hidden';
  }, 4000);
}

document.addEventListener('DOMContentLoaded', init);
