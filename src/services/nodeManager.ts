import { ZLibNode } from '../types';
import { getSettings, saveSettings } from './storage';

export async function testNodeLatency(node: ZLibNode, timeoutMs: number = 4000): Promise<ZLibNode> {
  const updatedNode: ZLibNode = { ...node, status: 'testing' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = performance.now();
  try {
    // Attempt fetching favicon or lightweight endpoint with cache buster
    const testUrl = `${node.url.replace(/\/+$/, '')}/favicon.ico?_t=${Date.now()}`;
    const res = await fetch(testUrl, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store'
    });

    // 释放响应体流资源以立即释放 Chromium 内存
    if (res.body) {
      res.body.cancel().catch(() => {});
    }

    clearTimeout(timer);
    const duration = Math.round(performance.now() - startTime);

    if (res.ok || res.status === 404 || res.type === 'opaque') {
      updatedNode.latency = duration;
      updatedNode.status = 'available';
    } else {
      updatedNode.latency = duration;
      updatedNode.status = res.status < 500 ? 'available' : 'error';
    }
  } catch (err: any) {
    clearTimeout(timer);
    updatedNode.status = 'error';
    updatedNode.latency = undefined;
  }

  return updatedNode;
}

export async function testAllNodes(
  nodes: ZLibNode[],
  onNodeUpdated?: (node: ZLibNode) => void,
  concurrency: number = 5
): Promise<ZLibNode[]> {
  const results: ZLibNode[] = [...nodes];
  const queue = nodes.map((node, index) => ({ node, index }));

  // 限制最大并发数为 5，防止瞬间并发数十个网络连接造成内存激增与网络拥塞
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const tested = await testNodeLatency(item.node);
      results[item.index] = tested;
      if (onNodeUpdated) {
        onNodeUpdated(tested);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

export function sortNodesBySpeed(nodes: ZLibNode[]): ZLibNode[] {
  return [...nodes].sort((a, b) => {
    if (a.status === 'available' && b.status !== 'available') return -1;
    if (b.status === 'available' && a.status !== 'available') return 1;
    if (a.latency !== undefined && b.latency !== undefined) return a.latency - b.latency;
    return 0;
  });
}

export async function autoSelectBestNode(): Promise<string> {
  const settings = await getSettings();
  const testedNodes = await testAllNodes(settings.nodes);
  const sorted = sortNodesBySpeed(testedNodes);
  
  settings.nodes = sorted;

  const bestAvailable = sorted.find(n => n.status === 'available');
  if (bestAvailable) {
    settings.activeNodeUrl = bestAvailable.url;
  }
  await saveSettings(settings);

  return settings.activeNodeUrl;
}

export async function requestHostPermissionForUrl(url: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) {
    return true;
  }

  try {
    const parsed = new URL(url);
    const originPattern = `${parsed.protocol}//${parsed.hostname}/*`;
    return await chrome.permissions.request({
      origins: [originPattern]
    });
  } catch {
    return false;
  }
}
