import { ZLibNode } from '../types';
import { getSettings, saveSettings } from './storage';

const UPSTREAM_SOURCES = [
  // 1. jsDelivr CDN (国内无需翻墙即可高并发极速访问)
  'https://cdn.jsdelivr.net/gh/dongyubin/Awesome-Zlibrary@main/README.md',
  // 2. Raw GitHub (备用)
  'https://raw.githubusercontent.com/dongyubin/Awesome-Zlibrary/main/README.md',
  // 3. FastGit / jsDelivr npm 镜像备用
  'https://fastly.jsdelivr.net/gh/dongyubin/Awesome-Zlibrary@main/README.md'
];

export interface SyncResult {
  success: boolean;
  message: string;
  totalMirrors: number;
  addedCount: number;
  nodes: ZLibNode[];
}

/**
 * 从多源尝试获取 Awesome-Zlibrary 的 README.md
 */
export async function fetchUpstreamReadme(): Promise<string> {
  let lastError: any = null;

  for (const url of UPSTREAM_SOURCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${url}?_t=${Date.now()}`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store'
      });

      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 500 && text.includes('Zlibrary')) {
          return text;
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`无法连接到 Awesome-Zlibrary 镜像源 (${lastError?.message || '网络连接超时'})`);
}

/**
 * 解析 Markdown 表格中带有 ✅ 标记的可用镜像站点
 */
export function parseMirrorsFromMarkdown(markdown: string): ZLibNode[] {
  const lines = markdown.split('\n');
  const seenUrls = new Set<string>();
  const results: ZLibNode[] = [];

  for (const line of lines) {
    // 必须包含 ✅ 且不包含失效标识 🚫 或删除线 ~~
    if (line.includes('✅') && !line.includes('🚫') && !line.includes('~~')) {
      // 匹配 Markdown 格式链接：[显示文本](URL)
      const mdMatch = line.match(/\[(.*?)\]\((https?:\/\/[^\s\)\'\"<>]+)\)/i);
      let targetUrl = '';

      if (mdMatch) {
        targetUrl = mdMatch[2].trim();
      } else {
        // 匹配普通网址
        const rawMatch = line.match(/(https?:\/\/[^\s\|<>]+)/i);
        if (rawMatch) {
          targetUrl = rawMatch[1].trim();
        }
      }

      if (!targetUrl) continue;

      // 规范化 URL
      try {
        const parsed = new URL(targetUrl);
        // 过滤非 Z-Library 镜像（例如防止误匹配到说明性外部链接）
        const host = parsed.hostname.toLowerCase();
        if (
          !host.includes('z-lib') &&
          !host.includes('zlibrary') &&
          !host.includes('zlib') &&
          !host.includes('101su') &&
          !host.includes('intcn') &&
          !host.includes('intl.su') &&
          !host.includes('singlelogin')
        ) {
          continue;
        }

        const normalizedUrl = `${parsed.protocol}//${parsed.host}`;
        if (seenUrls.has(normalizedUrl)) continue;
        seenUrls.add(normalizedUrl);

        // 生成友好节点名称
        let friendlyName = `Z-Library (${host})`;
        if (host.startsWith('zh.')) {
          friendlyName = `Z-Library 中文 (${host})`;
        } else if (host.includes('rest') || host.includes('online')) {
          friendlyName = `Z-Library 官方 (${host})`;
        }

        results.push({
          id: `awesome-${host.replace(/[^a-z0-9]/g, '-')}`,
          name: friendlyName,
          url: normalizedUrl,
          status: 'unknown',
          isOfficial: true,
          isCustom: false
        });
      } catch {
        // 忽略无法解析的 URL
      }
    }
  }

  return results;
}

/**
 * 执行同步更新并保存到本地设置
 */
export async function syncMirrorsFromRemote(force: boolean = false): Promise<SyncResult> {
  const settings = await getSettings();

  // 如果非强制且距离上次同步小于 12 小时，则跳过
  if (!force && settings.lastSyncTime && Date.now() - settings.lastSyncTime < 12 * 3600 * 1000) {
    return {
      success: true,
      message: '镜像列表近期已同步过，无需重复抓取',
      totalMirrors: settings.nodes.length,
      addedCount: 0,
      nodes: settings.nodes
    };
  }

  const markdown = await fetchUpstreamReadme();
  const remoteNodes = parseMirrorsFromMarkdown(markdown);

  if (remoteNodes.length === 0) {
    throw new Error('未从 Awesome-Zlibrary 仓库解析到可用镜像数据');
  }

  // 合并节点列表：保留用户的自定义节点，合并或更新官方镜像
  const customNodes = settings.nodes.filter((n) => n.isCustom);
  const existingNodeMap = new Map(settings.nodes.map((n) => [n.url, n]));

  let addedCount = 0;
  const mergedOfficialNodes: ZLibNode[] = [];

  for (const rNode of remoteNodes) {
    const existing = existingNodeMap.get(rNode.url);
    if (existing) {
      // 保留已有的测速延迟与状态
      mergedOfficialNodes.push({
        ...rNode,
        latency: existing.latency,
        status: existing.status
      });
    } else {
      mergedOfficialNodes.push(rNode);
      addedCount++;
    }
  }

  // 最终节点列表 = 抓取的官方节点 + 用户添加的自定义节点
  const finalNodes = [...mergedOfficialNodes, ...customNodes];

  // 如果当前使用的节点已经不在列表中，自动重置为第一个节点
  if (!finalNodes.some((n) => n.url === settings.activeNodeUrl)) {
    settings.activeNodeUrl = finalNodes[0].url;
  }

  settings.nodes = finalNodes;
  settings.lastSyncTime = Date.now();
  await saveSettings(settings);

  return {
    success: true,
    message: `同步成功！共更新 ${finalNodes.length} 个镜像，新增 ${addedCount} 个可用节点。`,
    totalMirrors: finalNodes.length,
    addedCount,
    nodes: finalNodes
  };
}
