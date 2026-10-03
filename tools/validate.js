#!/usr/bin/env node
// Checks content/lessons.json for structural mistakes. Usage: node tools/validate.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'content', 'lessons.json');
const content = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];
const ids = new Set();
let words = 0, sentences = 0;

(content.units || []).forEach((u) => {
  if (!u.id || !u.title) errors.push(`unit missing id/title: ${JSON.stringify(u).slice(0, 60)}`);
  (u.items || []).forEach((it) => {
    const where = `${u.id}/${it.id || '?'}`;
    if (!it.id) errors.push(`${where}: missing id`);
    else if (ids.has(it.id)) errors.push(`${where}: duplicate id`);
    ids.add(it.id);
    if (it.type !== 'word' && it.type !== 'sentence') errors.push(`${where}: type must be word or sentence`);
    if (!it.mi) errors.push(`${where}: missing mi`);
    if (!it.en) errors.push(`${where}: missing en`);
    if (it.type === 'word') words++;
    if (it.type === 'sentence') {
      sentences++;
      if (!/[.?!]$/.test(it.mi || '')) errors.push(`${where}: sentence should end with . ? or !`);
      if (it.distractors && !Array.isArray(it.distractors)) errors.push(`${where}: distractors must be an array`);
    }
    ['audio_link', 'video_link', 'dictionary_link'].forEach((k) => {
      if (it[k] && !/^https?:\/\//.test(it[k])) errors.push(`${where}: ${k} must start with http(s)://`);
    });
  });
});

// Warn about duplicate English glosses within a type: they make multiple-choice ambiguous.
const seen = {};
(content.units || []).forEach((u) => u.items.forEach((it) => {
  const key = `${it.type}:${(it.en || '').toLowerCase()}`;
  if (seen[key]) errors.push(`${it.id}: same English as ${seen[key]} ("${it.en}")`);
  seen[key] = it.id;
}));

if (errors.length) {
  console.error('Content problems:\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log(`OK: ${content.units.length} units, ${words} words, ${sentences} sentences.`);
