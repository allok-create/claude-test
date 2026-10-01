#!/usr/bin/env node
/* 檢查題庫結構：編號唯一、選項數、答案範圍、分類存在、解析不為空 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'questions.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const { CATEGORIES, QUESTIONS } = ctx.window;

const errors = [];
const cats = new Set(CATEGORIES.map((c) => c.id));
const ids = new Set();
const texts = new Set();

for (const q of QUESTIONS) {
  const where = `[${q.id}]`;
  if (ids.has(q.id)) errors.push(`${where} 編號重複`);
  ids.add(q.id);
  if (!cats.has(q.cat)) errors.push(`${where} 分類不存在：${q.cat}`);
  if (!q.q || !q.q.trim()) errors.push(`${where} 題目為空`);
  if (texts.has(q.q)) errors.push(`${where} 題目文字重複`);
  texts.add(q.q);
  if (!Array.isArray(q.o) || q.o.length !== 4) errors.push(`${where} 選項須為 4 個`);
  else if (new Set(q.o).size !== 4) errors.push(`${where} 選項內容重複`);
  if (!q.e || !q.e.trim()) errors.push(`${where} 缺少解析`);
  const ans = Array.isArray(q.a) ? q.a : [q.a];
  if (ans.some((i) => !Number.isInteger(i) || i < 0 || i > 3)) errors.push(`${where} 答案索引超出範圍`);
  if (new Set(ans).size !== ans.length) errors.push(`${where} 答案重複`);
  if (q.type === 'multi' && ans.length < 2) errors.push(`${where} 複選題至少需 2 個正確答案`);
}

const count = (t) => QUESTIONS.filter((q) => q.type === t).length;
console.log(`題庫共 ${QUESTIONS.length} 題（單選 ${count('single')}、複選 ${count('multi')}）`);
for (const c of CATEGORIES) {
  const n = QUESTIONS.filter((q) => q.cat === c.id).length;
  console.log(`  ${c.name.padEnd(10, '　')} ${n}`);
  if (!n) errors.push(`分類「${c.name}」沒有題目`);
}

if (errors.length) {
  console.error(`\n發現 ${errors.length} 個問題：`);
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('\n題庫檢查通過 ✓');
