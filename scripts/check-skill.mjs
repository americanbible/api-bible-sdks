#!/usr/bin/env node
// Checks the api-bible Agent Skill: the Agent Skills spec's structural rules, a few
// facts the skill must not get wrong, and that every ts/tsx example typechecks
// against the built SDKs, so an SDK change that breaks an example fails CI.
// Run after building both packages: `npm run build && npm run check:skill`.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_DIR = path.join(ROOT, 'skills', 'api-bible');
const CHECK_DIR = path.join(ROOT, 'node_modules', '.cache', 'api-bible-skill-check');
const LEGACY_HOST = 'api.scripture.api.bible';
const BUILT_ENTRIES = ['packages/typescript/dist/index.d.ts', 'packages/react/dist/index.d.ts'];

const errors = [];
const fail = (message) => errors.push(message);
const rel = (file) => path.relative(ROOT, file);

export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return { fields: {}, body: text };
  const fields = {};
  const lines = match[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const field = /^([a-z-]+):\s*(.*)$/.exec(lines[i]);
    if (!field) continue;
    const [, key, value] = field;
    if (value === '>' || value === '>-') {
      const folded = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) folded.push(lines[++i].trim());
      fields[key] = folded.join(' ');
    } else {
      fields[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return { fields, body: text.slice(match[0].length) };
}

export function codeBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^```(\w*)/.exec(lines[i]);
    if (!open) continue;
    const start = i + 1;
    let end = start;
    while (end < lines.length && !lines[end].startsWith('```')) end++;
    blocks.push({ lang: open[1], line: start + 1, code: lines.slice(start, end).join('\n') });
    i = end;
  }
  return blocks;
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

function checkStructure(files) {
  const skillPath = path.join(SKILL_DIR, 'SKILL.md');
  const { fields, body } = parseFrontmatter(readFileSync(skillPath, 'utf8'));

  if (fields.name !== path.basename(SKILL_DIR)) {
    fail(`SKILL.md: name "${fields.name}" must match the folder name "${path.basename(SKILL_DIR)}"`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fields.name ?? '') || fields.name.length > 64) {
    fail('SKILL.md: name must be 1-64 lowercase letters, digits and single hyphens');
  }
  const description = fields.description ?? '';
  if (description.length < 1 || description.length > 1024) {
    fail(`SKILL.md: description must be 1-1024 characters (is ${description.length})`);
  }
  if (!description.includes('API.Bible')) fail('SKILL.md: description must mention API.Bible');
  if (!fields.license) fail('SKILL.md: license is missing');

  const bodyLines = body.split('\n').length;
  if (bodyLines >= 500) fail(`SKILL.md: body is ${bodyLines} lines; keep it under 500`);

  const linked = new Set();
  for (const [, target] of body.matchAll(/\]\(([^)#\s]+)\)/g)) {
    if (/^[a-z]+:/.test(target)) continue;
    const resolved = path.resolve(SKILL_DIR, target);
    if (!existsSync(resolved)) fail(`SKILL.md: link target ${target} does not exist`);
    else if (path.dirname(resolved) !== path.join(SKILL_DIR, 'references')) {
      fail(`SKILL.md: ${target} must sit directly in references/`);
    }
    linked.add(resolved);
  }
  for (const file of files) {
    if (file !== skillPath && !linked.has(file)) fail(`${rel(file)} is not linked from SKILL.md`);
  }

  let legacyCount = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const count = text.split(LEGACY_HOST).length - 1;
    legacyCount += count;
    if (count > 0 && file !== skillPath) fail(`${rel(file)}: names the legacy host ${LEGACY_HOST}`);
    for (const block of codeBlocks(text)) {
      if (/\bAuthorization\b|\bBearer\b/.test(block.code)) {
        fail(`${rel(file)}:${block.line}: code uses Authorization/Bearer; API.Bible auth is the api-key header`);
      }
    }
  }
  if (legacyCount !== 1) {
    fail(`${LEGACY_HOST} must appear exactly once (the legacy-host note in SKILL.md); found ${legacyCount}`);
  }
}

function checkSnippets(files) {
  const missing = BUILT_ENTRIES.filter((entry) => !existsSync(path.join(ROOT, entry)));
  if (missing.length > 0) {
    fail(`build the SDKs first (npm run build); missing ${missing.join(', ')}`);
    return;
  }

  rmSync(CHECK_DIR, { recursive: true, force: true });
  mkdirSync(CHECK_DIR, { recursive: true });

  const origins = new Map();
  for (const file of files) {
    const stem = path.relative(SKILL_DIR, file).replace(/[/.]/g, '_');
    for (const block of codeBlocks(readFileSync(file, 'utf8'))) {
      if (block.lang !== 'ts' && block.lang !== 'tsx') continue;
      const name = `${stem}_L${block.line}.${block.lang}`;
      writeFileSync(path.join(CHECK_DIR, name), `${block.code}\nexport {};\n`);
      origins.set(name, `${rel(file)}:${block.line}`);
    }
  }

  writeFileSync(
    path.join(CHECK_DIR, 'globals.d.ts'),
    [
      "declare const client: import('@americanbible/api-bible-sdk').BibleClient;",
      'declare const bibleId: string;',
      '',
    ].join('\n'),
  );
  writeFileSync(path.join(CHECK_DIR, 'package.json'), '{ "type": "module" }\n');
  writeFileSync(
    path.join(CHECK_DIR, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
        },
        files: ['globals.d.ts', ...origins.keys()],
      },
      null,
      2,
    ),
  );

  const tsc = createRequire(path.join(ROOT, 'package.json')).resolve('typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', CHECK_DIR, '--pretty', 'false'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const match = /^(?:.*[/\\])?([^/\\(]+\.tsx?)\((\d+),\d+\): (.*)$/.exec(line);
        if (!match || !origins.has(match[1])) return line;
        const [, name, lineInBlock, message] = match;
        const [file, blockLine] = origins.get(name).split(':');
        return `${file}:${Number(blockLine) + Number(lineInBlock) - 1}: ${message}`;
      });
    fail(`ts/tsx examples do not typecheck against the SDK:\n  ${output.join('\n  ')}`);
  }
  return origins.size;
}

const files = markdownFiles(SKILL_DIR);
checkStructure(files);
const snippetCount = checkSnippets(files);

if (errors.length > 0) {
  console.error(`check-skill: ${errors.length} problem(s)\n`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`check-skill: ${files.length} files OK, ${snippetCount} ts/tsx examples typecheck`);
