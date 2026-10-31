// node tests/run-i18n-core.js -> the translation engine itself (templates, recursion, splitting, misses)
const I = require('../i18n.js');
let pass = 0, total = 0; const ok = (n, c) => { total++; pass += !!c; console.log(`${c ? 'pass' : 'FAIL'} | ${n}`); };
I.load([
  ['Water', 'पानी', 'Paani'],
  ['today', 'आज', 'aaj'], ['yesterday', 'कल', 'kal'], ['{} days ago', '{1} दिन पहले', '{1} din pehle'],
  ['{} steps this week', 'इस हफ़्ते {1} कदम', 'Is hafte {1} kadam'],
  ['best day {} · {}-day streak · shared {}', 'सबसे अच्छा दिन {1} · {2} दिन की लय · {3} साझा किया', 'best day {1} · {2} din ki lay · {3} share kiya'],
  ['Not medical advice.', 'यह चिकित्सा सलाह नहीं है।', 'Yeh medical salah nahi hai.'],
  ['Please call 112.', 'कृपया 112 पर कॉल करें।', 'Kripya 112 par call karein.'],
  ['Remove {} from your board?', 'क्या {1} को अपने बोर्ड से हटाएँ?', 'Kya {1} ko apne board se hatayein?'],
  ['{} glasses', '{1} गिलास', '{1} glass'], ['{} of {} glasses', '{2} में से {1} गिलास', '{2} mein se {1} glass'],
  ['Hello, {}', 'नमस्ते, {1}', 'Namaste, {1}'],
]);
ok('English is never changed', I.tr('Water', 'en') === 'Water' && I.tr('{} steps this week', 'en') === '{} steps this week');
ok('exact entries: Hindi and Hinglish', I.tr('Water', 'hi') === 'पानी' && I.tr('Water', 'hg') === 'Paani');
ok('leading and trailing spaces survive', I.tr('  Water  ', 'hi') === '  पानी  ');
ok('inner whitespace and line breaks are normalised before matching', I.tr('Water\n   ', 'hi') === 'पानी\n   ' || I.tr('Water\n   ', 'hi').startsWith('पानी'));
ok('template: numbers are captured and put back', I.tr('52,300 steps this week', 'hi') === 'इस हफ़्ते 52,300 कदम' && I.tr('52,300 steps this week', 'hg') === 'Is hafte 52,300 kadam');
ok('template: word order can change ({2} before {1})', I.tr('3 of 6 glasses', 'hi') === '6 में से 3 गिलास');
ok('the more specific template wins over the shorter one', I.tr('3 of 6 glasses', 'hg') === '6 mein se 3 glass');
ok('captured pieces are translated too ("shared today", "3 days ago")', I.tr('best day 12,400 · 5-day streak · shared today', 'hi') === 'सबसे अच्छा दिन 12,400 · 5 दिन की लय · आज साझा किया' && I.tr('best day 1 · 0-day streak · shared 3 days ago', 'hg') === 'best day 1 · 0 din ki lay · 3 din pehle share kiya');
ok('names that are not in the dictionary pass through', I.tr('Remove Ravi from your board?', 'hi') === 'क्या Ravi को अपने बोर्ड से हटाएँ?' && I.tr('Hello, Sunita', 'hg') === 'Namaste, Sunita');
ok('several sentences are translated one by one', I.tr('Not medical advice. Please call 112.', 'hi') === 'यह चिकित्सा सलाह नहीं है। कृपया 112 पर कॉल करें।');
ok('numbers, units and symbols alone are left alone and are not "missing"', I.tr('740–1,140 kcal', 'hi') === '740–1,140 kcal' && I.tr('0.84 km', 'hg') === '0.84 km' && I.tr('12:30', 'hi') === '12:30');
I.load([['roti', 'रोटी', 'roti'], ['dal', 'दाल', 'dal'], ['sabzi', 'सब्ज़ी', 'sabzi']]);
ok('a number in front of a known word: "2 roti" -> "2 रोटी"', I.tr('2 roti', 'hi') === '2 रोटी' && I.tr('1.5 dal', 'hg') === '1.5 dal');
ok('a short list of known words: "2 roti, dal, sabzi"', I.tr('2 roti, dal, sabzi', 'hi') === '2 रोटी, दाल, सब्ज़ी' && I.tr('dal, sabzi', 'hg') === 'dal, sabzi');
I.track(true); I.clearMisses();
ok('a list with an unknown item is NOT half-translated by accident (it is reported as a whole)', (I.tr('dal, mystery', 'hi'), I.misses().includes('dal, mystery')));
I.clearMisses(); I.tr('A sentence nobody translated', 'hi'); I.tr('Water and an unknown thing', 'hg');
ok('untranslated text is returned unchanged AND recorded as a miss', I.tr('A sentence nobody translated', 'hi') === 'A sentence nobody translated' && I.misses().includes('A sentence nobody translated'));
I.clearMisses(); I.tr('Not medical advice. Something new here.', 'hi');
ok('a half-translated paragraph records only the missing sentence', I.misses().join('|') === 'Something new here.');
I.clearMisses(); I.tr('Water', 'hi'); I.tr('HR 112', 'hg'); ok('known strings and units do not create misses', I.misses().length === 0);
I.track(false);
ok('setLang accepts only known languages', I.setLang('hi') === 'hi' && I.setLang('xx') === 'hi' && I.setLang('en') === 'en');
ok('current language is used when none is given', (I.setLang('hg'), I.tr('Water') === 'Paani') && (I.setLang('en'), I.tr('Water') === 'Water'));
ok('templates cannot match across unrelated text ({} needs content)', I.tr(' steps this week', 'hi') === ' steps this week');
console.log(`\n${pass}/${total} passed`); if (pass !== total) process.exit(1);
