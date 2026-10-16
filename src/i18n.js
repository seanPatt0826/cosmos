// English and Korean.
//
// The English text is the key, so every call site still reads as the sentence
// it shows, and a string nobody has translated falls back to itself rather
// than to a blank. {n} and {name} are filled in from the second argument.
//
// Switching language never restarts anything: whatever painted text has to be
// redrawn registers with onLang() and is called again.

const STORE_LANG = 'cosmos.lang';

const KO = {
  // Page
  'Cosmos': '코스모스',
  'Cosmos — a little universe, drawn by hand': '코스모스 — 손으로 그린 작은 우주',
  'about': '소개',
  'privacy': '개인정보',

  // Rail
  'Close-up': '클로즈업',
  'Map': '지도',
  '{n} still in': '{n}명 남음',
  'Sponsored': '광고',
  'Entrants': '참가자',
  'Ranking': '순위',
  'in': '생존',
  'Universes': '우주',
  'Shuffle': '섞기',
  'Shuffle who stands where (S)': '출발 자리 섞기 (S)',
  '+ Add': '+ 추가',
  'Clear': '지우기',
  'Watch an example': '예시 보기',
  'Add names, or watch an example.': '이름을 넣거나 예시를 보세요.',
  'One more and they can race.': '한 명만 더 있으면 경주할 수 있어요.',
  '{n} entrants on the line. Shuffle, then press Start.': '참가자 {n}명 준비 완료. 섞은 다음 시작을 누르세요.',
  'Name {n}': '이름 {n}',
  'Remove': '삭제',
  'Remove this name': '이 이름 삭제',
  'waiting for names': '이름을 기다리는 중',
  'waiting': '대기 중',
  'unnamed': '이름 없음',
  'the winner': '우승자',
  'Ad space': '광고 자리',
  'Nobody is playing.': '아무도 조종하지 않아요.',
  'Objects are released into a physics playground and knocked out one at a time. The last one left wins, then it happens again somewhere else. Nothing is scripted.':
    '물체들이 물리 놀이터에 풀려나 하나씩 탈락해요. 마지막까지 남은 하나가 이기고, 그다음엔 다른 곳에서 다시 시작해요. 정해진 각본은 없어요.',
  'how it works': '작동 방식',

  // Arena
  'How it works': '이렇게 진행돼요',
  'How {name} works': '{name} 진행 방식',
  'Hide how it works': '설명 접기',
  'Show how it works': '설명 펼치기',
  'Close': '닫기',
  'What happens in this universe?': '이 우주에서는 무슨 일이 일어날까요?',
  'What happens here?': '여기선 무슨 일이?',
  'Knocked out': '탈락',
  'Start': '시작',
  'Start the race (Enter)': '경주 시작 (Enter)',
  'physics failed to load': '물리 엔진을 불러오지 못했어요',

  // Standings and banners
  '{n} entrants': '참가자 {n}명',
  '{n} left': '{n}명 남음',
  '+{n} more': '+{n}명 더',
  'winner': '우승',
  'final {n}': '최후의 {n}',

  // How someone went out
  'black hole': '블랙홀',
  'flung out': '튕겨 나감',
  'burned up': '불타 버림',
  'blown apart': '산산조각',
  'out': '탈락',

  // Controls
  'pause': '일시정지',
  'play': '재생',
  'sound off': '소리 끔',
  'sound on': '소리 켬',
  'light': '밝게',
  'dark': '어둡게',
  'skip': '건너뛰기',

  // Controls (icons; these are their tooltips)
  'Pause': '일시정지',
  'Play': '재생',
  'Speed {n}×': '속도 {n}×',
  'Sound on': '소리 켬',
  'Sound off': '소리 끔',
  'Switch to light mode': '밝은 화면으로',
  'Switch to dark mode': '어두운 화면으로',
  'Skip to the next universe': '다음 우주로 건너뛰기',
  'Restart this race': '이번 경주 다시 시작',

  // Rules card
  'Goal': '목표',
  'Last one left wins.': '마지막까지 남으면 우승!',
  'Out if': '탈락 조건',
  'Watch for': '주의할 점',

  // Step-by-step pictures in the How it works card
  'Line up': '출발 준비',
  'Everyone waits on the line. Press Start to go.': '모두 출발선에서 기다려요. 시작을 누르면 출발!',
  'Knocked off the map.': '맵 밖으로 밀려나면 탈락.',
  'Step {n} of {total}': '{total}단계 중 {n}단계',
  'Previous step': '이전 단계',
  'Next step': '다음 단계',
  'Step 1': '1단계',
  'Step 2': '2단계',
  'Step 3': '3단계',
  'Falling into a black hole.': '블랙홀에 빠지면 탈락.',
  'Crashing into the planet, a black hole, or drifting past the ring.': '행성이나 블랙홀에 부딪히거나, 고리 밖으로 떠내려가면 탈락.',
  'Getting knocked past the closing ring, or into a black hole.': '좁혀지는 고리 밖으로 밀려나거나, 블랙홀에 빠지면 탈락.',
  'Touching a star, a black hole, or getting flung past the ring.': '별이나 블랙홀에 닿거나, 고리 밖으로 튕겨 나가면 탈락.',
  'Bouncing past the shrinking ring, or into a black hole.': '줄어드는 고리 밖으로 튕겨 나가거나, 블랙홀에 빠지면 탈락.',
  "Touching the star's core, or getting thrown past the ring.": '별의 중심에 닿거나, 고리 밖으로 내던져지면 탈락.',
  'Falling into a black hole, or drifting past the ring.': '블랙홀에 빠지거나, 고리 밖으로 떠내려가면 탈락.',
  'The holes creep toward the middle. Purple clouds slow you down; pulsars can fling you clear.': '블랙홀이 점점 가운데로 다가와요. 보라색 구름은 속도를 늦추고, 펄서는 멀리 튕겨 줄 수 있어요.',
  'The planet keeps getting heavier, so every orbit slowly sinks.': '행성이 계속 무거워져서 모든 궤도가 조금씩 가라앉아요.',
  'No gravity here. Only collisions move you, and the ring keeps shrinking.': '여기엔 중력이 없어요. 부딪혀야만 움직이고, 고리는 계속 줄어들어요.',
  'The two stars spiral closer together as the round goes on.': '라운드가 진행될수록 두 별이 나선을 그리며 가까워져요.',
  'Nothing ever slows down, so one big hit keeps you flying.': '아무것도 느려지지 않아서, 한 번 크게 맞으면 계속 날아가요.',
  'When the star swells it pulls everyone in, then it blasts them back out.': '별이 부풀면 모두를 끌어당겼다가, 다시 밖으로 날려 보내요.',
  'Each door drops you out of its same-coloured twin, still moving.': '문에 들어가면 같은 색 짝꿍 문으로, 움직이던 그대로 나와요.',

  // Universes
  'Black Hole Garden': '블랙홀 정원',
  'mind the holes': '구멍 조심',
  "Black holes drift through an open room and creep inward; fall in and you're out.": '블랙홀이 떠돌며 점점 가운데로 다가와요. 빠지면 탈락이에요.',
  'Orbital Arena': '궤도 경기장',
  'round and round': '빙글빙글',
  'Everyone starts on a real orbit, but the planet keeps getting heavier, so every orbit sinks.': '모두 진짜 궤도에서 출발하지만, 행성이 계속 무거워져 궤도가 가라앉아요.',
  'Asteroid Belt': '소행성대',
  'watch out': '조심해요',
  'No gravity, just rocks with momentum: every knockout is a collision you can see coming.': '중력 없이 바위만 날아다녀요. 모든 탈락은 눈에 보이는 충돌이에요.',
  'Binary Stars': '쌍성',
  'two suns, no rest': '태양 둘, 쉴 틈 없음',
  'Two stars circle each other and spiral closer until nowhere is safe.': '두 별이 서로 돌며 점점 가까워져, 결국 안전한 곳이 없어져요.',
  'Bumper Field': '범퍼 필드',
  'everything bounces': '모든 게 튕겨요',
  'Repulsors and a closing ring, and nothing ever slows down.': '튕겨 내는 범퍼와 좁혀지는 고리, 그리고 아무것도 느려지지 않아요.',
  'Supernova': '초신성',
  'it breathes in': '숨을 들이쉬어요',
  'The star swells and pulls everyone in, then blasts them back out.': '별이 부풀며 모두를 끌어당겼다가, 다시 밖으로 날려 보내요.',
  'Wormholes': '웜홀',
  'in one side, out the other': '이쪽으로 들어가 저쪽으로',
  'Fall into a door and you fly out of its same-coloured twin, still moving.': '문에 빠지면 같은 색 짝꿍 문으로, 움직이던 그대로 나와요.',

  // Choose icon
  'Choose icon': '아이콘 고르기',
  'Choose an icon for {name}': '{name}의 아이콘 고르기',
  'Icon for {name}': '{name}의 아이콘',
  'Tap an icon to wear it. Random deals one each round.': '아이콘을 누르면 그 모습으로 달려요. 무작위는 라운드마다 하나를 골라 줘요.',
  'Random': '무작위',

  // Sample ads (made-up companies; see src/ads.js)
  'Ad': '광고',
  'Hide ad': '광고 접기',
  'Show ad': '광고 펼치기',
  'Why this ad?': '이 광고는 왜 보이나요?',
  'Sample ad': '샘플 광고예요',
  'Fresh buns, delivered warm': '갓 구운 빵, 따끈하게 배달',
  'Baked at dawn, at your door by breakfast.': '새벽에 구워 아침 전에 문 앞까지.',
  '30% off your first box': '첫 상자 30% 할인',
  'Order now': '주문하기',
  'Hear every star.': '별 하나하나까지 들려요.',
  'Wireless headphones with 40 hours of battery.': '40시간 가는 무선 헤드폰.',
  '$59': '₩79,000',
  'Shop now': '구매하기',
  'Weekend trips, planned in a minute': '주말 여행, 1분이면 계획 끝',
  'Stays, trains and tickets in one app.': '숙소, 기차, 티켓을 앱 하나로.',
  'Travel': '여행',
  'Free': '무료',
  'Install': '설치',
  'Tap an icon to wear it. Blue ones are already taken, but you can still pick one: you race in your own colour.':
    '아이콘을 누르면 그 모습으로 달려요. 파란 아이콘은 이미 누가 골랐지만, 그래도 고를 수 있어요. 색은 서로 달라요.',
  'Taken by {name}': '{name}이(가) 골랐어요',
  'Saturn': '토성',
  'Planet': '행성',
  'Rocket': '로켓',
  'Groot': '그루트',
  'UFO': 'UFO',
  'Satellite': '인공위성',
  'Astronaut': '우주비행사',
  'Alien': '외계인',
  'Draw your own': '직접 그리기',
  'Eraser': '지우개',
  'Save drawing': '그림 저장',
  'Name your drawing': '그림 이름',
  'My drawing': '내 그림',
  'Pen colour': '펜 색',
  'Done': '완료',
  'Delete this drawing': '이 그림 삭제',
  'Saved. {name} is wearing it.': '저장했어요. 이제 {name}이(가) 이 아이콘으로 달려요.',
  'No room for more drawings. Delete one first.': '그림을 더 저장할 수 없어요. 먼저 하나를 지워 주세요.',
};

