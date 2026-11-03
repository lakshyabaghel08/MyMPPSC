import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {append2009to2011} from '../tools/classify/append-2009-2011.mjs';
import {loadTaxonomy} from '../tools/classify/taxonomy.mjs';
const load = async p => JSON.parse(await readFile(p,'utf8'));
test('2010 reviewed answers match the unofficial PDF key and uncertainties stay unkeyed', async () => {
 const bank=await load('data/pyq/mymppsc-pyq-bank.json'), review=await load('data/pyq/source/2009-2011/answer-review-2010.json');
 const text=await readFile('data/pyq/source/2009-2011/pdf-extracted-2010.txt','utf8');
 const key=[...text.matchAll(/Ans\s*:\s*\(([A-D])\)/gi)].map(m=>m[1]);
 const q=bank.questions.filter(q=>q.year===2010);assert.equal(q.length,120);assert.equal(key.length,120);assert.match(bank.papers.find(p=>p.year===2010).paper_name,/identity unconfirmed/);
 const counts={supported:0,disputed:0,unresolved:0};
 for(const [i,r] of review.records.entries()) { assert.equal(q[i].id,r.question_id);assert.equal(r.source_key,key[i]);assert.ok(r.reasoning);counts[r.status]++;
  if(r.status==='supported'){assert.equal(r.answer,key[i]);assert.deepEqual(q[i].supplied_answer.answer,[r.answer]);assert.equal(q[i].supplied_answer.status,'unofficial');assert.equal(q[i].explanation.correct_reasoning,r.reasoning);assert.equal(q[i].verified_answer,undefined);}
  else {assert.equal(r.answer,null);assert.equal(q[i].supplied_answer.answer,null);assert.equal(q[i].explanation,null);assert.equal(q[i].dispute.status,'unresolved');assert.equal(q[i].dispute.is_disputed,r.status==='disputed');}
 }
 assert.deepEqual(counts,{supported:80,disputed:14,unresolved:26});
});
test('2010 rebuild rejects missing, duplicate, and invalid review records',async()=>{
 const inputs={};for(const y of [2009,2010,2011])inputs[y]={source:await load(`data/pyq/source/2009-2011/pdf-transcription-${y}.json`),labels:await load(`data/pyq/source/2009-2011/final-taxonomy-${y}.json`),...(y!==2010?{review:await load(`data/pyq/source/2009-2011/answer-review-${y}.json`)}:{})};
 const review=await load('data/pyq/source/2009-2011/answer-review-2010.json'), taxonomy=await loadTaxonomy();
 for(const bad of [undefined,{...review,records:review.records.slice(1)},{...review,records:review.records.map((r,i)=>i===1?review.records[0]:r)},{...review,records:review.records.map((r,i)=>i===0?{...r,answer:'Z'}:r)}]){inputs[2010].review=bad;assert.throws(()=>append2009to2011({questions:[],papers:[]},inputs,taxonomy),/2010/);}
});
