import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {append2009to2011} from '../tools/classify/append-2009-2011.mjs';
import {loadTaxonomy} from '../tools/classify/taxonomy.mjs';
const load=async p=>JSON.parse(await readFile(p,'utf8'));
test('2009 source marks are aligned by question number, with disputed choices unkeyed',async()=>{
 const bank=await load('data/pyq/mymppsc-pyq-bank.json'), review=await load('data/pyq/source/2009-2011/answer-review-2009.json'), text=await readFile('data/pyq/source/2009-2011/pdf-extracted-2009.txt','utf8');
 const q=bank.questions.filter(q=>q.year===2009), counts={supported:0,disputed:0,unresolved:0};assert.equal(q.length,146);assert.match(bank.papers.find(p=>p.year===2009).paper_name,/identity unconfirmed/);
 for(const [i,r] of review.records.entries()){
  const n=r.question_number, start=new RegExp(`^${n}\\.\\s`,'m').exec(text);assert.ok(start); const after=text.slice(start.index+start[0].length), next=n<150?new RegExp(`^${n+1}\\.\\s`,'m').exec(after):null, section=next?after.slice(0,next.index):after;
  const marks=[...section.matchAll(/Ans\s*:\s*\(([A-D*])\)/gi)];assert.equal(marks.length,1,`Q${n}`);assert.equal(marks[0][1],r.source_mark);assert.equal(q[i].id,r.question_id);assert.ok(r.reasoning);counts[r.status]++;
  if(r.status==='supported'){assert.equal(r.answer,r.source_key);assert.deepEqual(q[i].supplied_answer.answer,[r.answer]);assert.equal(q[i].supplied_answer.status,'unofficial');assert.equal(q[i].explanation.correct_reasoning,r.reasoning);}else{assert.equal(r.answer,null);assert.equal(q[i].supplied_answer.answer,null);assert.equal(q[i].explanation,null);assert.equal(q[i].dispute.status,'unresolved');assert.equal(q[i].dispute.is_disputed,r.status==='disputed');}
 }
 assert.deepEqual(counts,{supported:94,disputed:12,unresolved:40});assert.equal(review.records.find(r=>r.question_number===15).source_mark,'*');
 for(const n of [75,76,77,78]) assert.ok(!q.some(r=>r.question_number===n));
});
test('2009 rebuild rejects missing, duplicate and invalid reviews',async()=>{
 const inputs={};for(const y of [2009,2010,2011])inputs[y]={source:await load(`data/pyq/source/2009-2011/pdf-transcription-${y}.json`),labels:await load(`data/pyq/source/2009-2011/final-taxonomy-${y}.json`),...(y!==2009?{review:await load(`data/pyq/source/2009-2011/answer-review-${y}.json`)}:{})};const review=await load('data/pyq/source/2009-2011/answer-review-2009.json'),taxonomy=await loadTaxonomy();
 for(const bad of [undefined,{...review,records:review.records.slice(1)},{...review,records:review.records.map((r,i)=>i===1?review.records[0]:r)},{...review,records:review.records.map((r,i)=>i===0?{...r,answer:'Z'}:r)}]){inputs[2009].review=bad;assert.throws(()=>append2009to2011({questions:[],papers:[]},inputs,taxonomy),/2009/);}
});
