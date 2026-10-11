/**
 * tools/classify/rules.mjs — deterministic subject/topic/subtopic classification.
 *
 * The engine is deliberately boring: keyword and phrase evidence, explicit
 * weights, no randomness, no model. Every assignment can be traced back to the
 * rules that fired (`matched` in the result), which is what makes a review
 * report possible and keeps the output reproducible run after run.
 *
 * Design rules, all of which are asserted by tests/classification.test.js:
 *  - Nothing is invented. A question the rules cannot place is returned
 *    UNCLASSIFIED with a reason, never given a plausible-looking label.
 *  - The printed answer and explanation are *contextual evidence only* (they are
 *    weighted lower than the question stem and never decide a classification on
 *    their own), and never treated as proof that the key is correct.
 *  - Madhya Pradesh content is separated from general Indian content: MP rules
 *    are boosted when MP markers are present, general-India rules are damped.
 *  - Confidence is derived from the evidence margin, not asserted.
 *
 * This module is build-time only: nothing in js/ imports it.
 */

export const CLASSIFICATION_SOURCE_RULES = 'pipeline-rules';
export const CLASSIFICATION_SOURCE_AI = 'pipeline-ai';

/** Evidence weights for the parts of a record we are allowed to read. */
export const FIELD_WEIGHTS = Object.freeze({ question: 3, options: 1, explanation: 1.25 });

/** Tunables. Raising MIN_SUBJECT_SCORE makes the pipeline stricter. */
export const MIN_SUBJECT_SCORE = 1.25;
export const AMBIGUOUS_SUBJECT_MARGIN = 0.18;
export const AMBIGUOUS_TOPIC_MARGIN = 0.12;
export const STRONG_SCORE = 6;
export const MAX_CONFIDENCE = 0.95;
/** Ceiling for a classification whose only evidence is the printed explanation. */
export const EXPLANATION_ONLY_CONFIDENCE = 0.7;

/**
 * Keep letters, combining marks, digits and spaces.
 * NOTE: deliberately *not* js/core/util.js normaliseText — that one strips
 * combining marks, which would shatter Devanagari words into bare consonants.
 */
export function foldText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rule table. `terms` mixes single tokens (matched as whole words) and
 * multi-word phrases (matched as substrings of the folded text), in English or
 * Hindi. `mp: true` marks a rule as Madhya-Pradesh-specific, `generic: true`
 * marks a rule as deliberately about India/the world rather than the state.
 */
function rule(id, subject, topic, subtopic, weight, terms, flags = {}) {
  return { id, subject, topic, subtopic: subtopic || null, weight, terms, ...flags };
}