// A cast for the example run, in whichever language is showing.
const EXAMPLES = {
  en: [
    'Pebble', 'Thimble', 'Marigold', 'Odd Sock', 'Biscuit', 'Lantern',
    'Mustard', 'Quibble', 'Tangerine', 'Bramble', 'Doorbell', 'Pocket',
  ],
  ko: [
    '조약돌', '골무', '금잔화', '짝짝이 양말', '비스킷', '등불',
    '겨자', '투덜이', '귤', '가시덤불', '초인종', '주머니',
  ],
};

function stored() {
  try {
    return window.localStorage.getItem(STORE_LANG);
  } catch (e) {
    return null;
  }
}

// Korean is the default for everyone. Only someone who has pressed the globe
// and picked English gets English, and that choice is remembered.
let lang = stored() === 'en' ? 'en' : 'ko';

const listeners = [];

export function getLang() {
  return lang;
}

export function t(text, vars) {
  let s = (lang === 'ko' && KO[text]) || text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

export function examplePool() {
  return [...EXAMPLES[lang]];
}

export function onLang(fn) {
  listeners.push(fn);
}

// Static markup carries its English in data-i18n (text), data-i18n-title and
// data-i18n-aria; the English is read once and kept, so flipping back and
// forth never translates a translation.
function applyStatic() {
  document.documentElement.lang = lang;
  document.body.classList.toggle('lang-ko', lang === 'ko');
  document.title = t('Cosmos — a little universe, drawn by hand');
  for (const el of document.querySelectorAll('[data-i18n]')) {
    if (!el.dataset.en) el.dataset.en = el.dataset.i18n || el.textContent.trim();
    el.textContent = t(el.dataset.en);
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    setTip(el, t(el.dataset.i18nTitle));
  }
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
}

// The tooltip adopts an element's title into data-tip the first time it is
// hovered, so after that a new title alone would never be seen.
export function setTip(el, text) {
  if (el.dataset.tip !== undefined) el.dataset.tip = text;
  else el.title = text;
}

export function setLang(next) {
  lang = next === 'ko' ? 'ko' : 'en';
  try {
    window.localStorage.setItem(STORE_LANG, lang);
  } catch (e) {
    /* Remembering is a convenience. */
  }
  applyStatic();
  for (const fn of listeners) fn(lang);
}

export function installLang(button) {
  applyStatic();
  if (!button) return;
  const label = () => {
    // Each language is offered in its own words, so whoever needs it can read it.
    // A small globe before the word, in the controls bar's pen: a circle, the
    // equator and one meridian on the same 24-unit grid as src/icons.js.
    button.innerHTML = '<svg class="lang-icon" viewBox="0 0 24 24" aria-hidden="true">'
      + '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8"/>'
      + '<path d="M12 3.4c2.5 2.4 3.7 5.3 3.7 8.6s-1.2 6.2-3.7 8.6c-2.5-2.4-3.7-5.3-3.7-8.6s1.2-6.2 3.7-8.6z"/>'
      + '</g></svg>';
    const word = document.createElement('span');
    word.textContent = lang === 'ko' ? 'English' : '한국어';
    button.appendChild(word);
    button.setAttribute('aria-label', lang === 'ko' ? 'Switch to English' : '한국어로 보기');
  };
  label();
  button.addEventListener('click', () => {
    setLang(lang === 'ko' ? 'en' : 'ko');
    label();
  });
}
