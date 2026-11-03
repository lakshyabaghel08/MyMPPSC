#!/usr/bin/env python3
"""Conservative taxonomy decisions for the source-derived complete questions.

Subject decisions from the earlier reviewed staging; explicit topic and subtopic
ranges below are based on question content, not answer keys. Unsupported levels
are null. The six damaged questions are excluded from integration.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/pyq/source/2009-2011'
spec = importlib.util.spec_from_file_location('labels', ROOT / 'tools/classify-2009-2011-staging.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
TOPICS = {
 2009: {
  ('Geography','Physical Geography'): '1,105,149-150',
  ('Geography','Geography of India'): '2-5,7-8,43,49,123',
  ('Geography','World Geography'): '11-12',
  ('Geography','Maps and location'): '42,44',
  ('Geography','Rivers of Madhya Pradesh'): '50',
  ('Geography','Climate and soils of Madhya Pradesh'): '52',
  ('Environment','Ecology and biodiversity'): '6',
  ('Environment','Environmental laws and institutions'): '20',
  ('Environment','Wildlife of Madhya Pradesh'): '54',
  ('Environment','Pollution and climate change'): '111,115',
  ('Environment','Conservation initiatives'): '114',
  ('Polity','Union Legislature'): '13,15,127',
  ('Polity','Constitution of India'): '16,108',
  ('Polity','Constitutional bodies'): '14',
  ('Polity','Statutory and regulatory bodies'): '22',
  ('Polity','State Government'): '56',
  ('Polity','Local self-government'): '58',
  ('Economy','Indian Economy'): '17-19,25',
  ('Economy','Poverty and human development'): '23',
  ('Economy','Agriculture and rural economy'): '21,24,69',
  ('Economy','Economy of Madhya Pradesh'): '59-66,107',
  ('Economy','International economy'): '109',
  ('Current Affairs','Sports current affairs'): '26-40',
  ('Current Affairs','International current affairs'): '122,128-129',
  ('Current Affairs','National current affairs'): '124-125,130,134',
  ('Current Affairs','Awards and honours'): '126,131',
  ('Current Affairs','Science and technology current affairs'): '132',
  ('Current Affairs','Appointments and personalities'): '133',
  ('Madhya Pradesh Special','Administrative structure of Madhya Pradesh'): '41',
  ('Madhya Pradesh Special','Tribes of Madhya Pradesh'): '45',
  ('Madhya Pradesh Special','Schemes and institutions of Madhya Pradesh'): '53,70',
  ('Madhya Pradesh Special','Demography of Madhya Pradesh'): '67-68',
  ('Art and Culture','Heritage Sites'): '47',
  ('Art and Culture','Dance and music'): '51',
  ('Art and Culture','Culture of Madhya Pradesh'): '55',
  ('General Aptitude','Logical reasoning'): '71,73-74,82-85',
  ('General Aptitude','Quantitative aptitude'): '72,79-81',
  ('Science and Technology','Science and technology developments'): '86-100,110,113,120',
  ('Science and Technology','Physics'): '101,116-117,119,121',
  ('Science and Technology','Biology'): '102,104,118',
  ('Science and Technology','Chemistry'): '103,112',
  ('History','Modern India'): '106,137-148',
  ('History','Ancient India'): '135-136',
 },
 2010: {
  ('History','Ancient India'): '1-22,24-33',
  ('History','Medieval India'): '23,34-80',
  ('History','Modern India'): '81-118',
  ('Current Affairs','International current affairs'): '119',
  ('Polity','Constitution of India'): '120',
 },
 2011: {
  ('Geography','World Geography'): '2-5,8',
  ('Geography','Geography of India'): '12-17,19-27,30-32,34,44,47,51-52,56,58,93,106,110,113-114',
  ('Geography','Physiography of Madhya Pradesh'): '18,54',
  ('Geography','Maps and location'): '53',
  ('Geography','Economic and human geography'): '1,9-10,35,39-43,45,90-92,94-100,102-105,107-109,111-112,115-120',
  ('Geography','Physical Geography'): '55,61-89',
  ('Economy','Indian Economy'): '6,8,48',
  ('Economy','Agriculture and rural economy'): '36-37',
  ('Economy','Poverty and human development'): '46',
  ('Environment','Ecology and biodiversity'): '11',
  ('Environment','Pollution and climate change'): '49',
  ('Science and Technology','Health and diseases'): '50',
  ('Art and Culture','Festivals and fairs'): '57',
  ('Art and Culture','Culture of Madhya Pradesh'): '60',
  ('Madhya Pradesh Special','Administrative structure of Madhya Pradesh'): '59',
 },
}
# Only unambiguous, source-supported subtopics are set.
SUBS = {
 (2010,'Indus Valley Civilisation'): '1-2', (2010,'Vedic age'): '3-4',
 (2010,'Sangam age'): '5', (2010,'Buddhism and Jainism'): '7-10,19,26,28',
 (2010,'Mauryan empire'): '15,18,20-22', (2010,'Post-Mauryan period'): '24-25',
 (2010,'Gupta period'): '32', (2010,'Delhi Sultanate'): '41-43,46-49,51',
 (2010,'Bhakti and Sufi movements'): '54-56', (2010,'Vijayanagara and Bahmani'): '57-59',
 (2010,'Mughal empire'): '62-68,71-72,74', (2010,'Maratha empire'): '76-79',
 (2010,'British conquest and consolidation'): '81-91', (2010,'Revolt of 1857'): '101',
 (2010,'Socio-religious reform movements'): '103-104', (2010,'Indian National Congress'): '105-106,110',
 (2010,'Gandhian movements'): '107,112', (2010,'Revolutionary movements'): '116-117',
 (2009,'Indus Valley Civilisation'): '135', (2009,'Fundamental Rights'): '16',
 (2009,'Panchayati Raj'): '58', (2009,'Ozone depletion'): '111', (2009,'Project Tiger'): '114',
 (2009,'Time speed and distance'): '80', (2009,'Direction sense'): '71',
 (2011,'Food chain and food web'): '11', (2011,'Global warming'): '49',
 (2011,'Earthquakes and volcanoes'): '69,71', (2011,'Oceanography'): '86-89',
 (2011,'Rivers of India'): '17', (2011,'Soils of India'): '21',
 (2011,'Physiography of India'): '14-16', (2011,'Climate of India'): '19',
 (2011,'Natural vegetation of India'): '20,106', (2011,'Agriculture in India'): '25-27,30-32,34,44',
 (2011,'Mineral resources of India'): '23-24,56,58,110,113-114',
 (2011,'Population of India'): '47,51-52,93',
 (2011,'Landforms and their evolution'): '55,63-68,72-73,81',
 (2011,'Atmosphere and weather'): '74-80,82-83',
 (2011,'Industries'): '39,41-42,117-119',
 (2011,'Human settlement'): '97-98', (2011,'Tribes of India'): '92',
 (2011,'Cropping patterns'): '36', (2011,'Green Revolution'): '37',
 (2011,'Festivals of India'): '57', (2011,'Handicrafts of Madhya Pradesh'): '60',
 (2011,'Districts and divisions'): '59',
 (2009,'Transport in India'): '43', (2009,'Dams and reservoirs'): '50',
 (2009,'Soil types'): '52', (2009,'National income'): '17',
 (2009,'Planning in India'): '18,25', (2009,'Economic reforms of 1991'): '19',
 (2009,'Human Development Index'): '23', (2009,'Central Vigilance Commission'): '22',
 (2009,'Election Commission of India'): '14', (2009,'Lok Sabha'): '13,127',
 (2009,'Rajya Sabha'): '15', (2009,'Chief Minister and State Council of Ministers'): '56',
 (2009,'Industry of Madhya Pradesh'): '59', (2009,'Agriculture of Madhya Pradesh'): '60-61',
 (2009,'Minerals of Madhya Pradesh'): '63-64', (2009,'Sex ratio'): '67',
 (2009,'Literacy'): '68', (2009,'Rural employment programmes'): '69',
 (2009,'Olympic and Asian Games'): '26-28,31', (2009,'Cricket'): '29,40',
 (2009,'Other sports events'): '32-34,36-39',
 (2009,'Information technology'): '86-100',
 (2009,'Units and measurements'): '116', (2009,'Light and optics'): '119',
 (2009,'Nutrition and vitamins'): '118', (2009,'Alloys and mixtures'): '112',
 (2009,'British conquest and consolidation'): '137-138,145',
 (2009,'Revolt of 1857'): '140', (2009,'Gandhian movements'): '142-143',
 (2009,'Revolutionary movements'): '146',
}


def main():
 raw = json.loads((ROOT/'data/taxonomy/mppsc-taxonomy.json').read_text())
 tax = {s['subject']: {t['topic']: set(t['subtopics']) for t in s['topics']} for s in raw['subjects']}
 for year in (2009,2010,2011):
  source = json.loads((DIR/f'pdf-transcription-{year}.json').read_text())
  old = json.loads((DIR/f'pdf-taxonomy-{year}.json').read_text())['labels']
  labels = {}
  for q in source['questions']:
   n=q['question_number']
   if year==2011 and n in (7,38): continue
   subject='Geography' if year==2011 and n==89 else old[q['id']]['subject']; matches=[]
   for (s,t), ns in TOPICS[year].items():
    if s==subject and n in mod.numbers(ns): matches.append(t)
   if len(matches)>1: raise ValueError(f'{year} Q{n} duplicate topic')
   topic=matches[0] if matches else None
   submatches=[sub for (y,sub),ns in SUBS.items() if y==year and n in mod.numbers(ns)]
   if len(submatches)>1: raise ValueError(f'{year} Q{n} duplicate subtopic')
   sub=submatches[0] if submatches else None
   if subject not in tax or (topic and topic not in tax[subject]) or (sub and (not topic or sub not in tax[subject][topic])):
    raise ValueError(f'Invalid taxonomy: {year} Q{n} {subject}/{topic}/{sub}')
   labels[q['id']]={'subject':subject,'topic':topic,'subtopic':sub}
  obj={'note':'Source-supported manual taxonomy paths for complete PDF-derived records; null lower levels are deliberate.', 'labels':labels}
  rendered=json.dumps(obj,ensure_ascii=False,indent=2)+'\n'; path=DIR/f'final-taxonomy-{year}.json'
  if sys.argv[1:]==['--check']:
   if path.read_text()!=rendered: raise ValueError(f'{year} final taxonomy differs')
  elif not sys.argv[1:]: path.write_text(rendered)
  else: raise ValueError('usage: classify-2009-2011-final.py [--check]')
  print(year,len(labels),'subject',sum(bool(v['topic']) for v in labels.values()),'topic',sum(bool(v['subtopic']) for v in labels.values()),'subtopic')
if __name__=='__main__': main()
