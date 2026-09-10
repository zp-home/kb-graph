#!/usr/bin/env node
/**
 * 扫描知识库的 markdown，把「条目 + 它们之间的链接」渲染成一个自包含的 3D 图谱 HTML。
 *
 *   node tools/kb-graph/build-graph.mjs            # 生成 kb-graph.html
 *   node tools/kb-graph/build-graph.mjs --out x.html
 *
 * 刻意不依赖 3d-force-graph / three.js：48 个节点用不上 1.2MB 的渲染引擎，
 * 而且引了就得 vendor 或联网。力导向和投影自己算，输出单文件，双击即开。
 *
 * 输出里不含时间戳 —— 否则每次重新生成都产生 git 改动，图没变也脏。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '../..');
const TEMPLATE = ['template.html', 'index.html'].map(f => path.join(import.meta.dirname, f)).find(p => existsSync(p));

const argOut = process.argv.indexOf('--out');
const OUT = argOut > -1 ? path.resolve(process.argv[argOut + 1]) : path.join(REPO, 'kb-graph.html');

/** 用 git ls-files 而不是遍历目录：自动尊重 .gitignore，不会把 vendor/ 之类扫进来 */
function listMarkdown() {
  const out = execFileSync('git', ['-C', REPO, 'ls-files', '*.md'], { encoding: 'utf8' });
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

const files = listMarkdown();
if (files.length === 0) { console.error('没找到任何 md，先确认 D:\kb 是 git 仓库且已提交'); process.exit(1); }

/** 顶层目录 -> 分组；根目录的文件单独一组 */
function groupOf(rel) {
  const seg = rel.split('/');
  if (seg.length === 1) return '(根)';
  if (seg[0] === '_memory-snapshots') return '自动记忆快照';
  return seg[0];
}

/** 标题优先取第一个 # 一级标题，取不到退回文件名 */
function titleOf(rel, text) {
  const m = text.match(/^#\s+(.+?)\s*$/m);
  let t = m ? m[1] : path.basename(rel, '.md');
  t = t.replace(/[`*_]/g, '').trim();
  if (t.length > 42) t = t.slice(0, 41) + '…';
  return t;
}

const nodes = [];
const byPath = new Map();
const byBase = new Map();   // basename(无扩展) -> [rel]，给 [[wikilink]] 解析用
const texts = new Map();

for (const rel of files) {
  const abs = path.join(REPO, rel);
  if (!existsSync(abs)) continue;
  const text = readFileSync(abs, 'utf8');
  texts.set(rel, text);
  const lines = text.split('\n').length;
  const n = {
    id: rel,
    title: titleOf(rel, text),
    group: groupOf(rel),
    lines,
    isIndex: /(^|\/)README\.md$/.test(rel) || /(^|\/)MEMORY\.md$/.test(rel),
  };
  nodes.push(n);
  byPath.set(rel, n);
  const base = path.basename(rel, '.md');
  if (!byBase.has(base)) byBase.set(base, []);
  byBase.get(base).push(rel);
}

const edgeSet = new Map();
function addEdge(a, b, kind) {
  if (a === b) return;
  const key = a < b ? `${a}\u0000${b}\u0000${kind}` : `${b}\u0000${a}\u0000${kind}`;
  if (edgeSet.has(key)) return;
  edgeSet.set(key, { source: a, target: b, kind });
}

for (const rel of files) {
  const text = texts.get(rel);
  const dir = path.posix.dirname(rel);

  // 1) markdown 相对链接 ](xxx.md)  —— 跳过 http(s) 和 file:///（后者指向仓库外）
  for (const m of text.matchAll(/\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g)) {
    const href = m[1];
    if (/^(https?:|file:|mailto:)/i.test(href)) continue;
    const target = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, href));
    if (byPath.has(target)) addEdge(rel, target, 'link');
  }

  // 2) wikilink [[name]] —— 快照里的自动记忆用这种写法
  for (const m of text.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    const name = m[1].trim();
    const cands = byBase.get(name);
    if (!cands) continue;
    // 同名多个时优先同目录的，避免快照和正式条目串线
    const same = cands.find(c => path.posix.dirname(c) === dir);
    addEdge(rel, same || cands[0], 'wiki');
  }
}

// 3) 目录归属边（默认关闭）：让没有任何链接的条目也挂得住，不至于飘在外面
for (const n of nodes) {
  const dir = path.posix.dirname(n.id);
  if (dir === '.') continue;
  const idx = `${dir}/README.md`;
  if (byPath.has(idx)) addEdge(n.id, idx, 'dir');
  else {
    const mem = `${dir}/MEMORY.md`;
    if (byPath.has(mem)) addEdge(n.id, mem, 'dir');
  }
}

const links = [...edgeSet.values()];
const real = links.filter(l => l.kind !== 'dir').length;
const deg = new Map(nodes.map(n => [n.id, 0]));
for (const l of links) {
  if (l.kind === 'dir') continue;
  deg.set(l.source, deg.get(l.source) + 1);
  deg.set(l.target, deg.get(l.target) + 1);
}
for (const n of nodes) n.deg = deg.get(n.id);

const groups = [...new Set(nodes.map(n => n.group))].sort();
const data = { nodes, links, groups };

if (!TEMPLATE) { console.error('找不到模板：同目录需要 template.html 或 index.html'); process.exit(1); }
const html = readFileSync(TEMPLATE, 'utf8').replace('/*__DATA__*/null', () => JSON.stringify(data));
writeFileSync(OUT, html, 'utf8');

const orphan = nodes.filter(n => n.deg === 0);
console.log(`节点 ${nodes.length}  真实链接边 ${real}  目录边 ${links.length - real}  分组 ${groups.length}`);
console.log(`分组：${groups.map(g => `${g}(${nodes.filter(n => n.group === g).length})`).join('  ')}`);
if (orphan.length) console.log(`无链接条目 ${orphan.length} 个（图里靠目录边挂住）：\n  ${orphan.map(n => n.id).join('\n  ')}`);
console.log(`已写出 ${path.relative(REPO, OUT)}  (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);

// 同时产出 graph.json：给「渲染器部署在 Pages、数据本地加载」那条路子用。
// 注意它含全部条目标题和路径（内部服务名会出现在标题里），所以 .gitignore 掉，
// 绝不能提交进任何公开仓库。
const JSON_OUT = path.join(path.dirname(OUT), 'graph.json');
writeFileSync(JSON_OUT, JSON.stringify(data, null, 1), 'utf8');
console.log(`已写出 ${path.relative(REPO, JSON_OUT)}  (${(Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(0)} KB)  ← 拖到 Pages 页面即可看图`);