export const RULES = [
  /* ------------------------------------------------------------- History -- */
  rule('hist-prehistoric', 'History', 'Prehistory and Art', 'Rock shelters', 3.2, [
    'prehistoric', 'rock shelter', 'rock painting', 'bhimbetka', 'भीमबेटका', 'mesolithic', 'neolithic', 'paleolithic', 'chalcolithic', 'stone age', 'microlith', 'cave painting', 'गुफा चित्र',
  ]),
  rule('hist-indus', 'History', 'Ancient India', 'Indus Valley Civilisation', 3.2, [
    'indus valley', 'harappa', 'mohenjodaro', 'mohenjo daro', 'lothal', 'kalibangan', 'dholavira', 'rakhigarhi', 'sindhu ghati', 'सिंधु घाटी', 'हड़प्पा', 'indus civilisation', 'indus civilization', 'great bath',
  ]),
  rule('hist-vedic', 'History', 'Ancient India', 'Vedic age', 3, [
    'vedic', 'veda', 'rigveda', 'rig veda', 'samaveda', 'yajurveda', 'atharvaveda', 'upanishad', 'पुरान', 'purana', 'आर्य', 'aryan', 'sabha and samiti', 'vaidika',
  ]),
  rule('hist-buddhism-jainism', 'History', 'Ancient India', 'Buddhism and Jainism', 3.2, [
    'buddhism', 'buddha', 'buddhist', 'jainism', 'mahavira', 'jain', 'tirthankara', 'buddhist council', 'tripitaka', 'sangha', 'nirvana', 'kaivalya', 'बौद्ध', 'जैन', 'महावीर', 'तिर्थंकर', 'दिगंबर', 'श्वेतांबर',
  ]),
  rule('hist-maurya', 'History', 'Ancient India', 'Mauryan empire', 3.2, [
    'maurya', 'mauryan', 'chandragupta', 'ashoka', 'bindusara', 'kautilya', 'chanakya', 'arthashastra', 'मेगस्थनीज', 'megasthenes', 'indica', 'मौर्य', 'अशोक', 'edict',
  ]),
  rule('hist-mauryan-art', 'History', 'Ancient India', 'Mauryan art and architecture', 2.6, ['sanchi stupa', 'स्तूप', 'stupa', 'ashokan pillar', 'lion capital', 'sarnath', 'yaksha', 'barabar caves'], { topic: 'Ancient India', subtopic: 'Mauryan art and architecture' }),
  rule('hist-post-mauryan', 'History', 'Ancient India', 'Post-Mauryan period', 2.8, [
    'kushan', 'shunga', 'satavahana', 'indo greek', 'shaka', 'parthian', 'kanishka', 'gandhara school', 'mathura school', 'amravati school', 'kuhan',
  ]),
  rule('hist-gupta', 'History', 'Ancient India', 'Gupta period', 3.2, [
    'gupta', 'chandragupta ii', 'samudragupta', 'vikramaditya', 'fa hien', 'faxian', 'kalidasa', 'aryabhata', 'varahamihira', 'nalanda', 'गुप्त काल', 'golden age of india',
  ]),
  rule('hist-harsha', 'History', 'Ancient India', 'Harshavardhana', 2.8, ['harsha', 'harshavardhana', 'hiuen tsang', 'xuanzang', 'kannauj', 'thaneshwar', 'हर्षवर्धन']),
  rule('hist-sangam', 'History', 'Ancient India', 'Sangam age', 2.6, ['sangam', 'cheras', 'cholas', 'pandyas', 'tamilakam', 'silappadikaram']),
  rule('hist-ancient-science', 'History', 'Ancient India', 'Ancient science and literature', 2.4, ['sushruta', 'charaka', 'brahmagupta', 'bhaskaracharya', 'panini', 'patanjali', 'siddhanta', 'sulba sutra']),

  rule('hist-sultanate', 'History', 'Medieval India', 'Delhi Sultanate', 3.2, [
    'sultanate', 'slave dynasty', 'khilji', 'khalji', 'tughlaq', 'sayyid dynasty', 'lodi dynasty', 'iltutmish', 'balban', 'alauddin', 'muhammad bin tughlaq', 'firoz shah', 'iqta', 'सल्तनत', 'delhi sultanate', 'razia',
  ]),
  rule('hist-mughal', 'History', 'Medieval India', 'Mughal empire', 3.2, [
    'mughal', 'babur', 'humayun', 'akbar', 'jahangir', 'shah jahan', 'aurangzeb', 'din ilahi', 'mansabdar', 'todar mal', 'मुगल', 'जहांगीर', 'औरंगजेब', 'तुजुक', 'ain i akbari',
  ]),
  rule('hist-vijayanagara', 'History', 'Medieval India', 'Vijayanagara and Bahmani', 3, ['vijayanagara', 'bahmani', 'krishnadevaraya', 'hampi', 'devaraya', 'tuluva']),
  rule('hist-maratha', 'History', 'Medieval India', 'Maratha empire', 3, [
    'maratha', 'shivaji', 'peshwa', 'bajirao', 'ashtapradhan', 'chauth', 'sardeshmukhi', 'मराठा', 'शिवाजी', 'पेशवा', 'guerilla warfare',
  ]),
  rule('hist-bhakti-sufi', 'History', 'Medieval India', 'Bhakti and Sufi movements', 3, [
    'bhakti', 'sufi', 'kabir', 'raidas', 'tulsidas', 'mirabai', 'nanak', 'guru nanak', 'chishti', 'silsila', 'khwaja', 'nizamuddin auliya', 'भक्ति', 'सूफी', 'saint', 'tansen',
  ]),
  rule('hist-medieval-art', 'History', 'Medieval India', 'Medieval art and architecture', 2.6, ['indo islamic', 'mosque', 'minar', 'qutub', 'tomb architecture', 'charbagh', 'pietra dura', 'jharokha', 'arch and dome']),
  rule('hist-medieval-admin', 'History', 'Medieval India', 'Medieval administration and revenue', 2.4, ['zabt', 'dahsala', 'jagirdar', 'zamindari system in medieval', 'land revenue system', 'diwan i arz', 'karkhana']),
  rule('hist-rajput', 'History', 'Medieval India', 'Rajput states', 2.6, ['rajput', 'rana sanga', 'maharana pratap', 'haldighati', 'chittor', 'prithviraj chauhan', 'राजपूत']),

  rule('hist-british', 'History', 'Modern India', 'British conquest and consolidation', 3, [
    'east india company', 'battle of plassey', 'battle of buxar', 'subsidiary alliance', 'doctrine of lapse', 'dual government', 'clive', 'wellesley', 'dalhousie', 'diwani rights',
  ]),
  rule('hist-1857', 'History', 'Modern India', 'Revolt of 1857', 3.4, [
    '1857', 'revolt of 1857', 'sepoy mutiny', 'first war of independence', 'nana saheb', 'tantia tope', 'rani lakshmibai', 'mangal pandey', 'bahadur shah zafar', 'kunwar singh', 'विद्रोह', '1857 की क्रांति',
  ]),
  rule('hist-reform', 'History', 'Modern India', 'Socio-religious reform movements', 3, [
    'raja ram mohan roy', 'brahmo samaj', 'aryasamaj', 'arya samaj', 'dayanand', 'vivekananda', 'ramakrishna', 'sati abolition', 'ishwar chandra vidyasagar', 'jyotiba phule', 'satyashodhak', 'aligarh movement', 'syed ahmad khan', 'deoband', 'reform movement',
  ]),
  rule('hist-congress', 'History', 'Modern India', 'Indian National Congress', 3.2, [
    'indian national congress', 'a o hume', 'hume', 'congress session', 'moderates', 'extremists', 'surat split', 'lucknow pact', 'congress president', 'दादाभाई नौरोजी', 'dadabhai', 'गोपाल कृष्ण गोखले', 'gokhale',
  ]),
  rule('hist-gandhian', 'History', 'Modern India', 'Gandhian movements', 3.4, [
    'gandhi', 'nehru', 'non cooperation', 'civil disobedience', 'quit india', 'salt march', 'dandi', 'champaran', 'kheda', 'ahmedabad mill strike', 'round table conference', 'khilafat', 'सत्याग्रह', 'satyagraha', 'chauri chaura', 'गंधी', 'असहयोग',
  ]),
  rule('hist-revolutionary', 'History', 'Modern India', 'Revolutionary movements', 3, [
    'bhagat singh', 'chandrashekhar azad', 'subhash chandra bose', 'azad hind', 'ina', 'revolutionary', 'anushilan', 'ghadar', 'kakori', 'chittagong armoury', 'सुभाष', 'भगत सिंह',
  ]),
  rule('hist-governors', 'History', 'Modern India', 'Governor Generals and Viceroys', 2.8, [
    'governor general', 'viceroy', 'lord curzon', 'lord irwin', 'lord hardinge', 'lord chelmsford', 'lord mountbatten', 'lord canning', 'lord bentinck', 'lord cornwallis', 'राज्यपाल जनरल',
  ]),
  rule('hist-acts', 'History', 'Modern India', 'Acts and constitutional development', 2.8, [
    'regulating act', 'charter act', 'government of india act 1858', 'indian councils act', 'morley minto', 'montagu chelmsford', 'government of india act 1935', 'rowlatt act', 'vernacular press act', 'indian independence act',
  ]),
  rule('hist-partition', 'History', 'Modern India', 'Partition and independence', 2.8, ['partition of india', 'radcliffe line', 'cabinet mission', 'mountbatten plan', 'independence act 1947', 'direct action day', 'two nation theory']),
  rule('hist-mp-1857', 'History', 'History of Madhya Pradesh', 'Revolt of 1857 in Madhya Pradesh', 3.4, [
    '1857 in madhya pradesh', '1857 mp', 'tatya tope mp', 'jhalkari bai', 'avantibai', 'रानी अवन्तीबाई', 'झलकारी', 'mandla revolt', 'neemuch', 'mhow revolt',
  ], { mp: true, fallback: { subject: 'History', topic: 'Modern India', subtopic: 'Revolt of 1857' } }),
  rule('hist-mp-freedom', 'History', 'History of Madhya Pradesh', 'Freedom struggle in Madhya Pradesh', 3, [
    'freedom struggle in madhya pradesh', 'jabalpur conspiracy case', 'gondwana freedom', 'bhopal state congress', 'indore state congress', 'gwalior state congress', 'rewa revolt', 'mandla satyagraha', 'chhindwara satyagraha',
  ], { mp: true, fallback: { subject: 'History', topic: 'Modern India', subtopic: 'Gandhian movements' } }),
  rule('hist-mp-mahajanapada', 'History', 'History of Madhya Pradesh', 'Mahajanapadas in Madhya Pradesh', 3, [
    'avanti', 'chedi', 'dasharna', 'malwa mahajanapada', 'mahishmati', 'kaushambi', 'विदिशा', 'vidisha', 'erakina', 'trigarta mp', 'उज्जयिनी', 'ujjayini',
  ], { mp: true }),
  rule('hist-mp-paramara', 'History', 'History of Madhya Pradesh', 'Paramara dynasty', 3.2, ['paramara', 'bhoja', 'raja bhoj', 'bhojpur', 'dhara nagari', 'परमार', 'भोज', 'munja', 'sindhuraj'], { mp: true, fallback: { subject: 'History', topic: 'Medieval India', subtopic: 'Rajput states' } }),
  rule('hist-mp-chandela', 'History', 'History of Madhya Pradesh', 'Chandela dynasty', 3.2, ['chandela', 'khajuraho', 'dhanga', 'vaidyanatha', 'jejakabhukti', 'महोबा', 'mahoba', 'kalinjar', 'चंदेल', 'khajuraho temples'], { mp: true, fallback: { subject: 'History', topic: 'Art and architecture', subtopic: 'Temple architecture' } }),
  rule('hist-mp-bundela', 'History', 'History of Madhya Pradesh', 'Bundela and Baghelkhand', 2.8, ['bundela', 'chhatrasal', 'chhatrasaal', 'orchha', 'datia', 'panna state', 'rewa state', 'baghel dynasty', 'बुंदेला', 'छत्रसाल', 'ओरछा'], { mp: true, fallback: { subject: 'History', topic: 'Medieval India', subtopic: 'Rajput states' } }),
  rule('hist-mp-maratha', 'History', 'History of Madhya Pradesh', 'Maratha rule in Madhya Pradesh', 2.8, ['maratha in malwa', 'holkar', 'scindia', 'shinde', 'indore state', 'gwalior state', 'ahilyabai', 'महेश्वर', 'maheshwar', 'dhar state', 'देवास'], { mp: true, fallback: { subject: 'History', topic: 'Medieval India', subtopic: 'Maratha empire' } }),
  rule('hist-mp-princely', 'History', 'History of Madhya Pradesh', 'Princely states and agencies', 2.8, ['princely state', 'central provinces', 'central india agency', 'gwalior residency', 'bhopawar agency', 'malwa agency', 'baghelkhand agency', 'bundelkhand agency', 'संस्थान', 'रियासत'], { mp: true, fallback: { subject: 'History', topic: 'Modern India', subtopic: 'British conquest and consolidation' } }),

  rule('hist-world-fr', 'History', 'World History', 'French Revolution', 3, ['french revolution', 'bastille', 'louis xvi', 'napoleon', 'jacobin', 'robe spierre', 'declaration of the rights of man', 'फ्रांसीसी क्रांति']),
  rule('hist-world-american', 'History', 'World History', 'American Revolution', 2.8, ['american revolution', 'boston tea party', 'george washington', 'declaration of independence', 'american civil war', 'abraham lincoln']),
  rule('hist-world-russian', 'History', 'World History', 'Russian Revolution', 2.8, ['russian revolution', 'lenin', 'bolshevik', 'menshevik', 'tsar nicholas', 'stalin', 'communist manifesto', 'marx', 'engels']),
  rule('hist-world-industrial', 'History', 'World History', 'Industrial Revolution', 2.8, ['industrial revolution', 'james watt', 'steam engine', 'spinning jenny', 'factory system', 'luddite']),
  rule('hist-world-wars', 'History', 'World History', 'World wars', 2.8, ['world war', 'first world war', 'second world war', 'treaty of versailles', 'league of nations', 'axis powers', 'allied powers', 'holocaust', 'pearl harbour']),
  rule('hist-world-renaissance', 'History', 'World History', 'Renaissance and Enlightenment', 2.4, ['renaissance', 'reformation', 'martin luther', 'enlightenment', 'voltaire', 'rousseau', 'montesquieu', 'leonardo da vinci']),

  rule('hist-art-temple', 'History', 'Art and architecture', 'Temple architecture', 3, [
    'nagara style', 'dravida style', 'vesara', 'shikhara', 'vimana', 'garbhagriha', 'mandapa', 'temple architecture', 'gopuram', 'रचना शैली', 'panchayatana temple',
  ]),
  rule('hist-art-indo-islamic', 'History', 'Art and architecture', 'Indo-Islamic architecture', 2.8, ['indo islamic architecture', 'taj mahal', 'red fort', 'fatehpur sikri', 'buland darwaza', 'humayun tomb', 'char minar', 'mughal architecture']),
  rule('hist-art-cave', 'History', 'Art and architecture', 'Cave and rock-cut architecture', 3, ['ajanta', 'ellora', 'elephanta', 'rock cut', 'cave temple', 'bagh caves', 'बाघ गुफा', 'rock cut architecture', 'kailasa temple']),
  rule('hist-art-painting', 'History', 'Art and architecture', 'Painting schools', 2.6, ['rajasthani painting', 'pahari painting', 'mughal painting', 'bengal school', 'madhubani', 'warli', 'kalamkari', 'tanore', 'chitrakala']),
  rule('hist-art-sculpture', 'History', 'Art and architecture', 'Sculpture schools', 2.6, ['gandhara sculpture', 'mathura sculpture', 'amravati sculpture', 'bronze sculpture', 'natraja', 'chola bronze', 'sculpture school']),
  rule('hist-art-dance', 'History', 'Art and architecture', 'Dance and music traditions', 2.6, ['bharatanatyam', 'kathakali', 'kathak', 'odissi', 'manipuri', 'kuchipudi', 'mohiniyattam', 'sattriya', 'classical dance', 'sangeet natak', 'शास्त्रीय नृत्य']),
  rule('hist-art-unesco', 'History', 'Art and architecture', 'UNESCO listings', 2.8, ['unesco', 'world heritage site', 'heritage site', 'intangible cultural heritage', 'विश्व धरोहर']),

  /* -------------------------------------------------------------- Polity -- */
  rule('pol-preamble', 'Polity', 'Constitution of India', 'Preamble', 3, ['preamble', 'प्रस्तावना', 'we the people', 'sovereign socialist secular', 'berubari', '42nd amendment preamble', 'सत्यमेव जयते', 'satyameva jayate', 'national motto', 'mundaka upanishad', 'राष्ट्रीय आदर्श वाक्य', 'state emblem of india']),
  rule('pol-fundamental-rights', 'Polity', 'Constitution of India', 'Fundamental Rights', 3.4, [
    'fundamental right', 'article 14', 'article 19', 'article 21', 'article 32', 'article 12', 'article 13', 'article 15', 'article 16', 'article 17', 'article 25', 'article 32', 'right to equality', 'right to freedom', 'right against exploitation', 'मौलिक अधिकार', 'writ of habeas corpus',
  , 'untouchability', 'छुआछूत', 'article 20', 'article 22', 'article 23', 'article 24', 'article 25']),
  rule('pol-dpsp', 'Polity', 'Constitution of India', 'Directive Principles', 3.2, ['directive principle', 'part iv of the constitution', 'article 36', 'article 37', 'article 38', 'article 39', 'article 44', 'article 51', 'नीति निदेशक', 'directive state policy']),
  rule('pol-duties', 'Polity', 'Constitution of India', 'Fundamental Duties', 3, ['fundamental dut', 'article 51a', 'swaran singh committee', 'कर्तव्य', 'part iva']),
  rule('pol-amendment', 'Polity', 'Constitution of India', 'Constitutional amendments', 3.2, ['constitutional amendment', 'amendment act', 'article 368', '42nd amendment', '44th amendment', '73rd amendment', '74th amendment', '86th amendment', '101st amendment', '103rd amendment', 'संविधान संशोधन']),
  rule('pol-schedules', 'Polity', 'Constitution of India', 'Schedules of the Constitution', 2.8, ['schedule of the constitution', 'first schedule', 'seventh schedule', 'eighth schedule', 'ninth schedule', 'tenth schedule', 'eleventh schedule', 'twelfth schedule', 'अनुसूची']),
  rule('pol-basic-structure', 'Polity', 'Constitution of India', 'Basic structure', 2.8, ['basic structure', 'kesavananda bharati', 'golaknath', 'minerva mills', 'doctrine of basic']),
  rule('pol-making', 'Polity', 'Constitution of India', 'Making of the Constitution', 2.6, ['constituent assembly', 'drafting committee', 'b r ambedkar', 'constitution assembly', 'november 26 1949', 'january 26 1950', 'राजेंद्र प्रसाद', 'rajendra prasad', 'संविधान सभा', 'संविधान निर्माण']),

  rule('pol-president', 'Polity', 'Union Executive', 'President of India', 3.2, ['president of india', 'rashtrapati', 'article 52', 'article 53', 'article 61', 'impeachment of president', 'राष्ट्रपति', 'electoral college for president', 'ordinance power of president']),
  rule('pol-vice-president', 'Polity', 'Union Executive', 'Vice President', 2.6, ['vice president', 'article 63', 'article 64', 'ex officio chairman of rajya sabha', 'उपराष्ट्रपति']),
  rule('pol-pm', 'Polity', 'Union Executive', 'Prime Minister and Council of Ministers', 3.2, ['prime minister', 'council of ministers', 'article 74', 'article 75', 'article 78', 'प्रधानमंत्री', 'cabinet', 'collective responsibility']),
  rule('pol-ag', 'Polity', 'Union Executive', 'Attorney General', 2.4, ['attorney general', 'article 76', 'solicitor general', 'महाभियक्ता']),

  rule('pol-parliament', 'Polity', 'Union Legislature', 'Parliament', 3.2, ['parliament of india', 'article 79', 'joint sitting', 'article 108', 'parliamentary privileges', 'संसद', 'question hour', 'zero hour', 'no confidence motion']),
  rule('pol-lok-sabha', 'Polity', 'Union Legislature', 'Lok Sabha', 3, ['lok sabha', 'house of the people', 'speaker of lok sabha', 'लोक सभा', '550 members']),
  rule('pol-rajya-sabha', 'Polity', 'Union Legislature', 'Rajya Sabha', 3, ['rajya sabha', 'council of states', 'article 80', 'article 249', 'राज्य सभा']),
  rule('pol-committees', 'Polity', 'Union Legislature', 'Parliamentary committees', 2.6, ['public accounts committee', 'estimates committee', 'committee on subordinate legislation', 'parliamentary committee', 'business advisory committee']),
  rule('pol-procedure', 'Polity', 'Union Legislature', 'Legislative procedure', 2.6, ['money bill', 'article 110', 'article 112', 'ordinary bill', 'constitutional amendment bill', 'joint sitting of parliament', 'appropriation bill', 'finance bill']),

  rule('pol-supreme-court', 'Polity', 'Judiciary', 'Supreme Court', 3.4, ['supreme court', 'article 124', 'article 137', 'article 141', 'article 143', 'chief justice of india', 'उच्चतम न्यायालय', 'advisory jurisdiction', 'appellate jurisdiction']),
  rule('pol-high-court', 'Polity', 'Judiciary', 'High Courts', 3.2, ['high court', 'article 214', 'article 226', 'article 227', 'chief justice of high court', 'उच्च न्यायालय']),
  rule('pol-subordinate', 'Polity', 'Judiciary', 'Subordinate courts', 2.6, ['district court', 'article 233', 'article 235', 'subordinate court', 'sessions judge', 'लोक अदालत', 'lok adalat', 'nyaya panchayat']),
  rule('pol-writs', 'Polity', 'Judiciary', 'Writs', 3.2, ['writ', 'habeas corpus', 'mandamus', 'certiorari', 'prohibition writ', 'quo warranto', 'रिट']),
  rule('pol-judicial-review', 'Polity', 'Judiciary', 'Judicial review', 2.8, ['judicial review', 'judicial activism', 'judicial overreach', 'due process of law', 'procedure established by law', 'न्यायिक समीक्षा']),
  rule('pol-pil', 'Polity', 'Judiciary', 'Public Interest Litigation', 2.4, ['public interest litigation', 'locus standi', 'epistolary jurisdiction', 'जनहित याचिका']),

  rule('pol-governor', 'Polity', 'State Government', 'Governor', 3.2, ['governor of state', 'article 153', 'article 155', 'article 156', 'article 161', 'article 200', 'article 201', 'state governor', 'राज्यपाल']),
  rule('pol-cm', 'Polity', 'State Government', 'Chief Minister and State Council of Ministers', 3, ['chief minister', 'article 163', 'article 164', 'मुख्यमंत्री', 'state council of ministers']),
  rule('pol-state-legislature', 'Polity', 'State Government', 'State Legislature', 3, ['state legislature', 'legislative assembly', 'vidhan sabha', 'legislative council', 'vidhan parishad', 'article 168', 'विधान सभा', 'विधान परिषद'], { notWith: ['संविधान सभा'] }),
  rule('pol-advocate-general', 'Polity', 'State Government', 'Advocate General', 2.4, ['advocate general', 'article 165', 'राज्य महाधिवक्ता']),
  rule('pol-state-psc', 'Polity', 'State Government', 'State Public Service Commission', 2.8, ['state public service commission', 'article 315', 'article 316', 'article 320', 'mppsc', 'लोक सेवा आयोग']),

  rule('pol-federalism', 'Polity', 'Union and State Relations', 'Distribution of legislative powers', 3, ['seventh schedule', 'union list', 'state list', 'concurrent list', 'residuary powers', 'article 245', 'article 246', 'article 248', 'federal structure', 'संघ सूची', 'राज्य सूची']),
  rule('pol-emergency', 'Polity', 'Union and State Relations', 'Emergency provisions', 3.2, ['emergency provision', 'article 352', 'article 356', 'article 360', 'national emergency', "president's rule", 'state emergency', 'financial emergency', 'आपातकाल', 's r bommai']),
  rule('pol-finance-commission', 'Polity', 'Union and State Relations', 'Finance Commission', 3, ['finance commission', 'article 280', 'वित्त आयोग', 'devolution of taxes', 'vertical devolution']),
  rule('pol-interstate', 'Polity', 'Union and State Relations', 'Inter-State Council', 2.6, ['inter state council', 'article 263', 'zonal council', 'article 262', 'inter state water dispute', 'अंतरराज्यीय परिषद']),
  rule('pol-gst-council', 'Polity', 'Union and State Relations', 'GST Council', 2.8, ['gst council', 'article 279a', 'goods and services tax council', 'जीएसटी परिषद']),

  rule('pol-eci', 'Polity', 'Constitutional bodies', 'Election Commission of India', 3.2, ['election commission', 'article 324', 'chief election commissioner', 'model code of conduct', 'निर्वाचन आयोग', 'electronic voting machine']),
  rule('pol-cag', 'Polity', 'Constitutional bodies', 'Comptroller and Auditor General', 3, ['comptroller and auditor general', 'article 148', 'article 149', 'article 151', 'cag', 'महालेखाकार']),
  rule('pol-upsc', 'Polity', 'Constitutional bodies', 'Union Public Service Commission', 3, ['union public service commission', 'article 315', 'article 316', 'upsc', 'संघ लोक सेवा आयोग']),
  rule('pol-sc-st-commission', 'Polity', 'Constitutional bodies', 'National Commission for SCs and STs', 2.8, ['national commission for scheduled castes', 'national commission for scheduled tribes', 'article 338', 'article 338a', '91st amendment', '89th amendment']),

  rule('pol-lokpal', 'Polity', 'Statutory and regulatory bodies', 'Lokpal and Lokayukta', 3, ['lokpal', 'lokayukta', 'article 169 lokayukta', 'ombudsman', 'भ्रष्टाचार निवारण']),
  rule('pol-nhrc', 'Polity', 'Statutory and regulatory bodies', 'National Human Rights Commission', 2.8, ['national human rights commission', 'nhrc', 'protection of human rights act 1993', 'मानवाधिकार आयोग']),
  rule('pol-niti', 'Polity', 'Statutory and regulatory bodies', 'NITI Aayog', 3, ['niti aayog', 'planning commission', 'national institution for transforming india', 'नीति आयोग']),
  rule('pol-cic', 'Polity', 'Statutory and regulatory bodies', 'Central Information Commission', 2.8, ['central information commission', 'state information commission', 'information commission', 'सूचना आयोग']),
  rule('pol-ncw', 'Polity', 'Statutory and regulatory bodies', 'National Commission for Women', 2.4, ['national commission for women', 'ncw', 'राष्ट्रीय महिला आयोग']),

  rule('pol-panchayati-raj', 'Polity', 'Local self-government', 'Panchayati Raj', 3.4, ['panchayati raj', 'panchayat raj', 'gram sabha', '73rd amendment', 'balwant rai mehta committee', 'ashok mehta committee', '11th schedule', 'पंचायती राज', 'ग्राम सभा', 'sarpanch']),
  rule('pol-urban-local', 'Polity', 'Local self-government', 'Urban local bodies', 3.2, ['municipal corporation', 'municipal council', 'nagar palika', '74th amendment', '12th schedule', 'urban local body', 'नगर पालिका', 'मेयर', 'mayor', 'notified town area']),
  rule('pol-pesa', 'Polity', 'Local self-government', 'PESA Act', 2.8, ['pesa', 'panchayats extension to scheduled areas', 'fifth schedule', 'scheduled areas', 'tribal area administration']),
  rule('pol-mp-local', 'Polity', 'Local self-government', 'Local bodies in Madhya Pradesh', 2.8, ['madhya pradesh panchayati raj act', 'mp panchayat', 'madhya pradesh municipal corporation act', 'janpad panchayat', 'zilla panchayat', 'ग्राम पंचायत', 'जनपद पंचायत', 'जिला पंचायत'], { mp: true, fallback: { subject: 'Polity', topic: 'Local self-government', subtopic: 'Panchayati Raj' } }),

  rule('pol-citizenship', 'Polity', 'Citizenship and civil rights', 'Citizenship', 3, ['citizenship', 'article 5 to 11', 'citizenship act 1955', 'citizenship amendment act', 'naturalisation', 'नागरिकता']),
  rule('pol-rti', 'Polity', 'Citizenship and civil rights', 'Right to Information', 3.2, ['right to information', 'rti act', 'rti act 2005', 'public information officer', 'सूचना का अधिकार']),
  rule('pol-rte', 'Polity', 'Citizenship and civil rights', 'Right to Education', 3, ['right to education', 'rte act', 'rte act 2009', 'article 21a', 'शिक्षा का अधिकार']),

  /* ----------------------------------------------------------- Geography -- */
  rule('geo-earth-interior', 'Geography', 'Physical Geography', 'Interior of the Earth', 2.8, ['interior of the earth', 'crust mantle core', 'lithosphere', 'asthenosphere', 'seismic waves', 'p waves and s waves', 'earthquake', 'mohorovicic', 'भूकंप']),
  rule('geo-rocks', 'Geography', 'Physical Geography', 'Rocks and minerals', 2.8, ['igneous rock', 'sedimentary rock', 'metamorphic rock', 'rock cycle', 'extrusive rock', 'intrusive rock', 'lava plateau', 'deccan trap', 'चट्टान', 'basalt', 'granite', 'limestone']),
  rule('geo-landforms', 'Geography', 'Physical Geography', 'Landforms and their evolution', 2.6, ['landform', 'plateau', 'plain', 'mountain range', 'erosion and deposition', 'glacial landform', 'karst', 'sand dune', 'मैदान', 'पठार']),
  rule('geo-latlong', 'Geography', 'Physical Geography', 'Latitude and longitude', 3, ['latitude', 'longitude', 'equator', 'tropic of cancer', 'tropic of capricorn', 'arctic circle', 'antarctic circle', 'prime meridian', 'international date line', 'अक्षांश', 'देशांतर', 'कर्क रेखा', 'भूमध्य रेखा']),
  rule('geo-atmosphere', 'Geography', 'Physical Geography', 'Atmosphere and weather', 3, ['atmosphere', 'troposphere', 'stratosphere', 'mesosphere', 'thermosphere', 'exosphere', 'ozone layer', 'ionosphere', 'वायुमंडल', 'air pressure', 'humidity', 'वायु दाब']),
  rule('geo-climatology', 'Geography', 'Physical Geography', 'Climatology', 2.8, ['climatology', 'koppen climate classification', 'el nino', 'la nina', 'jet stream', 'coriolis force', 'planetary winds', 'trade winds', 'westerlies', 'cyclone and anticyclone', 'मानसून', 'monsoon mechanism']),
  rule('geo-ocean', 'Geography', 'Physical Geography', 'Oceanography', 2.8, ['ocean current', 'salinity', 'tide', 'continental shelf', 'ocean trench', 'mariana trench', 'gulf stream', 'kuroshio', 'coral reef', 'महासागर', 'समुद्री धारा']),

  rule('geo-india-physiography', 'Geography', 'Geography of India', 'Physiography of India', 3, ['himalaya', 'great himalaya', 'shivalik', 'indo gangetic plain', 'peninsular plateau', 'western ghats', 'eastern ghats', 'coastal plain', 'thar desert', 'islands of india', 'भारत का भूआकृति']),
  rule('geo-india-rivers', 'Geography', 'Geography of India', 'Rivers of India', 3.2, [
    'ganga', 'ganges', 'yamuna', 'brahmaputra', 'godavari', 'krishna river', 'kaveri', 'cauvery', 'mahanadi', 'indus river', 'sutlej', 'beas', 'ravi river', 'chenab', 'jhelum', 'ghaghara', 'gandak', 'kosi', 'damodar', 'नदी', 'river basin india', 'distributar',
  ], { generic: true }),
  rule('geo-india-climate', 'Geography', 'Geography of India', 'Climate of India', 2.8, ['climate of india', 'indian monsoon', 'south west monsoon', 'north east monsoon', 'retreating monsoon', 'rainfall in india', 'भारत की जलवायु']),
  rule('geo-india-soil', 'Geography', 'Geography of India', 'Soils of India', 2.8, ['alluvial soil', 'black soil', 'regur', 'red soil', 'laterite soil', 'arid soil', 'forest soil', 'icmr soil classification', 'भूमि', 'मिट्टी', 'soil of india', 'soil erosion', 'काली मिट्टी']),
  rule('geo-india-vegetation', 'Geography', 'Geography of India', 'Natural vegetation of India', 2.6, ['tropical evergreen forest', 'tropical deciduous forest', 'montane forest', 'mangrove', 'sundarbans', 'natural vegetation of india', 'forest type']),
  rule('geo-india-agri', 'Geography', 'Geography of India', 'Agriculture in India', 2.6, ['cropping season', 'kharif', 'rabi', 'zaid', 'agricultural production in india', 'food grain production', 'खेती', 'फसल']),
  rule('geo-india-minerals', 'Geography', 'Geography of India', 'Mineral resources of India', 2.6, ['iron ore in india', 'coal field', 'bauxite', 'manganese', 'mica', 'limestone in india', 'petroleum reserves', 'mineral resources of india', 'खनिज']),
  rule('geo-india-transport', 'Geography', 'Geography of India', 'Transport in India', 2.4, ['national highway', 'railway zone', 'golden quadrilateral', 'inland waterway', 'major port', 'konkan railway', 'परिवहन', 'railway', 'रेल', 'first railway line', 'भारतीय रेल', 'rail network']),
  rule('geo-india-population', 'Geography', 'Geography of India', 'Population of India', 2.6, ['population of india', 'population density of india', 'census of india', 'sex ratio of india', 'literacy rate of india', 'जनसंख्या']),

  rule('geo-mp-narmada', 'Geography', 'Rivers of Madhya Pradesh', 'Narmada basin', 3.6, [
    'narmada', 'नर्मदा', 'amarkantak', 'अमरकंटक', 'sardar sarovar', 'bargi dam', 'बरगी', 'omkareshwar dam', 'indira sagar', 'narmada valley', 'narmada basin',
  ], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Rivers of India' } }),
  rule('geo-mp-tapti', 'Geography', 'Rivers of Madhya Pradesh', 'Tapti basin', 3.4, ['tapti', 'tapi river', 'ताप्ती', 'तापी', 'multai', 'बाणासागर ताप्ती', 'tapti basin', 'tapti valley'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Rivers of India' } }),
  rule('geo-mp-chambal', 'Geography', 'Rivers of Madhya Pradesh', 'Chambal basin', 3.4, ['chambal', 'चंबल', 'gandhi sagar', 'गांधी सागर', 'banas', 'shipra', 'क्षिप्रा', 'शिप्रा', 'chambal ravines', 'chambal valley'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Rivers of India' } }),
  rule('geo-mp-betwa', 'Geography', 'Rivers of Madhya Pradesh', 'Betwa basin', 3.4, ['betwa', 'बेतवा', 'vetravati', 'rajghat dam', 'betwa basin', 'betwa river'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Rivers of India' } }),
  rule('geo-mp-son', 'Geography', 'Rivers of Madhya Pradesh', 'Son basin', 3.2, ['son river', 'सोन नदी', 'sonbhadra', 'banas sagar', 'बानसागर', 'amarkantak son', 'rihand'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Rivers of India' } }),
  rule('geo-mp-tributary', 'Geography', 'Rivers of Madhya Pradesh', 'Tributaries', 3, [
    'ken river', 'केन', 'tons river mp', 'टोंस', 'sindh river mp', 'सिंध नदी', 'parbati river', 'पार्वती', 'kalisindh', 'काली सिंध', 'dhasan', 'जमनी', 'jamunia', 'tributary of', 'सहायक नदी',
  ], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Rivers of India' } }),
  rule('geo-mp-dams', 'Geography', 'Rivers of Madhya Pradesh', 'Dams and reservoirs', 3, [
    'dam in madhya pradesh', 'bargi', 'indira sagar dam', 'gandhi sagar dam', 'banas sagar dam', 'rajghat dam', 'barna dam', 'reservoir of madhya pradesh', 'बांध', 'जलाशय', 'परियोजना',
  ], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Rivers of India' } }),
  rule('geo-mp-lakes', 'Geography', 'Rivers of Madhya Pradesh', 'Lakes and waterfalls', 3, [
    'upper lake bhopal', 'lower lake bhopal', 'bhojtal', 'tawa reservoir', 'dhuandhar', 'धुआंधार', 'mandhar falls', 'kapil dhara', 'dudhdhara', 'waterfall of madhya pradesh', 'झील', 'झरना', 'lake in madhya pradesh',
  ], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Rivers of India' } }),
  rule('geo-mp-interlinking', 'Geography', 'Rivers of Madhya Pradesh', 'Interlinking of rivers', 2.8, ['river interlinking', 'narmada kshipra link', 'ken betwa link', 'parbati kalisindh chambal link', 'नदी जोड़', 'river link project'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Rivers of India' } }),

  rule('geo-mp-satpura', 'Geography', 'Physiography of Madhya Pradesh', 'Satpura range', 3.4, ['satpura', 'सतपुड़ा', 'mahadeo hills', 'धूपगढ़', 'dhupgarh', 'amarkantak plateau', 'satpura range', 'पचमढ़ी', 'pachmarhi'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Physiography of India' } }),
  rule('geo-mp-vindhya', 'Geography', 'Physiography of Madhya Pradesh', 'Vindhyan range', 3.4, ['vindhya', 'vindhyan', 'विंध्य', 'vindhyachal', 'kaimur hills', 'vindhyan range'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Physiography of India' } }),
  rule('geo-mp-malwa', 'Geography', 'Physiography of Madhya Pradesh', 'Malwa plateau', 3.4, ['malwa plateau', 'मालवा', 'malwa region', 'malwa plateau region', 'malwa upland'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Physiography of India' } }),
  rule('geo-mp-bundelkhand', 'Geography', 'Physiography of Madhya Pradesh', 'Bundelkhand plateau', 3, ['bundelkhand', 'बुंदेलखंड', 'bundelkhand plateau', 'bundelkhand region'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Physiography of India' } }),
  rule('geo-mp-baghelkhand', 'Geography', 'Physiography of Madhya Pradesh', 'Baghelkhand plateau', 3, ['baghelkhand', 'बघेलखंड', 'baghelkhand plateau', 'baghelkhand region', 'rewa plateau'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Physiography of India' } }),
  rule('geo-mp-narmada-valley', 'Geography', 'Physiography of Madhya Pradesh', 'Narmada valley', 2.8, ['narmada valley', 'narmada rift valley', 'नर्मदा घाटी', 'grabens of narmada'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Physiography of India' } }),
  rule('geo-mp-drainage', 'Geography', 'Physiography of Madhya Pradesh', 'Drainage systems', 3, ['drainage of madhya pradesh', 'drainage system of mp', 'watershed of madhya pradesh', 'अपवाह तंत्र', 'drainage basin mp', 'river system of madhya pradesh'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Physiography of India' } }),
  rule('geo-mp-peaks', 'Geography', 'Physiography of Madhya Pradesh', 'Peaks and passes', 3, ['dhupgarh', 'धूपगढ़', 'highest peak of madhya pradesh', 'chauragarh', 'अमरकंटक चोटी', 'peak of madhya pradesh', 'उच्चतम चोटी'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Physiography of India' } }),
  rule('geo-mp-location', 'Geography', 'Physiography of Madhya Pradesh', 'Location', 3, ['madhya pradesh is located', 'area of madhya pradesh', 'largest state by area', 'location of madhya pradesh', 'tropic of cancer passes through', 'boundaries of madhya pradesh', 'मध्य प्रदेश का क्षेत्रफल', 'मध्य प्रदेश की स्थिति'], { mp: true, fallback: { subject: 'Geography', topic: 'Maps and location', subtopic: 'Location' } }),

  rule('geo-mp-climate', 'Geography', 'Climate and soils of Madhya Pradesh', 'Monsoon in Madhya Pradesh', 3, ['monsoon in madhya pradesh', 'monsoon of mp', 'मानसून मध्य प्रदेश', 'south west monsoon mp'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Climate of India' } }),
  rule('geo-mp-rainfall', 'Geography', 'Climate and soils of Madhya Pradesh', 'Rainfall distribution', 3, ['rainfall in madhya pradesh', 'rainfall distribution mp', 'वार्षिक वर्षा', 'highest rainfall district', 'district receives the highest rainfall', 'सर्वाधिक वर्षा', 'वर्षा', 'मंडला', 'rainfall'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Climate of India' } }),
  rule('geo-mp-soils', 'Geography', 'Climate and soils of Madhya Pradesh', 'Soil types', 3, ['soil of madhya pradesh', 'soils found in madhya pradesh', 'black cotton soil mp', 'मध्य प्रदेश की मिट्टी', 'deep black soil', 'medium black soil', 'mixed red soil', 'laterite soil mp'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Soils of India' } }),
  rule('geo-mp-drought', 'Geography', 'Climate and soils of Madhya Pradesh', 'Drought prone areas', 2.6, ['drought prone district', 'drought prone area mp', 'सूखा प्रभावित', 'drought prone area programme'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Climate of India' } }),
  rule('geo-mp-crops', 'Geography', 'Climate and soils of Madhya Pradesh', 'Cropping patterns', 2.8, ['cropping pattern of madhya pradesh', 'major crop of madhya pradesh', 'soybean state', 'leading producer of', 'मध्य प्रदेश की फसल', 'principal crop'], { mp: true, fallback: { subject: 'Geography', topic: 'Geography of India', subtopic: 'Agriculture in India' } }),

  rule('geo-world-continents', 'Geography', 'World Geography', 'Continents and oceans', 2.8, ['continent', 'pacific ocean', 'atlantic ocean', 'indian ocean', 'arctic ocean', 'southern ocean', 'largest continent', 'महाद्वीप']),
  rule('geo-world-landforms', 'Geography', 'World Geography', 'Major landforms', 2.6, ['highest peak of the world', 'mount everest', 'kilimanjaro', 'andaman sea', 'great barrier reef', 'sahara', 'gobi desert', 'pampas', 'steppes', 'prairie', 'downs']),
  rule('geo-world-boundaries', 'Geography', 'World Geography', 'International boundaries', 2.8, ['international boundary', 'radcliffe line', 'mcmahon line', 'durand line', 'maginot line', '38th parallel', 'सीमा रेखा']),
  rule('geo-world-deserts', 'Geography', 'World Geography', 'Deserts of the world', 2.6, ['desert', 'sahara', 'gobi', 'atacama', 'kalahari', 'thar', 'मरुस्थल']),
  rule('geo-world-straits', 'Geography', 'World Geography', 'Straits and isthmuses', 2.8, ['strait', 'isthmus', 'palk strait', 'malacca strait', 'hormuz strait', 'gibraltar', 'bosporus', 'bering strait', 'jलडमरूमध्य', 'panama canal', 'suez canal', 'भू-संधि']),
  rule('geo-world-ports', 'Geography', 'World Geography', 'Important ports', 2.4, ['port city', 'japan port', 'rotterdam', 'shanghai port', 'singapore port', 'bandar abbas', 'दुनिया के प्रमुख बंदरगाह']),

  rule('geo-map-location', 'Geography', 'Maps and location', 'Location', 2.4, ['capital of', 'state capital', 'located in which state', 'which state shares border', 'राजधानी']),
  rule('geo-map-neighbours', 'Geography', 'Maps and location', 'Boundaries and neighbours', 2.6, ['neighbouring state', 'shares its border with', 'which state does not border', 'सीमा से लगते', 'bordering countries of india']),
  rule('geo-map-countries', 'Geography', 'Maps and location', 'States and capitals', 2.4, ['capital city of the country', 'countries and capitals', 'currency of', 'राष्ट्रीय राजधानी']),
  rule('geo-map-timezone', 'Geography', 'Maps and location', 'Time zones', 2.6, ['time zone', 'ist indian standard time', 'greenwich mean time', 'utc', 'international date line crossing', 'समय क्षेत्र']),

  rule('geo-energy', 'Geography', 'Economic and human geography', 'Energy resources', 2.6, ['energy resource', 'coal reserves', 'solar energy capacity', 'wind energy', 'hydroelectric potential', 'nuclear power plant', 'renewable energy capacity', 'ऊर्जा संसाधन']),
  rule('geo-tribes-india', 'Geography', 'Economic and human geography', 'Tribes of India', 2.8, ['scheduled tribe of india', 'tribe found in', 'jarawa', 'sentinelese', 'todas', 'irula', 'gaddi', 'bhotia', 'जनजाति', 'भारत की जनजातियां']),
  rule('geo-urbanisation', 'Geography', 'Economic and human geography', 'Urbanisation', 2.4, ['urbanisation', 'urban agglomeration', 'megacity', 'नगरीकरण', 'metropolitan city']),

  /* --------------------------------------------------------- Environment -- */
  rule('env-ecosystem', 'Environment', 'Ecology and biodiversity', 'Ecosystem', 3, ['ecosystem', 'ecology', 'producers and consumers', 'decomposer', 'ecological niche', 'habitat and niche', 'ecotone', 'पारिस्थितिकी तंत्र', 'biome']),
  rule('env-foodchain', 'Environment', 'Ecology and biodiversity', 'Food chain and food web', 2.8, ['food chain', 'food web', 'trophic level', 'biomagnification', 'bioaccumulation', 'ecological pyramid', 'खाद्य श्रृंखला']),
  rule('env-biodiversity', 'Environment', 'Ecology and biodiversity', 'Biodiversity', 3, ['biodiversity', 'species diversity', 'genetic diversity', 'hotspot of biodiversity', 'endemic species', 'जैव विविधता', 'biodiversity hotspots']),
  rule('env-species-status', 'Environment', 'Ecology and biodiversity', 'Species status', 2.8, ['endangered species', 'critically endangered', 'vulnerable species', 'iucn red list', 'red data book', 'extinct species', 'केवल संकटग्रस्त', 'vulture crisis', 'ग्रेटेड']),
  rule('env-succession', 'Environment', 'Ecology and biodiversity', 'Ecological succession', 2.4, ['ecological succession', 'primary succession', 'secondary succession', 'pioneer species', 'climax community', 'अनुक्रमण']),

  rule('env-parks', 'Environment', 'Protected areas', 'National parks', 3.4, ['national park', 'राष्ट्रीय उद्यान', 'which national park', 'protected area network', 'tiger reserve in india']),
  rule('env-sanctuaries', 'Environment', 'Protected areas', 'Wildlife sanctuaries', 3.2, ['wildlife sanctuary', 'अभयारण्य', 'bird sanctuary', 'sanctuary in india', 'protected area']),
  rule('env-biosphere', 'Environment', 'Protected areas', 'Biosphere reserves', 3.2, ['biosphere reserve', 'जीवमंडल', 'man and biosphere', 'mab programme', 'nanda devi biosphere', 'nilgiri biosphere']),
  rule('env-tiger-reserve', 'Environment', 'Protected areas', 'Tiger reserves', 3.2, ['tiger reserve', 'project tiger site', 'बाघ अभयारण्य', 'tiger conservation', 'core and buffer zone']),
  rule('env-ramsar', 'Environment', 'Protected areas', 'Ramsar sites', 3, ['ramsar', 'ramsar site', 'wetland conservation', 'saras aajeevika', 'मोंट्रियल', 'wetland of international importance', 'wetland', 'wetlands', 'रामसर']),
  rule('env-unesco-protected', 'Environment', 'Protected areas', 'UNESCO listings', 2.6, ['unesco world heritage natural', 'world natural heritage', 'natural heritage site']),

  rule('env-mp-state-animal', 'Environment', 'Wildlife of Madhya Pradesh', 'State animal and bird', 3.2, ['state animal of madhya pradesh', 'state bird of madhya pradesh', 'state flower of madhya pradesh', 'state tree of madhya pradesh', 'राज्य पशु', 'राज्य पक्षी', 'swamp deer', 'barasingha', 'बारासिंघा', 'dudhraj', 'palash'], { mp: true }),
  rule('env-mp-tigers', 'Environment', 'Wildlife of Madhya Pradesh', 'Tigers of Madhya Pradesh', 3.4, ['tigers in madhya pradesh', 'tiger count mp', 'tiger state of india', 'बाघों की संख्या', 'tiger census madhya pradesh', 'highest number of tigers'], { mp: true, fallback: { subject: 'Environment', topic: 'Protected areas', subtopic: 'Tiger reserves' } }),
  rule('env-mp-birds', 'Environment', 'Wildlife of Madhya Pradesh', 'Birds of Madhya Pradesh', 3, ['birds in madhya pradesh', 'migratory birds mp', 'sarus crane', 'saras', 'gharusar', 'मध्य प्रदेश के पक्षी', 'bird migration madhya pradesh', 'ghadigaon', 'sailana bird sanctuary'], { mp: true, fallback: { subject: 'Environment', topic: 'Protected areas', subtopic: 'Bird sanctuaries' } }),
  rule('env-mp-parks', 'Environment', 'Wildlife of Madhya Pradesh', 'National parks', 3.6, [
    'kanha', 'कान्हा', 'bandhavgarh', 'बांधवगढ़', 'pench', 'पेंच', 'satpura national park', 'van vihar', 'वन विहार', 'madhav national park', 'fossil national park', 'dinosaur park mandla', 'national park in madhya pradesh', 'मध्य प्रदेश के राष्ट्रीय उद्यान',
  ], { mp: true, fallback: { subject: 'Environment', topic: 'Protected areas', subtopic: 'National parks' } }),
  rule('env-mp-sanctuaries', 'Environment', 'Wildlife of Madhya Pradesh', 'Wildlife sanctuaries', 3.6, [
    'ghana', 'केवलादेव', 'ghana sanctuary', 'gandhi sagar sanctuary', 'kuno', 'कूनो', 'orchha sanctuary', 'nauradehi', 'panpatha', 'ratanmahal', 'bhora deer park', 'ken gharial sanctuary', 'wildlife sanctuary in madhya pradesh', 'मध्य प्रदेश के अभयारण्य',
  ], { mp: true, fallback: { subject: 'Environment', topic: 'Protected areas', subtopic: 'Wildlife sanctuaries' } }),
  rule('env-mp-biosphere', 'Environment', 'Wildlife of Madhya Pradesh', 'Biosphere reserves', 3.2, ['panchmarhi biosphere', 'अमरकंटक बायोस्फीयर', 'amarkantak biosphere', 'biosphere reserve in madhya pradesh', 'मध्य प्रदेश का जीवमंडल'], { mp: true, fallback: { subject: 'Environment', topic: 'Protected areas', subtopic: 'Biosphere reserves' } }),
  rule('env-mp-crocodile', 'Environment', 'Wildlife of Madhya Pradesh', 'Crocodile and gharial conservation', 2.8, ['gharial sanctuary', 'crocodile sanctuary', 'gharial conservation', 'मगर संरक्षण', 'ken gharial'], { mp: true, fallback: { subject: 'Environment', topic: 'Protected areas', subtopic: 'Wildlife sanctuaries' } }),

  rule('env-mp-forest-types', 'Environment', 'Forests of Madhya Pradesh', 'Forest types', 3.2, ['forest types in madhya pradesh', 'tropical dry deciduous mp', 'teak forest', 'sal forest mp', 'सागौन', 'साल वन', 'वन प्रकार'], { mp: true }),
  rule('env-mp-forest-cover', 'Environment', 'Forests of Madhya Pradesh', 'Forest cover', 3.2, ['forest cover of madhya pradesh', 'forest area mp', 'maximum forest cover district', 'forest area percentage mp', 'वन क्षेत्र', 'isfr report madhya pradesh'], { mp: true }),
  rule('env-mp-forest-produce', 'Environment', 'Forests of Madhya Pradesh', 'Minor forest produce', 2.8, ['minor forest produce', 'tendu leaf', 'tendu patta', 'महुआ', 'mahua', 'vanvasi', 'minor forest produce mp', 'वनोपज'], { mp: true }),
  rule('env-mp-jfm', 'Environment', 'Forests of Madhya Pradesh', 'Joint forest management', 2.6, ['joint forest management', 'van samrakshan samiti', 'forest protection committee', 'संयुक्त वन प्रबंधन'], { mp: true }),
  rule('env-mp-forest-institute', 'Environment', 'Forests of Madhya Pradesh', 'Forest research institutes', 2.6, ['tropical forest research institute jabalpur', 'forest research institute jabalpur', 'vaniki research', 'वन अनुसंधान संस्थान'], { mp: true }),

  rule('env-greenhouse', 'Environment', 'Pollution and climate change', 'Greenhouse gases', 3.2, ['greenhouse gas', 'carbon dioxide', 'methane', 'nitrous oxide', 'greenhouse effect', 'global warming potential', 'ग्रीनहाउस']),
  rule('env-global-warming', 'Environment', 'Pollution and climate change', 'Global warming', 3, ['global warming', 'climate change', 'kyoto protocol', 'paris agreement', 'cop summit', 'unfccc', 'climate change conference', 'जलवायु परिवर्तन']),
  rule('env-ozone', 'Environment', 'Pollution and climate change', 'Ozone depletion', 3, ['ozone layer', 'ozone depletion', 'montreal protocol', 'chlorofluorocarbon', 'cfc', 'ozone hole', 'vienna convention', 'ओज़ोन', 'ozone']),
  rule('env-air-pollution', 'Environment', 'Pollution and climate change', 'Air pollution', 3, ['air pollution', 'particulate matter', 'pm 2 5', 'smog', 'acid rain', 'national clean air programme', 'वायु प्रदूषण', 'aqi', 'bhopal gas tragedy', 'भोपाल गैस त्रासदी', 'methyl isocyanate', 'union carbide', 'gas leak']),
  rule('env-water-pollution', 'Environment', 'Pollution and climate change', 'Water pollution', 3, ['water pollution', 'bod', 'biochemical oxygen demand', 'eutrophication', 'sewage treatment', 'namami gange', 'जल प्रदूषण']),
  rule('env-waste', 'Environment', 'Pollution and climate change', 'Solid waste management', 2.8, ['solid waste management', 'biomedical waste', 'plastic waste', 'swachh bharat', 'e waste', 'ठोस अपशिष्ट', 'vermicompost', 'landfill']),
  rule('env-noise', 'Environment', 'Pollution and climate change', 'Noise pollution', 2.4, ['noise pollution', 'decibel limit', 'ambient noise standard', 'ध्वनि प्रदूषण']),

  rule('env-wpa', 'Environment', 'Environmental laws and institutions', 'Wildlife Protection Act', 3.2, ['wildlife protection act', 'wildlife protection act 1972', 'schedule of wildlife protection act', 'वन्यजीव संरक्षण अधिनियम']),
  rule('env-epa', 'Environment', 'Environmental laws and institutions', 'Environment Protection Act', 3, ['environment protection act', 'environment protection act 1986', 'पर्यावरण संरक्षण अधिनियम']),
  rule('env-ngt', 'Environment', 'Environmental laws and institutions', 'National Green Tribunal', 3, ['national green tribunal', 'ngt', 'राष्ट्रीय हरित अधिकरण']),
  rule('env-fra', 'Environment', 'Environmental laws and institutions', 'Forest Rights Act', 2.8, ['forest rights act', 'forest rights act 2006', 'van adhikar', 'वन अधिकार अधिनियम']),
  rule('env-cpcb', 'Environment', 'Environmental laws and institutions', 'Central Pollution Control Board', 2.6, ['central pollution control board', 'state pollution control board', 'pollution control board', 'प्रदूषण नियंत्रण बोर्ड']),
  rule('env-water-air-act', 'Environment', 'Environmental laws and institutions', 'Air and Water Acts', 2.6, ['water act 1974', 'air act 1981', 'water prevention and control of pollution', 'air prevention and control of pollution']),

  rule('env-project-tiger', 'Environment', 'Conservation initiatives', 'Project Tiger', 3.2, ['project tiger', 'बाघ परियोजना', 'tiger conservation project']),
  rule('env-project-elephant', 'Environment', 'Conservation initiatives', 'Project Elephant', 3, ['project elephant', 'elephant reserve', 'हाथी परियोजना']),
  rule('env-ramsar-conv', 'Environment', 'Conservation initiatives', 'Ramsar Convention', 2.8, ['ramsar convention', 'wetland convention', 'रामसर सम्मेलन']),
  rule('env-iucn', 'Environment', 'Conservation initiatives', 'IUCN Red List', 3, ['iucn', 'international union for conservation', 'red list category', 'iucn headquarters']),
  rule('env-cbd', 'Environment', 'Conservation initiatives', 'Convention on Biological Diversity', 2.8, ['convention on biological diversity', 'cartagena protocol', 'nagoya protocol', 'aichi target', 'kunming montreal']),
  rule('env-cites', 'Environment', 'Conservation initiatives', 'CITES', 3, ['cites', 'convention on international trade in endangered species', 'वाशिंगटन संधि']),
  rule('env-montreal', 'Environment', 'Conservation initiatives', 'Montreal Protocol', 2.8, ['montreal protocol', 'kigali amendment', 'मॉन्ट्रियल प्रोटोकॉल']),
  rule('env-paris', 'Environment', 'Conservation initiatives', 'Paris Agreement', 2.8, ['paris agreement', 'nationally determined contribution', 'ndc', 'net zero target', 'पेरिस समझौता']),

  /* ------------------------------------------------------------ Economy -- */
  rule('eco-planning', 'Economy', 'Indian Economy', 'Planning in India', 2.8, ['five year plan', 'planning commission', 'niti aayog plan', 'harrod domar', 'mahalanobis model', 'पंचवर्षीय योजना']),
  rule('eco-niti', 'Economy', 'Indian Economy', 'NITI Aayog', 2.8, ['niti aayog', 'sustainable development goals india index', 'composite water management index', 'नीति आयोग रिपोर्ट']),
  rule('eco-national-income', 'Economy', 'Indian Economy', 'National income', 3, ['national income', 'per capita income', 'csso', 'national statistical office', 'राष्ट्रीय आय', 'nso estimate']),
  rule('eco-gdp', 'Economy', 'Indian Economy', 'GDP and GNP', 3.2, ['gdp', 'gross domestic product', 'gnp', 'gross national product', 'ndp', 'nominal and real gdp', 'जीडीपी', 'सकल घरेलू उत्पाद']),
  rule('eco-inflation', 'Economy', 'Indian Economy', 'Inflation', 3.2, ['inflation', 'wpi', 'cpi', 'consumer price index', 'wholesale price index', 'demand pull inflation', 'cost push inflation', 'मुद्रास्फीति', 'महंगाई']),
  rule('eco-reforms', 'Economy', 'Indian Economy', 'Economic reforms of 1991', 3, ['economic reforms 1991', 'liberalisation', 'privatisation', 'globalisation', 'lpg reforms', 'new economic policy 1991', 'आर्थिक सुधार']),
  rule('eco-psu', 'Economy', 'Indian Economy', 'Public sector undertakings', 2.8, ['public sector undertaking', 'maharatna', 'navratna', 'miniratna', 'disinvestment', 'privatisation of psu', 'सार्वजनिक क्षेत्र']),

  rule('eco-rbi', 'Economy', 'Banking and finance', 'Reserve Bank of India', 3.4, ['reserve bank of india', 'rbi', 'repo rate', 'reverse repo', 'cash reserve ratio', 'crr', 'statutory liquidity ratio', 'slr', 'bank rate', 'hilton young commission', 'रिज़र्व बैंक']),
  rule('eco-monetary', 'Economy', 'Banking and finance', 'Monetary policy', 3, ['monetary policy', 'monetary policy committee', 'open market operation', 'liquidity adjustment facility', 'money supply', 'मुद्रा नीति']),
  rule('eco-banks', 'Economy', 'Banking and finance', 'Commercial banks', 2.8, ['nationalisation of banks', 'scheduled commercial bank', 'regional rural bank', 'public sector bank', 'nationalised bank', 'बैंक राष्ट्रीयकरण']),
  rule('eco-nabard', 'Economy', 'Banking and finance', 'NABARD and SIDBI', 3, ['nabard', 'sidbi', 'agricultural refinance', 'नाबार्ड']),
  rule('eco-sebi', 'Economy', 'Banking and finance', 'SEBI and capital markets', 3, ['sebi', 'securities and exchange board', 'bse', 'nse', 'stock exchange', 'primary market', 'secondary market', 'share market', 'सेबी']),
  rule('eco-nbfc', 'Economy', 'Banking and finance', 'Non-banking finance companies', 2.6, ['non banking finance company', 'nbfc', 'non banking financial company', 'माइक्रो फाइनेंस']),
  rule('eco-shg', 'Economy', 'Banking and finance', 'Self help groups', 2.6, ['self help group', 'shg bank linkage', 'स्वयं सहायता समूह', 'microcredit']),
  rule('eco-inclusion', 'Economy', 'Banking and finance', 'Financial inclusion', 2.8, ['financial inclusion', 'pradhan mantri jan dhan yojana', 'jan dhan', 'jan dhan yojana', 'financial inclusion index', 'वित्तीय समावेशन']),

  rule('eco-union-budget', 'Economy', 'Budget and taxation', 'Union Budget', 3, ['union budget', 'annual financial statement', 'article 112 budget', 'budget 2024', 'fiscal year budget', 'केंद्रीय बजट']),
  rule('eco-fiscal', 'Economy', 'Budget and taxation', 'Fiscal policy', 2.8, ['fiscal policy', 'fiscal federalism', 'expansionary fiscal', 'राजकोषीय नीति']),
  rule('eco-deficit', 'Economy', 'Budget and taxation', 'Fiscal deficit', 3.2, ['fiscal deficit', 'revenue deficit', 'primary deficit', 'fiscal responsibility and budget management', 'frbm', 'राजकोषीय घाटा']),
  rule('eco-direct-tax', 'Economy', 'Budget and taxation', 'Direct taxes', 2.8, ['income tax', 'corporate tax', 'capital gains tax', 'direct tax', 'income tax slab', 'आयकर']),
  rule('eco-indirect-tax', 'Economy', 'Budget and taxation', 'Indirect taxes', 2.8, ['indirect tax', 'customs duty', 'excise duty', 'gst revenue', 'अप्रत्यक्ष कर']),
  rule('eco-gst', 'Economy', 'Budget and taxation', 'Goods and Services Tax', 3.2, ['gst', 'goods and services tax', 'gst slabs', 'gst compensation cess', 'ई वे बिल', 'e way bill', 'वस्तु एवं सेवा कर']),

  rule('eco-cropping', 'Economy', 'Agriculture and rural economy', 'Cropping patterns', 2.6, ['cropping pattern', 'crop intensity', 'mixed cropping', 'फसल चक्र', 'dryland farming']),
  rule('eco-green-revolution', 'Economy', 'Agriculture and rural economy', 'Green Revolution', 3, ['green revolution', 'high yielding variety', 'm s swaminathan', 'harappan wheat', 'evergreen revolution', 'हरित क्रांति']),
  rule('eco-msp', 'Economy', 'Agriculture and rural economy', 'Minimum support price', 3.2, ['minimum support price', 'msp', 'commission for agricultural costs and prices', 'cACP', 'न्यूनतम समर्थन मूल्य']),
  rule('eco-irrigation', 'Economy', 'Agriculture and rural economy', 'Irrigation', 2.8, ['irrigation', 'canal irrigation', 'drip irrigation', 'sprinkler irrigation', 'per drop more crop', 'सिंचाई']),
  rule('eco-rural-employment', 'Economy', 'Agriculture and rural economy', 'Rural employment programmes', 3, ['mgnrega', 'mahatma gandhi national rural employment', 'rural employment guarantee', 'मनरेगा']),
  rule('eco-agri-credit', 'Economy', 'Agriculture and rural economy', 'Agricultural credit and insurance', 2.6, ['kisan credit card', 'pm fasal bima yojana', 'crop insurance', 'kcc', 'फसल बीमा', 'किसान क्रेडिट']),
  rule('eco-food-processing', 'Economy', 'Agriculture and rural economy', 'Food processing', 2.6, ['food processing industry', 'operation greens', 'food corporation of india', 'fci', 'खाद्य प्रसंस्करण']),

  rule('eco-industrial-policy', 'Economy', 'Industry and infrastructure', 'Industrial policy', 2.8, ['industrial policy resolution', 'industrial policy 1991', 'make in india', 'plI scheme', 'production linked incentive', 'औद्योगिक नीति']),
  rule('eco-core-industries', 'Economy', 'Industry and infrastructure', 'Core industries', 2.8, ['core industries', 'index of industrial production', 'eight core industries', 'iip index', 'औद्योगिक उत्पादन सूचकांक']),
  rule('eco-energy-sector', 'Economy', 'Industry and infrastructure', 'Energy sector', 2.8, ['power generation capacity', 'thermal power plant', 'solar power capacity', 'installed capacity', 'udyog power', 'विद्युत उत्पादन']),
  rule('eco-msme', 'Economy', 'Industry and infrastructure', 'Micro small and medium enterprises', 2.6, ['msme', 'micro small and medium enterprise', 'udyog aadhaar', 'सूक्ष्म लघु और मध्यम उद्यम']),
  rule('eco-sez', 'Economy', 'Industry and infrastructure', 'Special Economic Zones', 2.6, ['special economic zone', 'sez act', 'export processing zone', 'विशेष आर्थिक क्षेत्र']),

  rule('eco-poverty', 'Economy', 'Poverty and human development', 'Poverty estimation', 3, ['poverty line', 'poverty estimation', 'tendulkar committee', 'rangarajan committee', 'alagh committee', 'below poverty line', 'गरीबी रेखा']),
  rule('eco-unemployment', 'Economy', 'Poverty and human development', 'Unemployment', 3, ['unemployment rate', 'labour force participation', 'periodic labour force survey', 'disguised unemployment', 'structural unemployment', 'बेरोजगारी']),
  rule('eco-inequality', 'Economy', 'Poverty and human development', 'Inequality indices', 2.8, ['gini coefficient', 'lorenz curve', 'income inequality', '基尼', 'gini index']),
  rule('eco-hdi', 'Economy', 'Poverty and human development', 'Human Development Index', 3.2, ['human development index', 'hdi', 'human development report', 'multidimensional poverty index', 'मानव विकास सूचकांक']),
  rule('eco-sdg', 'Economy', 'Poverty and human development', 'Sustainable Development Goals', 3, ['sustainable development goal', 'sdg', 'agenda 2030', 'सतत विकास लक्ष्य']),

  rule('eco-wto', 'Economy', 'International economy', 'World Trade Organization', 3.2, ['world trade organization', 'wto', 'doha round', 'most favoured nation', 'trips', 'विश्व व्यापार संगठन']),
  rule('eco-imf', 'Economy', 'International economy', 'International Monetary Fund', 3.2, ['international monetary fund', 'imf', 'bretton woods', 'special drawing rights', 'विश्व बैंक समूह', 'अंतर्राष्ट्रीय मुद्रा कोष']),
  rule('eco-worldbank', 'Economy', 'International economy', 'World Bank Group', 3, ['world bank', 'ibrd', 'ida', 'ifc', 'multilateral investment guarantee agency', 'विश्व बैंक']),
  rule('eco-bop', 'Economy', 'International economy', 'Balance of payments', 3, ['balance of payments', 'current account deficit', 'capital account', 'trade deficit', 'भुगतान संतुलन']),
  rule('eco-forex', 'Economy', 'International economy', 'Foreign exchange reserves', 3, ['foreign exchange reserve', 'forex reserve', 'विदेशी मुद्रा भंडार']),
  rule('eco-fdi', 'Economy', 'International economy', 'Foreign direct investment', 2.8, ['foreign direct investment', 'fdi policy', 'fdi cap', 'fdi in india', 'प्रत्यक्ष विदेशी निवेश']),

  rule('eco-mp-budget', 'Economy', 'Economy of Madhya Pradesh', 'Madhya Pradesh Budget', 3.2, ['madhya pradesh budget', 'mp budget', 'state budget of mp', 'मध्य प्रदेश का बजट', 'मध्य प्रदेश बजट'], { mp: true }),
  rule('eco-mp-agri', 'Economy', 'Economy of Madhya Pradesh', 'Agriculture of Madhya Pradesh', 3, ['agriculture of madhya pradesh', 'largest producer state', 'top producer in india of', 'मध्य प्रदेश का कृषि उत्पादन', 'soybean production state', 'wheat production state'], { mp: true }),
  rule('eco-mp-industry', 'Economy', 'Economy of Madhya Pradesh', 'Industry of Madhya Pradesh', 2.8, ['industry in madhya pradesh', 'industrial park mp', 'invest mp', 'उद्योग मध्य प्रदेश', 'pithampur', 'पीथमपुर', 'malanpur', 'meghanagar'], { mp: true }),
  rule('eco-mp-minerals', 'Economy', 'Economy of Madhya Pradesh', 'Minerals of Madhya Pradesh', 3.2, ['minerals of madhya pradesh', 'diamond mine panna', 'copper mine malanjkhand', 'मलानजखंड', 'panna diamond', 'मध्य प्रदेश के खनिज', 'leading producer of mineral', 'हीरा', 'खान', 'खनिज', 'mineral', 'diamond', 'copper', 'dolomite'], { mp: true }),
  rule('eco-mp-irrigation', 'Economy', 'Economy of Madhya Pradesh', 'Irrigation projects of Madhya Pradesh', 3, ['irrigation project of madhya pradesh', 'irrigated area mp', 'सिंचाई परियोजना', 'micro irrigation mp', 'irrigation potential mp'], { mp: true }),
  rule('eco-mp-schemes', 'Economy', 'Economy of Madhya Pradesh', 'State welfare schemes', 3, ['madhya pradesh scheme', 'mp government scheme', 'state scheme launched', 'मध्य प्रदेश योजना', 'मुख्यमंत्री योजना', 'state welfare scheme'], { mp: true }),
  rule('eco-mp-fiscal', 'Economy', 'Economy of Madhya Pradesh', 'State fiscal indicators', 2.8, ['per capita income of madhya pradesh', 'gdp of madhya pradesh', 'gsdp of mp', 'मध्य प्रदेश की प्रति व्यक्ति आय'], { mp: true }),

  /* ------------------------------------------- Science and Technology -- */
  rule('sci-units', 'Science and Technology', 'Physics', 'Units and measurements', 2.8, ['si unit', 'unit of measurement', 'newton unit', 'joule', 'watt unit', 'pascal', 'light year', 'parsecs', 'मात्रक', 'इकाई']),
  rule('sci-motion', 'Science and Technology', 'Physics', 'Motion and force', 2.8, ['newton law', 'laws of motion', 'inertia', 'momentum', 'friction', 'gravitational force', 'न्यूटन', 'बल और गति']),
  rule('sci-work-energy', 'Science and Technology', 'Physics', 'Work energy and power', 2.6, ['kinetic energy', 'potential energy', 'law of conservation of energy', 'work done', 'power unit', 'ऊर्जा संरक्षण']),
  rule('sci-gravitation', 'Science and Technology', 'Physics', 'Gravitation', 2.6, ['gravitation', 'escape velocity', 'gravity of earth', 'weightlessness', 'g value', 'गुरुत्वाकर्षण']),
  rule('sci-sound', 'Science and Technology', 'Physics', 'Sound', 2.8, ['sound wave', 'speed of sound', 'sonar', 'doppler effect', 'ultrasonic', 'infrasound', 'reverberation', 'ध्वनि']),
  rule('sci-optics', 'Science and Technology', 'Physics', 'Light and optics', 3, ['lens', 'mirror image', 'refraction', 'reflection of light', 'total internal reflection', 'dispersion of light', 'optical fibre', 'rainbow formation', 'प्रकाश', 'myopia', 'hypermetropia', 'प्रिज़्म']),
  rule('sci-heat', 'Science and Technology', 'Physics', 'Heat and thermodynamics', 2.8, ['conduction of heat', 'convection', 'radiation of heat', 'specific heat', 'latent heat', 'thermometer', 'ऊष्मा', 'thermodynamics', 'calorific value', 'ऊष्मा मान', 'fuel value']),
  rule('sci-electricity', 'Science and Technology', 'Physics', 'Electricity and magnetism', 3, ['electric current', 'ohm law', 'resistance of wire', 'transformer', 'electromagnet', 'faraday', 'ampere', 'voltmeter', 'विद्युत धारा', 'चुंबक']),
  rule('sci-modern-physics', 'Science and Technology', 'Physics', 'Modern physics', 2.6, ['photoelectric effect', 'radioactivity', 'isotope', 'nuclear fission', 'nuclear fusion', 'x ray', 'laser', 'semiconductor', 'alpha beta gamma']),

  rule('sci-atomic', 'Science and Technology', 'Chemistry', 'Atomic structure', 2.8, ['atomic number', 'mass number', 'isotope', 'electron configuration', 'valence electron', 'bohr model', 'परमाणु संख्या']),
  rule('sci-periodic', 'Science and Technology', 'Chemistry', 'Periodic table', 2.8, ['periodic table', 'group and period', 'modern periodic law', 'moseley', 'atomic radius trend', 'आधुनिक आवर्त सारणी']),
  rule('sci-acid-base', 'Science and Technology', 'Chemistry', 'Acids bases and salts', 3, ['ph value', 'acid and base', 'indicator litmus', 'neutralisation', 'buffer solution', 'अम्ल और क्षार']),
  rule('sci-metals', 'Science and Technology', 'Chemistry', 'Metals and non-metals', 2.6, ['alloy', 'bronze', 'brass', 'galvanisation', 'rusting of iron', 'amalgam', 'धातु', 'मिश्रधातु']),
  rule('sci-carbon', 'Science and Technology', 'Chemistry', 'Carbon compounds', 2.6, ['organic compound', 'hydrocarbon', 'ethanol', 'methane', 'polymer', 'plastic polymer', 'detergent chemistry', 'कार्बनिक यौगिक']),
  rule('sci-reactions', 'Science and Technology', 'Chemistry', 'Chemical reactions', 2.6, ['oxidation reaction', 'reduction reaction', 'catalyst', 'chemical equation balancing', 'exothermic reaction', 'रासायनिक अभिक्रिया']),
  rule('sci-everyday-chem', 'Science and Technology', 'Chemistry', 'Chemistry in everyday life', 2.8, ['bleaching powder', 'baking soda', 'washing soda', 'plaster of paris', 'glass manufacturing', 'cement chemistry', 'soap and detergent', 'preservative', 'रसायन']),

  rule('bio-cell', 'Science and Technology', 'Biology', 'Cell biology', 3, ['cell organelle', 'mitochondria', 'ribosome', 'golgi body', 'cell membrane', 'nucleus of cell', 'powerhouse of the cell', 'कोशिका']),
  rule('bio-digestive', 'Science and Technology', 'Biology', 'Human digestive system', 2.8, ['digestive system', 'digestive enzyme', 'pepsin', 'bile', 'liver function', 'small intestine', 'पाचन तंत्र']),
  rule('bio-respiratory', 'Science and Technology', 'Biology', 'Human respiratory system', 2.8, ['respiratory system', 'alveoli', 'diaphragm', 'gas exchange in lungs', 'श्वसन तंत्र']),
  rule('bio-circulatory', 'Science and Technology', 'Biology', 'Human circulatory system', 2.8, ['heart chamber', 'blood group', 'haemoglobin', 'blood pressure', 'rbc wbc', 'platelet', 'रक्त', 'हृदय']),
  rule('bio-nervous', 'Science and Technology', 'Biology', 'Human nervous system', 2.8, ['neuron', 'nerve impulse', 'brain part', 'cerebrum', 'cerebellum', 'reflex action', 'तंत्रिका तंत्र']),
  rule('bio-skeletal', 'Science and Technology', 'Biology', 'Human skeletal system', 2.6, ['bone count', 'skeletal system', 'joint types', 'cartilage', 'hinge joint', 'कंकाल तंत्र']),
  rule('bio-nutrition', 'Science and Technology', 'Biology', 'Nutrition and vitamins', 3.2, ['vitamin', 'deficiency disease', 'scurvy', 'rickets', 'beriberi', 'night blindness', 'protein deficiency', 'kwashiorkor', 'vitamin c', 'vitamin d', 'विटामिन', 'पोषण']),
  rule('bio-genetics', 'Science and Technology', 'Biology', 'Genetics', 3, ['gene', 'dna', 'rna', 'chromosome', 'mendel', 'heredity', 'genetic disorder', 'आनुवंशिकी', 'genome']),
  rule('bio-plant', 'Science and Technology', 'Biology', 'Plant physiology', 2.8, ['xylem', 'phloem', 'transpiration', 'plant hormone', 'auxin', 'stomata', 'plant tissue', 'पादप']),
  rule('bio-photosynthesis', 'Science and Technology', 'Biology', 'Photosynthesis', 3, ['photosynthesis', 'chlorophyll', 'light reaction', 'dark reaction', 'calvin cycle', 'प्रकाश संश्लेषण']),
  rule('bio-hormones', 'Science and Technology', 'Biology', 'Hormones and glands', 3, ['endocrine gland', 'hormone', 'insulin', 'thyroid', 'pituitary', 'adrenaline', 'ग्रंथि', 'हार्मोन']),

  rule('bio-communicable', 'Science and Technology', 'Health and diseases', 'Communicable diseases', 3.2, ['malaria', 'dengue', 'tuberculosis', 'cholera', 'typhoid', 'leptospirosis', 'chikungunya', 'viral disease', 'bacterial disease', 'मलेरिया', 'डेंगू', 'क्षय रोग', 'communicable disease']),
  rule('bio-noncommunicable', 'Science and Technology', 'Health and diseases', 'Non-communicable diseases', 2.8, ['diabetes', 'hypertension', 'cancer', 'cardiovascular disease', 'non communicable disease', 'मधुमेह'], { notWith: ['tropic of cancer'] }),
  rule('bio-vaccination', 'Science and Technology', 'Health and diseases', 'Vaccination', 3, ['vaccine', 'vaccination', 'immunisation', 'indemnity', 'universal immunisation programme', 'टीकाकरण', 'vaccine development']),
  rule('bio-epidemic', 'Science and Technology', 'Health and diseases', 'Epidemics and pandemics', 3, ['epidemic', 'pandemic', 'outbreak', 'who declaration', 'महामारी']),
  rule('bio-vector', 'Science and Technology', 'Health and diseases', 'Vector borne diseases', 2.8, ['vector borne disease', 'aedes mosquito', 'anopheles', 'sandfly', 'kala azar', 'जंतुवाहित रोग']),
  rule('bio-health-programme', 'Science and Technology', 'Health and diseases', 'Public health programmes', 2.8, ['national health mission', 'ayushman bharat', 'pulse polio', 'indradhanush mission', 'जन स्वास्थ्य']),

  rule('tech-space', 'Science and Technology', 'Science and technology developments', 'Space programme', 3.2, ['space programme', 'launch vehicle', 'pslv', 'gslv', 'lvm3', 'chandrayaan', 'mangalyaan', 'aditya l1', 'gaganyaan', 'अंतरिक्ष']),
  rule('tech-isro', 'Science and Technology', 'Science and technology developments', 'ISRO missions', 3.2, ['isro', 'indian space research organisation', 'satellite launch', 'सतीश धवन', 'श्रीहरिकोटा', 'isro centre']),
  rule('tech-defence', 'Science and Technology', 'Science and technology developments', 'Defence technology', 3, ['drdo', 'defence research', 'fighter aircraft', 'aircraft carrier', 'submarine', 'radar system', 'रक्षा अनुसंधान']),
  rule('tech-missiles', 'Science and Technology', 'Science and technology developments', 'Missiles', 3, ['ballistic missile', 'cruise missile', 'agni missile', 'prithvi missile', 'brahmos', 'akash missile', 'नाग मिसाइल']),
  rule('tech-nuclear', 'Science and Technology', 'Science and technology developments', 'Nuclear technology', 3, ['nuclear reactor', 'uranium enrichment', 'bhabha atomic research', 'nuclear power corporation', 'परमाणु ऊर्जा', 'fast breeder reactor']),
  rule('tech-biotech', 'Science and Technology', 'Science and technology developments', 'Biotechnology', 2.8, ['biotechnology', 'genetic engineering', 'crispr', 'gene editing', 'gm crop', 'cloning', 'जैव प्रौद्योगिकी']),
  rule('tech-it', 'Science and Technology', 'Science and technology developments', 'Information technology', 2.8, ['artificial intelligence', 'blockchain', 'cloud computing', 'internet protocol', 'quantum computing', 'cyber security', 'सूचना प्रौद्योगिकी', 'digital india']),
  rule('tech-nano', 'Science and Technology', 'Science and technology developments', 'Nanotechnology', 2.6, ['nanotechnology', 'nanomaterial', 'nanoparticle', 'नैनो प्रौद्योगिकी']),
  rule('tech-institutes', 'Science and Technology', 'Science and technology developments', 'Research institutes', 2.6, ['csir laboratory', 'icmr institute', 'iit', 'research institute headquarters', 'अनुसंधान संस्थान']),

  rule('bio-excretory', 'Science and Technology', 'Biology', 'Human excretory system', 3, ['excretory system', 'kidney', 'nephron', 'ureter', 'urethra', 'urine formation', 'dialysis', 'उत्सर्जन तंत्र', 'गुर्दा']),
  rule('geo-india-lakes', 'Geography', 'Geography of India', 'Lakes and wetlands', 3, ['lake', 'झील', 'loktak', 'wular', 'chilika', 'dal lake', 'sambhar', 'pulicat', 'vembanad', 'wetland of india', 'lagoon']),
  rule('eco-revolutions', 'Economy', 'Agriculture and rural economy', 'Agricultural revolutions', 3.2, ['white revolution', 'blue revolution', 'yellow revolution', 'green revolution', 'operation flood', 'verghese kurien', 'm s swaminathan', 'श्वेत क्रांति', 'नीली क्रांति', 'हरित क्रांति', 'नार्मन बोरलॉग']),

  /* --------------------------------------------------- Art and Culture -- */
  rule('ac-festivals-india', 'Art and Culture', 'Festivals and fairs', 'Festivals of India', 3, ['festival of india', 'pongal', 'bihu', 'onam', 'chhath', 'navratri', 'diwali', 'eid', 'baisakhi', 'losar', 'त्योहार', 'पर्व']),
  rule('ac-mp-fairs', 'Art and Culture', 'Festivals and fairs', 'Fairs of Madhya Pradesh', 3.4, ['fair of madhya pradesh', 'मध्य प्रदेश का मेला', 'lok rang', 'tansen samaroh', 'tansen music festival', 'khajuraho dance festival', 'narmada jayanti', 'ग्वालियर मेला', 'उज्जैन मेला', 'malwa utsav', 'nimar utsav'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Festivals and fairs', subtopic: 'Festivals of India' } }),
  rule('ac-tribal-festivals', 'Art and Culture', 'Festivals and fairs', 'Tribal festivals', 3, ['tribal festival', 'bhagoria', 'भगोरिया', 'karma festival', 'करमा', 'sarhul', 'meghnath', 'tribal fair'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Festivals and fairs', subtopic: 'Tribal festivals' } }),
  rule('ac-simhastha', 'Art and Culture', 'Festivals and fairs', 'Simhastha', 3.4, ['simhastha', 'kumbh at ujjain', 'सिंहस्थ', 'ujjjain kumbh', 'kumbh parva'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Festivals and fairs', subtopic: 'Festivals of India' } }),
  rule('ac-harvest', 'Art and Culture', 'Festivals and fairs', 'Harvest festivals', 2.6, ['harvest festival', 'makar sankranti', 'pohela boishakh', 'वसंत पंचमी', 'fertility festival']),

  rule('ac-classical-dance', 'Art and Culture', 'Dance and music', 'Classical dances', 3, ['bharatanatyam', 'kathakali', 'kathak', 'odissi', 'manipuri', 'kuchipudi', 'mohiniyattam', 'sattriya', 'sangeet natak akademi', 'शास्त्रीय नृत्य']),
  rule('ac-mp-folk-dance', 'Art and Culture', 'Dance and music', 'Folk dances of Madhya Pradesh', 3.4, [
    'rai dance', 'matki dance', 'ghoomar mp', 'grida', 'saila dance', 'karma dance', 'lota dance', 'phag dance', 'bhagoria dance', 'माटी', 'ग्रीड़ा', 'सैला', 'लोटा नृत्य', 'folk dance of madhya pradesh', 'मध्य प्रदेश के लोक नृत्य',
  ], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Dance and music', subtopic: 'Classical dances' } }),
  rule('ac-classical-music', 'Art and Culture', 'Dance and music', 'Classical music', 2.8, ['hindustani music', 'carnatic music', 'raga', 'tala', 'gharana', 'khayal', 'dhrupad', 'thumri', 'शास्त्रीय संगीत']),
  rule('ac-instruments', 'Art and Culture', 'Dance and music', 'Musical instruments', 2.8, ['sitar', 'tabla', 'sarod', 'veena', 'flute bansuri', 'shehnai', 'mridangam', 'santoor', 'वाद्य यंत्र']),
  rule('ac-gharana', 'Art and Culture', 'Dance and music', 'Music gharanas', 3, ['gharana', 'gwalior gharana', 'maihar gharana', 'ग्वालियर घराना', 'मैहर घराना', 'music gharana'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Dance and music', subtopic: 'Classical music' } }),
  rule('ac-tansen', 'Art and Culture', 'Dance and music', 'Tansen and Maihar', 3.2, ['tansen', 'tansen samaroh', 'mian tansen', 'allauddin khan', 'maihar', 'तानसेन', 'मैहर', 'बाबा अलाउद्दीन खान'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Dance and music', subtopic: 'Music gharanas' } }),

  rule('ac-sanskrit-lit', 'Art and Culture', 'Literature and languages', 'Sanskrit literature', 2.8, ['sanskrit literature', 'kalidasa', 'bhasa', 'bhavabhuti', 'banabhatta', 'magha', 'संस्कृत साहित्य']),
  rule('ac-hindi-lit', 'Art and Culture', 'Literature and languages', 'Hindi literature', 3, ['hindi literature', 'premchand', 'maithili sharan gupt', 'harivansh rai bachchan', 'jnanpith award hindi', 'छायावाद', 'chhayavad', 'हिंदी साहित्य']),
  rule('ac-urdu-lit', 'Art and Culture', 'Literature and languages', 'Urdu and Persian literature', 2.6, ['urdu literature', 'persian literature', 'amir khusrau', 'ghalib', 'firduasi', 'उर्दू साहित्य']),
  rule('ac-mp-lit', 'Art and Culture', 'Literature and languages', 'Literature of Madhya Pradesh', 3.2, ['bhavabhuti', 'mahanand', 'subhadra kumari chauhan', 'makhanlal chaturvedi', 'श्यामाचरण दुबे', 'madhya pradesh writer', 'मध्य प्रदेश के साहित्यकार', 'bhopal literary', 'जानकी प्रसाद चतुर्वेदी'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Literature and languages', subtopic: 'Hindi literature' } }),
  rule('ac-books', 'Art and Culture', 'Literature and languages', 'Books and authors', 2.8, ['who wrote the book', 'author of the book', 'written by', 'पुस्तक के लेखक']),
  rule('ac-languages', 'Art and Culture', 'Literature and languages', 'Official languages', 2.8, ['official language', 'eighth schedule language', 'classical language status', 'राजभाषा', '22 scheduled languages']),

  rule('ac-cave-painting', 'Art and Culture', 'Paintings and sculpture', 'Cave paintings', 3, ['cave painting', 'bhimbetka painting', 'bagh cave painting', 'गुफा चित्रकला'], { subtopic: 'Cave paintings' }),
  rule('ac-miniature', 'Art and Culture', 'Paintings and sculpture', 'Miniature painting schools', 2.8, ['miniature painting', 'mewar school', 'marwar school', 'bundelkhand school painting', 'pahari school', 'लघुचित्र']),
  rule('ac-modern-painters', 'Art and Culture', 'Paintings and sculpture', 'Modern Indian painters', 2.6, ['raja ravi varma', 'amrita shergil', 'm f husain', 'abhindranath tagore painting', 'modern indian painter', 'आधुनिक चित्रकार']),
  rule('ac-sculpture', 'Art and Culture', 'Paintings and sculpture', 'Sculpture schools', 2.6, ['sculpture tradition', 'terracotta', 'bronze casting', 'lost wax technique', 'मूर्तिकला']),
  rule('ac-tribal-art', 'Art and Culture', 'Paintings and sculpture', 'Tribal art', 2.8, ['gond art', 'भरी गोंड चित्रकला', 'jhitu patnaik', 'jangarh singh shyam', 'tribal painting', 'pithora painting', 'जनजातीय चित्रकला'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Paintings and sculpture', subtopic: 'Tribal art' } }),
  rule('ac-handicrafts', 'Art and Culture', 'Paintings and sculpture', 'Handicrafts', 2.6, ['handicraft', 'chanderi saree', 'chanderi', 'महेश्वरी साड़ी', 'maheshwari saree', 'bamboo craft', 'dokra craft', 'hastashilp']),

  rule('ac-mp-temples', 'Art and Culture', 'Heritage Sites', 'Temples of Madhya Pradesh', 3.6, [
    'temple in madhya pradesh', 'bhojeshwar temple', 'chausath yogini', 'khajuraho temple', 'kandariya mahadev', 'omkareshwar temple', 'mahakaleshwar', 'श्री महाकाल', 'chausath yogini temple', 'मध्य प्रदेश के मंदिर', 'siddhanath temple', 'chaturbhuj temple orchha',
  ], { mp: true, fallback: { subject: 'History', topic: 'Art and architecture', subtopic: 'Temple architecture' } }),
  rule('ac-khajuraho', 'Art and Culture', 'Heritage Sites', 'Khajuraho group', 3.6, ['khajuraho', 'खजुराहो', 'kandariya mahadeva', 'lakshmana temple khajuraho', 'chandela temples'], { mp: true, fallback: { subject: 'History', topic: 'Art and architecture', subtopic: 'Temple architecture' } }),
  rule('ac-sanchi', 'Art and Culture', 'Heritage Sites', 'Sanchi', 3.6, ['sanchi', 'सांची', 'sanchi stupa', 'great stupa sanchi', 'sanchi torana'], { mp: true, fallback: { subject: 'History', topic: 'Art and architecture', subtopic: 'Cave and rock-cut architecture' } }),
  rule('ac-gwalior-fort', 'Art and Culture', 'Heritage Sites', 'Gwalior Fort', 3.2, ['gwalior fort', 'ग्वालियर का किला', 'man singh palace', 'gujari mahal', 'teli ka mandir', 'sas bahu temple'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Heritage Sites', subtopic: 'Forts and palaces' } }),
  rule('ac-jyotirlinga', 'Art and Culture', 'Heritage Sites', 'Jyotirlingas', 3.2, ['jyotirlinga', 'महाकालेश्वर', 'महाकाल', 'jyotirlinga in madhya pradesh', 'omkareshwar jyotirlinga', 'ज्योतिर्लिंग'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Heritage Sites', subtopic: 'Temples of Madhya Pradesh' } }),
  rule('ac-unesco-heritage', 'Art and Culture', 'Heritage Sites', 'UNESCO listings', 3, ['unesco world heritage', 'world heritage list', 'heritage site of india', 'विश्व धरोहर स्थल']),
  rule('ac-forts-palaces', 'Art and Culture', 'Heritage Sites', 'Forts and palaces', 2.8, ['fort of', 'palace of', 'jahaz mahal', 'raj mahal orchha', 'गढ़', 'महल']),
  rule('ac-buddhist-monuments', 'Art and Culture', 'Heritage Sites', 'Buddhist monuments', 2.8, ['buddhist monument', 'buddhist site', 'bodh gaya', 'sarnath stupa', 'buddhist circuit', 'बौद्ध स्मारक']),

  rule('ac-mp-folk-art', 'Art and Culture', 'Culture of Madhya Pradesh', 'Folk art of Madhya Pradesh', 3, ['folk art of madhya pradesh', 'मध्य प्रदेश की लोक कला', 'mandana', 'थरमन', 'tharman art', 'bhartiya lok kala'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Paintings and sculpture', subtopic: 'Tribal art' } }),
  rule('ac-mp-handicraft', 'Art and Culture', 'Culture of Madhya Pradesh', 'Handicrafts of Madhya Pradesh', 3, ['chanderi weaving', 'maheshwar handloom', 'gi toy craft', 'battoba craft', 'zari work mp', 'मध्य प्रदेश की हस्तशिल्प', 'handicraft of madhya pradesh'], { mp: true, fallback: { subject: 'Art and Culture', topic: 'Paintings and sculpture', subtopic: 'Handicrafts' } }),
  rule('ac-state-symbols', 'Art and Culture', 'Culture of Madhya Pradesh', 'State symbols', 3, ['state symbol of madhya pradesh', 'state heritage animal', 'मध्य प्रदेश के राज्य प्रतीक', 'state emblem of mp'], { mp: true }),
  rule('ac-cuisine-dress', 'Art and Culture', 'Culture of Madhya Pradesh', 'Cuisine and dress', 2.6, ['traditional dress of', 'traditional food of', 'tribal cuisine', 'पहनावा', 'व्यंजन']),
  rule('ac-mp-institutions', 'Art and Culture', 'Culture of Madhya Pradesh', 'Cultural institutions of Madhya Pradesh', 2.8, ['bharat bhavan', 'भारत भवन', 'rashtriya kalidasa academy', 'kavita kosh', 'urdu academy mp', 'मध्य प्रदेश की सांस्कृतिक संस्था'], { mp: true }),

  /* ------------------------------------------------ Madhya Pradesh Special */
  rule('mp-formation', 'Madhya Pradesh Special', 'Formation of Madhya Pradesh', 'State reorganisation', 3.4, [
    'formation of madhya pradesh', 'states reorganisation act 1956', 'madhya pradesh was formed', 'when was madhya pradesh formed', 'november 1 1956', 'मध्य प्रदेश का निर्माण', 'madhya pradesh diwas', 'मध्य प्रदेश दिवस',
  ], { mp: true }),
  rule('mp-cm', 'Madhya Pradesh Special', 'Formation of Madhya Pradesh', 'Chief Ministers', 3.6, [
    'chief minister of madhya pradesh', 'first chief minister of mp', 'longest serving chief minister', 'मुख्यमंत्री मध्य प्रदेश', 'मुख्यमंत्री', 'cm of mp', 'who was the chief minister', 'प्रथम मुख्यमंत्री',
  ], { mp: true }),
  rule('mp-governors', 'Madhya Pradesh Special', 'Formation of Madhya Pradesh', 'Governors of Madhya Pradesh', 3.2, ['governor of madhya pradesh', 'first governor of mp', 'राज्यपाल मध्य प्रदेश', 'राज्यपाल'], { mp: true }),
  rule('mp-symbols', 'Madhya Pradesh Special', 'Formation of Madhya Pradesh', 'State symbols', 3.2, ['state emblem of madhya pradesh', 'state animal bird tree flower', 'राज्य पशु पक्षी', 'state song of madhya pradesh'], { mp: true }),
  rule('mp-capital', 'Madhya Pradesh Special', 'Formation of Madhya Pradesh', 'Capital of Madhya Pradesh', 3.2, ['capital of madhya pradesh', 'nagpur as capital', 'bhavan of madhya pradesh capital', 'bhopal became capital', 'मध्य प्रदेश की राजधानी', 'capital transfer'], { mp: true }),
  rule('mp-sr-act', 'Madhya Pradesh Special', 'Formation of Madhya Pradesh', 'States Reorganisation Act 1956', 3, ['states reorganisation commission', 'fazl ali commission', 'dhar commission', 'jvp committee', 'राज्य पुनर्गठन अधिनियम'], { mp: true }),

  rule('mp-bhil', 'Madhya Pradesh Special', 'Tribes of Madhya Pradesh', 'Bhil', 3.4, ['bhil tribe', 'bhilala', 'भील', 'bhil population', 'bhil district'], { mp: true }),
  rule('mp-gond', 'Madhya Pradesh Special', 'Tribes of Madhya Pradesh', 'Gond', 3.4, ['gond tribe', 'gondi', 'गोंड', 'gondwana', 'muria', 'maria gond', 'dhur gond'], { mp: true }),
  rule('mp-baiga', 'Madhya Pradesh Special', 'Tribes of Madhya Pradesh', 'Baiga', 3.4, ['baiga', 'बैगा', 'baiga chuk', 'baiga tribe'], { mp: true }),
  rule('mp-sahariya', 'Madhya Pradesh Special', 'Tribes of Madhya Pradesh', 'Sahariya', 3.4, ['sahariya', 'सहरिया', 'saharia tribe', 'sahariya primitive'], { mp: true }),
  rule('mp-korku', 'Madhya Pradesh Special', 'Tribes of Madhya Pradesh', 'Korku', 3.2, ['korku', 'कोरकू', 'korku tribe'], { mp: true }),
  rule('mp-other-tribes', 'Madhya Pradesh Special', 'Tribes of Madhya Pradesh', 'Kol and other tribes', 3, ['kol tribe', 'कोल', 'korku kol', 'halba tribe', 'kanwar', 'manjhi', 'panika', 'saur', 'मध्य प्रदेश की जनजातियां', 'tribes of madhya pradesh'], { mp: true }),
  rule('mp-pvtg', 'Madhya Pradesh Special', 'Tribes of Madhya Pradesh', 'Particularly vulnerable tribal groups', 3, ['particularly vulnerable tribal group', 'pvtg', 'primitive tribal group', 'अति संवेदनशील जनजाति'], { mp: true }),
  rule('mp-tribal-culture', 'Madhya Pradesh Special', 'Tribes of Madhya Pradesh', 'Tribal culture', 2.8, ['tribal culture of madhya pradesh', 'tribal dialect mp', 'ghotul', 'गोंडवाना संस्कृति', 'tribal museum bhopal', 'आदिवासी संग्रहालय'], { mp: true }),

  rule('mp-census-2011', 'Madhya Pradesh Special', 'Demography of Madhya Pradesh', 'Census 2011', 3.6, [
    'census 2011 madhya pradesh', 'census 2011 mp', 'जनगणना 2011', 'population 2011 mp', 'census of madhya pradesh',
  ], { mp: true }),
  rule('mp-census-data', 'Madhya Pradesh Special', 'Demography of Madhya Pradesh', 'Census data', 3, ['census data of madhya pradesh', 'decadal growth rate mp', 'जनगणना आंकड़े', 'census figure mp'], { mp: true }),
  rule('mp-density', 'Madhya Pradesh Special', 'Demography of Madhya Pradesh', 'Population density', 3.2, ['population density of madhya pradesh', 'जनसंख्या घनत्व', 'density per square km mp', 'highest density district'], { mp: true }),
  rule('mp-literacy', 'Madhya Pradesh Special', 'Demography of Madhya Pradesh', 'Literacy', 3.4, ['literacy rate of madhya pradesh', 'साक्षरता दर', 'literacy mp census', 'female literacy mp', 'male literacy mp'], { mp: true }),
  rule('mp-sex-ratio', 'Madhya Pradesh Special', 'Demography of Madhya Pradesh', 'Sex ratio', 3.4, ['sex ratio of madhya pradesh', 'लिंगानुपात', 'child sex ratio mp', 'sex ratio per 1000 mp'], { mp: true }),
  rule('mp-districts', 'Madhya Pradesh Special', 'Demography of Madhya Pradesh', 'Districts of Madhya Pradesh', 3.4, ['districts of madhya pradesh', 'number of districts in mp', 'largest district of madhya pradesh', 'smallest district mp', 'मध्य प्रदेश के जिले', 'district was carved out'], { mp: true }),
  rule('mp-urbanisation', 'Madhya Pradesh Special', 'Demography of Madhya Pradesh', 'Urbanisation in Madhya Pradesh', 2.8, ['urban population of madhya pradesh', 'urbanisation mp', 'नगरीय जनसंख्या'], { mp: true }),

  rule('mp-divisions', 'Madhya Pradesh Special', 'Administrative structure of Madhya Pradesh', 'Districts and divisions', 3.2, ['divisions of madhya pradesh', 'administrative division mp', 'संभाग', 'bhopal division', 'rewa division', 'jabalpur division', 'gwalior division'], { mp: true }),
  rule('mp-high-court', 'Madhya Pradesh Special', 'Administrative structure of Madhya Pradesh', 'High Court of Madhya Pradesh', 3.4, ['high court of madhya pradesh', 'jabalpur high court', 'indore bench', 'gwalior bench', 'मध्य प्रदेश उच्च न्यायालय'], { mp: true }),
  rule('mp-police', 'Madhya Pradesh Special', 'Administrative structure of Madhya Pradesh', 'Madhya Pradesh Police', 3, ['madhya pradesh police', 'mp police academy', 'मध्य प्रदेश पुलिस', 'police training school mp'], { mp: true }),
  rule('mp-local-bodies', 'Madhya Pradesh Special', 'Administrative structure of Madhya Pradesh', 'Local bodies in Madhya Pradesh', 3, ['nagar nigam in madhya pradesh', 'municipal corporation mp', 'नगर निगम मध्य प्रदेश', 'panchayat in mp'], { mp: true }),
  rule('mp-legislature', 'Madhya Pradesh Special', 'Administrative structure of Madhya Pradesh', 'Madhya Pradesh legislature', 3.2, ['madhya pradesh legislative assembly', 'vidhan sabha of mp', 'seats in madhya pradesh assembly', 'विधान सभा सीट', 'mp legislative council'], { mp: true }),

  rule('mp-welfare-schemes', 'Madhya Pradesh Special', 'Schemes and institutions of Madhya Pradesh', 'State welfare schemes', 3.4, ['madhya pradesh yojana', 'mp welfare scheme', 'मुख्यमंत्री जन कल्याण योजना', 'ladli laxmi', 'लड़ली लक्ष्मी', 'kanya vivah yojana mp', 'state scheme for women mp'], { mp: true }),
  rule('mp-education', 'Madhya Pradesh Special', 'Schemes and institutions of Madhya Pradesh', 'Educational institutions', 3, ['madhya pradesh board', 'mpbse', 'school education madhya pradesh', 'मध्य प्रदेश माध्यमिक शिक्षा मंडल', 'iit indore', 'iim indore', 'iiitm gwalior', ' Maulana azad national institute'], { mp: true }),
  rule('mp-universities', 'Madhya Pradesh Special', 'Schemes and institutions of Madhya Pradesh', 'Universities and research institutes', 3, ['university in madhya pradesh', 'barkatullah university', 'jijabai university', 'vikram university', 'devi ahilya vishwavidyalaya', 'makhanlal chaturvedi university', 'मध्य प्रदेश के विश्वविद्यालय'], { mp: true }),
  rule('mp-industry-initiatives', 'Madhya Pradesh Special', 'Schemes and institutions of Madhya Pradesh', 'Industrial and investment initiatives', 2.8, ['global investors summit mp', 'invest madhya pradesh', 'industrial policy of mp', 'mp investment summit'], { mp: true }),
  rule('mp-tourism', 'Madhya Pradesh Special', 'Schemes and institutions of Madhya Pradesh', 'Tourism of Madhya Pradesh', 3, ['tourism in madhya pradesh', 'mp tourism board', 'मध्य प्रदेश पर्यटन', 'heritage tourism mp', 'mp tourism policy'], { mp: true }),

  rule('mp-state-awards', 'Madhya Pradesh Special', 'Personalities and awards of Madhya Pradesh', 'State awards', 3, ['madhya pradesh award', 'shikhar samman', 'शिखर सम्मान', 'kalidas samman', 'कालिदास सम्मान', 'tansen samman', 'tulsidas samman', 'राष्ट्रीय कवि सम्मान', 'state honour of mp'], { mp: true }),
  rule('mp-personalities', 'Madhya Pradesh Special', 'Personalities and awards of Madhya Pradesh', 'Notable personalities', 2.8, ['born in madhya pradesh', 'from madhya pradesh', 'personality of mp', 'मध्य प्रदेश के व्यक्तित्व'], { mp: true }),
  rule('mp-sports', 'Madhya Pradesh Special', 'Personalities and awards of Madhya Pradesh', 'Sports from Madhya Pradesh', 2.8, ['stadium in madhya pradesh', 'khel pratiyogita mp', 'cricket association madhya pradesh', 'हॉकी मध्य प्रदेश', 'sports stadium mp', 'olympian from madhya pradesh'], { mp: true }),
  rule('mp-freedom-fighters', 'Madhya Pradesh Special', 'Personalities and awards of Madhya Pradesh', 'Freedom fighters of Madhya Pradesh', 3, ['freedom fighter of madhya pradesh', 'मध्य प्रदेश के स्वतंत्रता संग्राम सेनानी', 'chandra shekhar azad jabalpur', 'kunwar vijay singh', 'avantibai lodhi', 'durga bai deshmukh'], { mp: true }),

  /* --------------------------------------------------- Current Affairs -- */
  rule('ca-national', 'Current Affairs', 'National current affairs', 'Government schemes and launches', 2.8, ['launched by the union government', 'central scheme launched', 'nationally launched initiative', 'केंद्र सरकार की योजना']),
  rule('ca-legislation', 'Current Affairs', 'National current affairs', 'New legislation', 2.6, ['newly enacted act', 'bill passed by parliament recently', 'naya kanoon', 'new legislation']),
  rule('ca-reports', 'Current Affairs', 'National current affairs', 'Reports and indices', 3, ['global index', 'annual report released', 'world happiness report', 'press freedom index', 'ease of doing business', 'रिपोर्ट के अनुसार']),
  rule('ca-summits', 'Current Affairs', 'International current affairs', 'Summits and conferences', 3, ['summit held', 'g20 summit', 'brics summit', 'cop conference', 'shanghai cooperation organisation', 'शीर्ष सम्मेलन']),
  rule('ca-intl-org', 'Current Affairs', 'International current affairs', 'International organisations', 2.8, ['united nations agency', 'headquarters of the organisation', 'who headquarters', 'asean', 'साझा संगठन', 'un secretary general']),
  rule('ca-awards', 'Current Affairs', 'Awards and honours', 'National awards', 3, ['padma shri', 'padma bhushan', 'padma vibhushan', 'bharat ratna', 'national film award', 'दादा साहब फाल्के', 'पुरस्कार']),
  rule('ca-intl-awards', 'Current Affairs', 'Awards and honours', 'International awards', 3, ['nobel prize', 'oscar award', 'booker prize', 'abel prize', 'नोबेल पुरस्कार']),
  rule('ca-sports-awards', 'Current Affairs', 'Awards and honours', 'Sports awards', 3, ['khel ratna', 'arjuna award', 'dronacharya award', 'dhyan chand award', 'खेल रत्न']),
  rule('ca-appointments', 'Current Affairs', 'Appointments and personalities', 'Constitutional appointments', 3, ['appointed as the chairman', 'appointed as the chief justice', 'newly appointed', 'नियुक्त']),
  rule('ca-heads', 'Current Affairs', 'Appointments and personalities', 'Heads of state and government', 2.6, ['president of the country', 'elected prime minister', 'newly elected president']),
  rule('ca-obituary', 'Current Affairs', 'Appointments and personalities', 'Obituaries', 2.4, ['passed away', 'died recently', 'no more', 'निधन']),
  rule('ca-olympics', 'Current Affairs', 'Sports current affairs', 'Olympic and Asian Games', 3, ['olympic games', 'asian games', 'commonwealth games', 'ओलंपिक', 'medal tally']),
  rule('ca-cricket', 'Current Affairs', 'Sports current affairs', 'Cricket', 2.8, ['world cup cricket', 'icc tournament', 'century in cricket', 'cricket record', 'क्रिकेट विश्व कप']),
  rule('ca-space-news', 'Current Affairs', 'Science and technology current affairs', 'Space missions in news', 2.8, ['recently launched satellite', 'space mission in news', 'नया उपग्रह']),
  rule('ca-defence-exercise', 'Current Affairs', 'Science and technology current affairs', 'Defence exercises', 3, ['joint military exercise', 'naval exercise', 'air force exercise', 'sainya abhyas', 'सैन्य अभ्यास']),
  rule('ca-mp-events', 'Current Affairs', 'Current affairs of Madhya Pradesh', 'State events', 3, ['event held in madhya pradesh', 'summit in bhopal', 'global investors summit held', 'मध्य प्रदेश में आयोजित', 'hosted by madhya pradesh'], { mp: true }),
  rule('ca-mp-schemes-news', 'Current Affairs', 'Current affairs of Madhya Pradesh', 'State schemes in news', 3, ['scheme launched in madhya pradesh', 'mp government announced', 'मध्य प्रदेश में योजना शुरू'], { mp: true }),
  rule('ca-days', 'Current Affairs', 'Days and dates', 'International days', 2.8, ['international day is observed', 'world day is celebrated on', 'अंतर्राष्ट्रीय दिवस', 'celebrated on which date']),
  rule('ca-national-days', 'Current Affairs', 'Days and dates', 'National days', 2.6, ['national day of india observed', 'राष्ट्रीय दिवस', 'national sports day']),

  /* -------------------------------------------------- General Aptitude -- */
  rule('apt-number-system', 'General Aptitude', 'Quantitative aptitude', 'Number system', 3, ['hcf', 'lcm', 'divisibility rule', 'prime number', 'number series', 'संख्या पद्धति']),
  rule('apt-percentage', 'General Aptitude', 'Quantitative aptitude', 'Percentage and averages', 3, ['percentage of', 'average of the numbers', 'औसत', 'प्रतिशत']),
  rule('apt-ratio', 'General Aptitude', 'Quantitative aptitude', 'Ratio and proportion', 3, ['ratio of', 'proportion', 'anupat', 'अनुपात']),
  rule('apt-profit-loss', 'General Aptitude', 'Quantitative aptitude', 'Profit and loss', 3.2, ['profit percent', 'loss percent', 'cost price', 'selling price', 'discount percent', 'लाभ हानि', 'क्रय मूल्य']),
  rule('apt-interest', 'General Aptitude', 'Quantitative aptitude', 'Simple and compound interest', 3.2, ['simple interest', 'compound interest', 'interest per annum', 'साधारण ब्याज', 'चक्रवृद्धि ब्याज']),
  rule('apt-time-work', 'General Aptitude', 'Quantitative aptitude', 'Time and work', 3.2, ['in how many days will they finish', 'efficiency of work', 'time and work', 'pipes and cistern', 'कार्य और समय']),
  rule('apt-speed-distance', 'General Aptitude', 'Quantitative aptitude', 'Time speed and distance', 3.2, ['speed of the train', 'relative speed', 'average speed', 'train crossing', 'चाल दूरी समय', 'boats and streams']),
  rule('apt-mensuration', 'General Aptitude', 'Quantitative aptitude', 'Mensuration', 3, ['area of the rectangle', 'volume of the cylinder', 'perimeter of', 'surface area', 'क्षेत्रफल', 'आयतन']),
  rule('apt-data-interpretation', 'General Aptitude', 'Quantitative aptitude', 'Data interpretation', 3, ['table shows the data', 'bar graph', 'pie chart', 'study the graph', 'आंकड़ों की व्याख्या']),
  rule('apt-series', 'General Aptitude', 'Logical reasoning', 'Series and analogy', 3, ['find the next term', 'complete the series', 'odd one out', 'analogy', 'श्रृंखला', 'समानता']),
  rule('apt-coding', 'General Aptitude', 'Logical reasoning', 'Coding decoding', 3.2, ['in a certain code', 'if in a code language', 'coded as', 'कूट भाषा']),
  rule('apt-blood-relations', 'General Aptitude', 'Logical reasoning', 'Blood relations', 3.2, ['pointing to a photograph', 'brother of the father', 'how is he related', 'रक्त संबंध']),
  rule('apt-direction', 'General Aptitude', 'Logical reasoning', 'Direction sense', 3.2, ['walks towards north', 'direction and distance', 'in which direction is he now', 'दिशा']),
  rule('apt-syllogism', 'General Aptitude', 'Logical reasoning', 'Syllogism', 3.2, ['statements and conclusions', 'all are some', 'syllogism', 'कथन और निष्कर्ष']),
  rule('apt-statement-conclusion', 'General Aptitude', 'Logical reasoning', 'Statement and conclusion', 2.8, ['statement and assumption', 'course of action', 'argument follows', 'कथन और पूर्वधारणा']),
  rule('apt-data-sufficiency', 'General Aptitude', 'Logical reasoning', 'Data sufficiency', 3, ['data sufficient to answer', 'is the data in statement i sufficient', 'पर्याप्तता']),
];

/**
 * Madhya Pradesh markers, in two tiers.
 *
 * STRONG markers are unique to the state, so one of them in the question stem is
 * enough to call a question MP-specific. WEAK markers are shared with
 * neighbouring states — the Narmada also flows through Gujarat and Maharashtra,
 * the Gond and Bhil live in several states — so they only decide the question
 * when several appear together and nothing points at another state.
 *
 * Each marker is also weighted by the field it appears in: the question stem
 * counts most, options less, and the printed explanation least, because the
 * explanation is contextual evidence rather than the question itself.
 */
export const MP_STRONG_MARKERS = [
  'madhya pradesh', 'मध्य प्रदेश', 'mp state', 'm p state',
  'bhopal', 'भोपाल', 'indore', 'इंदौर', 'ग्वालियर', 'gwalior', 'jabalpur', 'जबलपुर', 'ujjjain', 'उज्जैन', 'rewa', 'रीवा', 'satna', 'सतना', 'khajuraho', 'खजुराहो', 'sanchi', 'सांची', 'bhimbetka', 'भीमबेटका', 'omkareshwar', 'ओंकारेश्वर', 'maheshwar', 'महेश्वर', 'amarkantak', 'अमरकंटक', 'pachmarhi', 'पचमढ़ी', 'kanha', 'कान्हा', 'bandhavgarh', 'बांधवगढ़', 'van vihar', 'वन विहार', 'satpura', 'सतपुड़ा', 'vindhya', 'विंध्य', 'malwa', 'मालवा', 'baghelkhand', 'बघेलखंड', 'bundelkhand', 'बुंदेलखंड', 'mandu', 'मांडू', 'orchha', 'ओरछा', 'chanderi', 'चंदेरी', 'burhanpur', 'बुरहानपुर', 'vidisha', 'विदिशा', 'narsinghpur', 'नरसिंहपुर', 'narmadapuram', 'seoni', 'सिवनी', 'balaghat', 'बालाघाट', 'chhindwara', 'छिंदवाड़ा', 'betul', 'बैतूल', 'shahdol', 'उमरिया', 'umaria', 'dindori', 'अनूपपुर', 'anuppur', 'sheopur', 'मुरैना', 'morena', 'datia', 'दतिया', 'panna', 'पन्ना', 'damoh', 'दमोह', 'tikamgarh', 'ashoknagar', 'guna', 'गुना', 'shivpuri', 'शिवपुरी', 'rajgarh', 'sehore', 'सीहोर', 'raisen', 'khandwa', 'खंडवा', 'khargone', 'धार', 'jhabua', 'झाबुआ', 'alirajpur', 'बड़वानी', 'barwani', 'neemuch', 'नीमच', 'mandsaur', 'मंदसौर', 'ratlam', 'रतलाम', 'shajapur', 'agar malwa', 'sagar', 'सागर', 'hoshangabad', 'harda', 'bharat bhavan', 'भारत भवन',
];

export const MP_WEAK_MARKERS = [
  'narmada', 'नर्मदा', 'tapti', 'ताप्ती', 'तापी', 'chambal', 'चंबल', 'betwa', 'बेतवा', 'son river', 'सोन नदी', 'ken river', 'केन', 'shipra', 'क्षिप्रा', 'शिप्रा', 'parbati', 'पार्वती', 'kalisindh', 'काली सिंध', 'banas', 'टोंस', 'gond', 'गोंड', 'bhil', 'भील', 'baiga', 'बैगा', 'sahariya', 'सहरिया', 'korku', 'कोरकू', 'pench', 'पेंच', 'simhastha', 'सिंहस्थ', 'tansen', 'तानसेन', 'maihar', 'मैहर', 'gondi', 'gondwana', 'भीमबेटका गुफा', 'barasingha', 'बारासिंघा',
];

/** Words that mark a question as general-India / world rather than MP-specific. */
export const NON_MP_MARKERS = ['gujarat', 'गुजरात', 'maharashtra', 'महाराष्ट्र', 'rajasthan', 'राजस्थान', 'uttar pradesh', 'उत्तर प्रदेश', 'chhattisgarh', 'छत्तीसगढ़', 'karnataka', 'kerala', 'tamil nadu', 'odisha', 'bihar', 'west bengal', 'punjab', 'haryana', 'jharkhand', 'assam', 'andhra pradesh', 'telangana', 'goa', 'himachal pradesh', 'uttarakhand', 'jammu and kashmir', 'ladakh', 'andaman', 'lakshadweep', 'sikkim', 'nagaland', 'manipur', 'mizoram', 'tripura', 'meghalaya', 'arunachal pradesh', 'delhi', 'दिल्ली'];

/** How much each field contributes to the Madhya-Pradesh decision. */
export const MP_FIELD_WEIGHTS = Object.freeze({ question: 1, options: 0.75, explanation: 0.35 });
/** A single strong marker in the stem is decisive; weak markers need company. */
export const MP_STRONG_THRESHOLD = 1;
export const MP_WEAK_THRESHOLD = 2;


const TOKEN_RE = /\S+/g;

function buildIndex(rules) {
  const byToken = new Map();
  const phrases = [];
  const patterns = [];
  for (const r of rules) {
    for (const raw of r.terms) {
      const term = foldText(raw);
      if (!term) continue;
      if (term.includes(' ')) phrases.push({ rule: r, needle: term });
      else {
        const list = byToken.get(term) || [];
        list.push(r);
        byToken.set(term, list);
      }
    }
    if (r.pattern) patterns.push({ rule: r, pattern: r.pattern });
  }
  return { byToken, phrases, patterns };
}

let indexCache = null;
function ruleIndex() {
  if (!indexCache) indexCache = buildIndex(RULES);
  return indexCache;
}

/**
 * Collect the evidence for one record.
 * @param {{question_text?: string, option_texts?: string[], explanation_text?: string}} input
 * @returns {{text: string, tokens: Set<string>, hits: Map<object, {hits: string[], fields: Set<string>}>}}
 */
export function collectEvidence(input) {
  const parts = [];
  const questionText = input.question_text || '';
  if (questionText) parts.push({ text: questionText, weight: FIELD_WEIGHTS.question });
  for (const opt of input.option_texts || []) parts.push({ text: opt, weight: FIELD_WEIGHTS.options });
  if (input.explanation_text) parts.push({ text: input.explanation_text, weight: FIELD_WEIGHTS.explanation });

  const text = parts.map((p) => p.text).join(' \n ');
  const tokens = new Set();
  const hits = new Map();
  const idx = ruleIndex();

  const addHit = (r, term, weight, fromQuestion) => {
    const entry = hits.get(r) || { hits: [], score: 0, stemScore: 0 };
    entry.hits.push(term);
    entry.score += weight;
    if (fromQuestion) entry.stemScore += weight;
    hits.set(r, entry);
  };

  for (const part of parts) {
    const folded = foldText(part.text);
    if (!folded) continue;
    const words = folded.match(TOKEN_RE) || [];
    const localTokens = new Set(words);
    for (const w of words) tokens.add(w);
    const fromQuestion = part.weight === FIELD_WEIGHTS.question || part.weight === FIELD_WEIGHTS.options;
    for (const token of localTokens) {
      for (const r of idx.byToken.get(token) || []) addHit(r, token, part.weight, fromQuestion);
    }
    for (const phrase of idx.phrases) {
      if (folded.includes(phrase.needle)) addHit(phrase.rule, phrase.needle, part.weight, fromQuestion);
    }
    for (const pat of idx.patterns) {
      if (pat.pattern.test(folded)) addHit(pat.rule, pat.pattern.source, part.weight, fromQuestion);
    }
  }
  return { text, tokens, hits };
}

/**
 * Is this record about Madhya Pradesh rather than about India generally?
 * Accepts either the structured evidence ({question_text, option_texts,
 * explanation_text}) or a plain string.
 */
export function mpSignal(input) {
  const fields =
    typeof input === 'string'
      ? [{ text: input, weight: MP_FIELD_WEIGHTS.question }]
      : [
          { text: input.question_text || '', weight: MP_FIELD_WEIGHTS.question },
          ...((input.option_texts || []).map((t) => ({ text: t, weight: MP_FIELD_WEIGHTS.options }))),
          { text: input.explanation_text || '', weight: MP_FIELD_WEIGHTS.explanation },
        ];

  const mpHits = [];
  const nonMpHits = [];
  let strong = 0;
  let weak = 0;
  let nonMp = 0;
  for (const field of fields) {
    const folded = foldText(field.text);
    if (!folded) continue;
    for (const marker of MP_STRONG_MARKERS) {
      if (folded.includes(marker)) {
        strong += field.weight;
        if (!mpHits.includes(marker)) mpHits.push(marker);
      }
    }
    for (const marker of MP_WEAK_MARKERS) {
      if (folded.includes(marker)) {
        weak += field.weight;
        if (!mpHits.includes(marker)) mpHits.push(marker);
      }
    }
    for (const marker of NON_MP_MARKERS) {
      if (folded.includes(marker)) {
        nonMp += field.weight;
        if (!nonMpHits.includes(marker)) nonMpHits.push(marker);
      }
    }
  }
  const total = strong + weak;
  const mpSpecific = total > nonMp && (strong >= MP_STRONG_THRESHOLD || (weak >= MP_WEAK_THRESHOLD && nonMp < weak));
  return { mpHits, nonMpHits, strongScore: round2(strong), weakScore: round2(weak), nonMpScore: round2(nonMp), score: round2(total - nonMp), mpSpecific };
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function round2(n) {
  return Math.round(n * 100) / 100;
}

function sortedScores(map) {
  return Array.from(map.entries()).sort((a, b) => (b[1] === a[1] ? String(a[0]).localeCompare(String(b[0])) : b[1] - a[1]));
}

/**
 * Classify one question with the deterministic rule engine.
 *
 * Returns a decision object; `assigned` is false whenever the evidence is too
 * weak or two subjects are too close, in which case the caller must leave the
 * record unclassified and flag it for review.
 */
export function classifyWithRules(input, { taxonomy } = {}) {
  const { text, hits } = collectEvidence(input);
  const mp = mpSignal(input);

  const scored = [];
  const matched = [];
  for (const [r, entry] of hits.entries()) {
    if (r.notWith && r.notWith.some((t) => foldText(text).includes(foldText(t)))) continue;
    let weight = r.weight;
    if (r.mp) weight *= mp.mpSpecific ? 1.35 : 0.8;
    if (r.generic) weight *= mp.mpSpecific ? 0.75 : 1;
    // Where the evidence came from matters as much as which rule matched: a term
    // in the question stem is far better evidence than the same term appearing
    // in a distractor option, and the printed explanation is context only.
    const fieldFactor = clamp(entry.score / FIELD_WEIGHTS.question, 0.35, 1.2);
    const extra = Math.max(0, entry.hits.length - 1);
    const repeatFactor = 1 + Math.min(extra, 3) * 0.1;
    const score = weight * fieldFactor * repeatFactor;
    // A Madhya-Pradesh rule that fires without MP context is real evidence about
    // the subject, just not about the state, so it counts towards its fallback
    // node (the Narmada in Gujarat is still Geography / Rivers of India).
    const redirected = r.mp && !mp.mpSpecific && r.fallback;
    const target = redirected ? { ...r.fallback, redirectedFrom: r.id } : { subject: r.subject, topic: r.topic, subtopic: r.subtopic };
    scored.push({ rule: r, target, score, stemScore: entry.stemScore });
    matched.push({
      ruleId: r.id,
      subject: target.subject,
      topic: target.topic,
      subtopic: target.subtopic || null,
      score: round2(score),
      terms: Array.from(new Set(entry.hits)).slice(0, 8),
      ...(redirected ? { redirected_to: `${target.subject} / ${target.topic}` } : {}),
    });
  }
  matched.sort((a, b) => (b.score === a.score ? a.ruleId.localeCompare(b.ruleId) : b.score - a.score));

  const subjectScore = new Map();
  const topicScore = new Map();
  const subtopicScore = new Map();
  for (const { target, score } of scored) {
    subjectScore.set(target.subject, (subjectScore.get(target.subject) || 0) + score);
    const tk = `${target.subject}|${target.topic}`;
    topicScore.set(tk, (topicScore.get(tk) || 0) + score);
    if (target.subtopic) {
      const sk = `${target.subject}|${target.topic}|${target.subtopic}`;
      subtopicScore.set(sk, (subtopicScore.get(sk) || 0) + score);
    }
  }

  const subjects = sortedScores(subjectScore);
  const base = {
    assigned: false,
    subject: null,
    topic: null,
    subtopic: null,
    confidence: 0,
    source: CLASSIFICATION_SOURCE_RULES,
    matched: matched.slice(0, 6),
    candidates: subjects.slice(0, 3).map(([subject, score]) => ({ subject, score: round2(score) })),
    mpSpecific: mp.mpSpecific,
    mpMarkers: mp.mpHits.slice(0, 8),
    nonMpMarkers: mp.nonMpHits.slice(0, 8),
    reason: null,
    flags: [],
  };

  if (!subjects.length) return { ...base, reason: 'no_rule_matched' };
  const [topSubject, topScore] = subjects[0];
  const secondScore = subjects[1]?.[1] || 0;
  const margin = secondScore > 0 ? (topScore - secondScore) / topScore : 1;

  if (topScore < MIN_SUBJECT_SCORE) return { ...base, reason: 'insufficient_signal', evidenceScore: round2(topScore) };
  if (margin < AMBIGUOUS_SUBJECT_MARGIN) {
    return { ...base, reason: 'ambiguous_subject', evidenceScore: round2(topScore), margin: round2(margin) };
  }

  const coverage = Math.min(1, topScore / STRONG_SCORE);
  let confidence = 0.45 + 0.3 * margin + 0.2 * coverage;
  confidence = round2(Math.min(MAX_CONFIDENCE, confidence));

  const topics = sortedScores(topicScore)
    .filter(([key]) => key.startsWith(`${topSubject}|`))
    .map(([key, score]) => [key.split('|')[1], score]);
  let topic = null;
  let topicNote = null;
  if (topics.length) {
    const [topTopic, topicTop] = topics[0];
    const topicSecond = topics[1]?.[1] || 0;
    const topicMargin = topicSecond > 0 ? (topicTop - topicSecond) / topicTop : 1;
    if (topicMargin < AMBIGUOUS_TOPIC_MARGIN) {
      topicNote = `topic ambiguous between ${topics[0][0]} and ${topics[1][0]}`;
      confidence = round2(Math.min(confidence, 0.5));
    } else {
      topic = topTopic;
    }
  }

  let subtopic = null;
  const flags = [];
  const stemOnlyEvidence = scored.every((entry) => entry.stemScore > 0);
  if (scored.length && !stemOnlyEvidence) {
    // Nothing in the question itself supported this; only the printed
    // explanation did. That is usable context, not a basis for full confidence.
    confidence = round2(Math.min(confidence, EXPLANATION_ONLY_CONFIDENCE));
    flags.push('explanation_only_evidence');
  }
  if (topic) {
    const subs = sortedScores(subtopicScore).filter(([key]) => key.startsWith(`${topSubject}|${topic}|`));
    if (subs.length) {
      const [topSub, subTop] = subs[0];
      const subSecond = subs[1]?.[1] || 0;
      const subMargin = subSecond > 0 ? (subTop - subSecond) / subTop : 1;
      if (subMargin >= 0.12) {
        subtopic = topSub.split('|')[2];
      } else {
        // Two subtopics are almost equally supported. The stronger one is the
        // best available answer, so it is used — but flagged for review and the
        // confidence is capped, rather than leaving the field empty.
        subtopic = topSub.split('|')[2];
        flags.push('ambiguous_subtopic');
        confidence = round2(Math.min(confidence, 0.6));
      }
    }
  }

  return {
    ...base,
    flags,
    assigned: true,
    subject: topSubject,
    topic,
    subtopic,
    confidence,
    evidenceScore: round2(topScore),
    margin: round2(margin),
    reason: topicNote || null,
    taxonomy: taxonomy || null,
  };
}

/** Every taxonomy node a rule targets must exist, or the pipeline refuses to run. */
export function validateRules(taxonomy) {
  const problems = [];
  const seen = new Set();
  for (const r of RULES) {
    if (seen.has(r.id)) problems.push(`duplicate rule id "${r.id}"`);
    seen.add(r.id);
    if (!r.terms?.length && !r.pattern) problems.push(`rule "${r.id}" has no terms`);
    const topics = taxonomy.subjects.get(r.subject);
    if (!topics) {
      problems.push(`rule "${r.id}" targets unknown subject "${r.subject}"`);
      continue;
    }
    if (!topics.has(r.topic)) {
      problems.push(`rule "${r.id}" targets unknown topic "${r.subject} / ${r.topic}"`);
      continue;
    }
    if (r.subtopic && !topics.get(r.topic).includes(r.subtopic)) {
      problems.push(`rule "${r.id}" targets unknown subtopic "${r.subject} / ${r.topic} / ${r.subtopic}"`);
    }
    if (r.fallback) {
      if (!r.mp) problems.push(`rule "${r.id}" has a fallback but is not marked mp: true`);
      const fTopics = taxonomy.subjects.get(r.fallback.subject);
      if (!fTopics) problems.push(`rule "${r.id}" has a fallback with unknown subject "${r.fallback.subject}"`);
      else if (!fTopics.has(r.fallback.topic)) problems.push(`rule "${r.id}" has a fallback with unknown topic "${r.fallback.subject} / ${r.fallback.topic}"`);
      else if (r.fallback.subtopic && !fTopics.get(r.fallback.topic).includes(r.fallback.subtopic)) {
        problems.push(`rule "${r.id}" has a fallback with unknown subtopic "${r.fallback.subject} / ${r.fallback.topic} / ${r.fallback.subtopic}"`);
      }
    }
  }
  return problems;
}
