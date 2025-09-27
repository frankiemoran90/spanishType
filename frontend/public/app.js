// SpanishType interactive typing UI.
// Displays the Spanish sentence, tracks per-character accuracy, and moves a cursor as you type.

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (!root) return;

  const stripDiacritics = (value) =>
    (value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '');

  const normalizeForComparison = (value, strictAccents) => {
    if (strictAccents) return value ?? '';

    const base = stripDiacritics(value ?? '');
    if (base === '¿' || base === '?') return '?';
    if (base === '¡' || base === '!') return '!';
    return base;
  };

  const promptForPlayerName = () => {
    const raw = window.prompt('Enter your name (displayed on the scoreboard):', localStorage.getItem('spanishType.playerName') || '');
    const trimmed = (raw ?? '').trim();
    if (trimmed.length === 0) {
      return 'Player';
    }
    localStorage.setItem('spanishType.playerName', trimmed);
    return trimmed;
  };

  const loadScore = () => {
    const stored = localStorage.getItem('spanishType.sessionScore');
    if (!stored) return 0;
    const value = Number.parseInt(stored, 10);
    return Number.isNaN(value) ? 0 : value;
  };

  const saveScore = (score) => {
    localStorage.setItem('spanishType.sessionScore', String(score));
  };

  root.innerHTML = '';
  root.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  root.style.maxWidth = '860px';
  root.style.margin = '0 auto';
  root.style.padding = '2rem 1.5rem';

  const title = document.createElement('h1');
  title.textContent = 'SpanishType';
  title.style.marginBottom = '0.25rem';
  root.appendChild(title);

  const layout = document.createElement('div');
  layout.style.display = 'grid';
  layout.style.gridTemplateColumns = '1fr minmax(220px, 260px)';
  layout.style.gap = '2rem';
  layout.style.alignItems = 'start';
  root.appendChild(layout);

  const mainColumn = document.createElement('div');
  layout.appendChild(mainColumn);

  const sidebar = document.createElement('aside');
  sidebar.style.padding = '1rem';
  sidebar.style.border = '1px solid #d1d5db';
  sidebar.style.borderRadius = '0.75rem';
  sidebar.style.background = '#f9fafb';
  layout.appendChild(sidebar);

  const subtitle = document.createElement('p');
  subtitle.textContent = 'Type the Spanish translation for the sentence shown below. Use Backspace to fix mistakes.';
  subtitle.style.marginTop = '0';
  subtitle.style.marginBottom = '1.5rem';
  subtitle.style.color = '#4b5563';
  mainColumn.appendChild(subtitle);

  const status = document.createElement('p');
  status.textContent = 'Loading a sentence…';
  status.style.fontSize = '0.95rem';
  status.style.color = '#6b7280';
  status.style.marginBottom = '1.5rem';
  mainColumn.appendChild(status);

  const englishLabel = document.createElement('h2');
  englishLabel.textContent = 'English';
  englishLabel.style.marginBottom = '0.25rem';
  englishLabel.style.fontSize = '1rem';
  englishLabel.style.color = '#111827';
  mainColumn.appendChild(englishLabel);

  const englishBlock = document.createElement('blockquote');
  englishBlock.style.fontSize = '1.25rem';
  englishBlock.style.margin = '0 0 2rem 0';
  englishBlock.style.padding = '0.75rem 1rem';
  englishBlock.style.borderLeft = '4px solid #d1d5db';
  englishBlock.style.background = '#f3f4f6';
  englishBlock.textContent = '…';
  mainColumn.appendChild(englishBlock);

  const spanishLabel = document.createElement('h2');
  spanishLabel.textContent = 'Spanish';
  spanishLabel.style.margin = '0 0 0.5rem 0';
  spanishLabel.style.fontSize = '1rem';
  spanishLabel.style.color = '#111827';
  mainColumn.appendChild(spanishLabel);

  const spanishContainer = document.createElement('div');
  spanishContainer.style.position = 'relative';
  spanishContainer.style.padding = '0.75rem 1rem';
  spanishContainer.style.border = '1px solid #d1d5db';
  spanishContainer.style.borderRadius = '0.5rem';
  spanishContainer.style.background = '#f9fafb';
  spanishContainer.style.minHeight = '84px';
  spanishContainer.style.cursor = 'text';
  spanishContainer.tabIndex = 0;
  spanishContainer.style.outline = 'none';
  mainColumn.appendChild(spanishContainer);

  const spanishDisplay = document.createElement('div');
  spanishDisplay.style.fontSize = '1.35rem';
  spanishDisplay.style.lineHeight = '2rem';
  spanishDisplay.style.whiteSpace = 'pre-wrap';
  spanishDisplay.style.color = '#9ca3af';
  spanishContainer.appendChild(spanishDisplay);

  const cursor = document.createElement('span');
  cursor.textContent = '';
  cursor.style.display = 'inline-block';
  cursor.style.width = '2px';
  cursor.style.background = '#2563eb';
  cursor.style.margin = '0 0 -4px 0';
  cursor.style.height = '1.5rem';
  cursor.style.verticalAlign = 'baseline';
  cursor.style.animation = 'blink 1s steps(2, start) infinite';
  cursor.style.position = 'relative';

  const styleTag = document.createElement('style');
  styleTag.textContent = '@keyframes blink { to { visibility: hidden; } }';
  document.head.appendChild(styleTag);

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '0.75rem';
  controls.style.marginTop = '1.5rem';
  controls.style.flexWrap = 'wrap';
  mainColumn.appendChild(controls);

  const checkButton = document.createElement('button');
  checkButton.type = 'button';
  checkButton.textContent = 'Check progress';
  checkButton.style.padding = '0.5rem 1rem';
  checkButton.style.background = '#2563eb';
  checkButton.style.color = '#ffffff';
  checkButton.style.border = 'none';
  checkButton.style.borderRadius = '0.5rem';
  checkButton.style.cursor = 'pointer';
  controls.appendChild(checkButton);

  const skipButton = document.createElement('button');
  skipButton.type = 'button';
  skipButton.textContent = 'New sentence';
  skipButton.style.padding = '0.5rem 1rem';
  skipButton.style.background = '#e5e7eb';
  skipButton.style.color = '#111827';
  skipButton.style.border = 'none';
  skipButton.style.borderRadius = '0.5rem';
  skipButton.style.cursor = 'pointer';
  controls.appendChild(skipButton);

  const accentToggleLabel = document.createElement('label');
  accentToggleLabel.style.display = 'inline-flex';
  accentToggleLabel.style.alignItems = 'center';
  accentToggleLabel.style.gap = '0.5rem';
  accentToggleLabel.style.fontSize = '0.9rem';
  accentToggleLabel.style.color = '#374151';
  accentToggleLabel.style.padding = '0.35rem 0.5rem';
  accentToggleLabel.style.borderRadius = '0.5rem';
  accentToggleLabel.style.border = '1px solid #d1d5db';
  accentToggleLabel.style.background = '#f9fafb';

  const accentToggle = document.createElement('input');
  accentToggle.type = 'checkbox';
  accentToggle.id = 'accent-toggle';
  accentToggle.checked = true;

  const accentText = document.createElement('span');
  accentText.textContent = 'Accents required';

  accentToggleLabel.appendChild(accentToggle);
  accentToggleLabel.appendChild(accentText);
  controls.appendChild(accentToggleLabel);

  const feedback = document.createElement('p');
  feedback.style.minHeight = '1.5rem';
  feedback.style.marginTop = '1rem';
  feedback.style.color = '#1f2937';
  mainColumn.appendChild(feedback);

  const defaultBase = window.location.port === '8788'
    ? 'http://127.0.0.1:8787'
    : window.location.origin;
  const apiBase = window.__SPANISHTYPE_API_BASE__ || defaultBase;

  const playerName = localStorage.getItem('spanishType.playerName') || promptForPlayerName();
  localStorage.setItem('spanishType.playerName', playerName);
  let sessionScore = loadScore();

  const scoreboardTitle = document.createElement('h3');
  scoreboardTitle.textContent = 'Scoreboard';
  scoreboardTitle.style.margin = '0 0 0.75rem 0';
  scoreboardTitle.style.fontSize = '1.05rem';
  scoreboardTitle.style.color = '#111827';
  sidebar.appendChild(scoreboardTitle);

  const playerRow = document.createElement('div');
  playerRow.style.display = 'flex';
  playerRow.style.justifyContent = 'space-between';
  playerRow.style.alignItems = 'center';
  playerRow.style.marginBottom = '0.5rem';
  sidebar.appendChild(playerRow);

  const playerNameEl = document.createElement('span');
  playerNameEl.textContent = playerName;
  playerNameEl.style.fontWeight = '600';
  playerNameEl.style.color = '#1f2937';
  playerRow.appendChild(playerNameEl);

  const scoreValueEl = document.createElement('span');
  scoreValueEl.textContent = `${sessionScore} pts`;
  scoreValueEl.style.fontVariantNumeric = 'tabular-nums';
  scoreValueEl.style.color = sessionScore >= 0 ? '#047857' : '#b91c1c';
  playerRow.appendChild(scoreValueEl);

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'Reset score';
  resetButton.style.fontSize = '0.8rem';
  resetButton.style.padding = '0.35rem 0.5rem';
  resetButton.style.background = '#e5e7eb';
  resetButton.style.border = 'none';
  resetButton.style.borderRadius = '0.4rem';
  resetButton.style.cursor = 'pointer';
  sidebar.appendChild(resetButton);

  const tip = document.createElement('p');
  tip.textContent = 'Correct character: +1 • Incorrect or missing: −1';
  tip.style.fontSize = '0.85rem';
  tip.style.color = '#4b5563';
  tip.style.marginTop = '1rem';
  tip.style.marginBottom = '0';
  sidebar.appendChild(tip);

  let currentSentence = null;
  let charSpans = [];
  let charStates = [];
  let currentIndex = 0;
  let isLoading = false;
  let enforceAccents = true;
  let hasScoredCurrent = false;

  const colors = {
    pending: '#9ca3af',
    correct: '#111827',
    incorrect: '#b91c1c',
  };

  const updateScoreDisplay = () => {
    scoreValueEl.textContent = `${sessionScore} pts`;
    scoreValueEl.style.color = sessionScore >= 0 ? '#047857' : '#b91c1c';
  };
  updateScoreDisplay();

  const setLoading = (loading) => {
    isLoading = loading;
    checkButton.disabled = loading;
    skipButton.disabled = loading;
    if (loading) {
      checkButton.style.opacity = '0.6';
      skipButton.style.opacity = '0.6';
      status.textContent = 'Loading a sentence…';
      englishBlock.textContent = '…';
      feedback.textContent = '';
      spanishDisplay.textContent = '';
      charSpans = [];
      charStates = [];
      currentIndex = 0;
    } else {
      checkButton.style.opacity = '1';
      skipButton.style.opacity = '1';
    }
  };

  const updateCursor = () => {
    if (!spanishDisplay.contains(cursor)) {
      spanishDisplay.appendChild(cursor);
    }
    const nextNode = charSpans[currentIndex] ?? null;
    if (nextNode) {
      spanishDisplay.insertBefore(cursor, nextNode);
    } else {
      spanishDisplay.appendChild(cursor);
    }
  };

  const buildSpanishDisplay = (sentence) => {
    spanishDisplay.innerHTML = '';
    charSpans = [];
    charStates = new Array(sentence.length).fill('pending');
    currentIndex = 0;

    for (let i = 0; i < sentence.length; i += 1) {
      const char = sentence[i];
      const span = document.createElement('span');
      span.textContent = char === ' ' ? '\u00A0' : char;
      span.dataset.expected = char;
      span.dataset.entered = '';
      span.style.color = colors.pending;
      span.style.transition = 'color 0.1s ease';
      spanishDisplay.appendChild(span);
      charSpans.push(span);
    }

    updateCursor();
  };

  const handleCharacter = (char) => {
    if (!currentSentence || isLoading) return;
    if (currentIndex >= charSpans.length) return;

    const expected = currentSentence.spanish[currentIndex];
    const span = charSpans[currentIndex];

    const normalizedExpected = normalizeForComparison(expected, enforceAccents);
    const normalizedChar = normalizeForComparison(char, enforceAccents);

    if (normalizedChar === normalizedExpected) {
      span.style.color = colors.correct;
      charStates[currentIndex] = 'correct';
    } else {
      span.style.color = colors.incorrect;
      charStates[currentIndex] = 'incorrect';
    }

    span.dataset.entered = char;

    currentIndex += 1;
    updateCursor();
  };

  const handleBackspace = () => {
    if (!currentSentence || isLoading) return;
    if (currentIndex === 0) return;

    currentIndex -= 1;
    const span = charSpans[currentIndex];
    span.style.color = colors.pending;
    span.dataset.entered = '';
    charStates[currentIndex] = 'pending';
    updateCursor();
  };

  const handleKeyDown = (event) => {
    if (!currentSentence) return;

    if (event.key === 'Backspace') {
      event.preventDefault();
      handleBackspace();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      const score = evaluateAnswer();
      if (typeof score === 'number') {
        setTimeout(() => {
          if (!isLoading) {
            fetchSentence().catch((error) => {
              console.error('Failed to fetch sentence', error);
            });
          }
        }, 1000);
      }
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing) {
      event.preventDefault();
      handleCharacter(event.key);
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  spanishContainer.addEventListener('click', () => {
    spanishContainer.focus({ preventScroll: true });
  });

  const evaluateAnswer = () => {
    if (!currentSentence) return null;
    if (hasScoredCurrent) {
      feedback.textContent = 'You have already scored this sentence. Fetch a new one to keep going.';
      feedback.style.color = '#2563eb';
      return null;
    }

    const total = charStates.length;
    const typed = currentIndex;
    const remaining = total - typed;

    if (remaining > 0) {
      for (let i = currentIndex; i < total; i += 1) {
        charStates[i] = 'incorrect';
        charSpans[i].style.color = colors.incorrect;
        if (!charSpans[i].dataset.entered || charSpans[i].dataset.entered.length === 0) {
          charSpans[i].dataset.entered = '';
        }
      }
      currentIndex = total;
      updateCursor();
    }

    const incorrect = charStates.filter((state) => state === 'incorrect').length;
    const correct = charStates.filter((state) => state === 'correct').length;
    const sentenceScore = correct - incorrect;
    sessionScore += sentenceScore;
    saveScore(sessionScore);
    updateScoreDisplay();
    hasScoredCurrent = true;

    if (incorrect === 0) {
      feedback.textContent = `✅ Perfect! +${sentenceScore} pts.`;
      feedback.style.color = '#047857';
    } else {
      const sign = sentenceScore >= 0 ? '+' : '';
      feedback.textContent = `❌ ${incorrect} character${incorrect === 1 ? ' is' : 's are'} off. Score: ${sign}${sentenceScore} pts.`;
      feedback.style.color = '#b91c1c';
    }

    return sentenceScore;
  };

  const fetchSentence = async () => {
    if (isLoading) return;
    setLoading(true);
    hasScoredCurrent = false;

    try {
      const response = await fetch(`${apiBase}/api/sentences/random`, {
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = await response.json();
      currentSentence = payload;
      englishBlock.textContent = payload.english;
      const meta = [`ID: ${payload.id}`];
      if (payload.difficulty) meta.push(`Difficulty: ${payload.difficulty}`);
      status.textContent = meta.join(' • ');
      buildSpanishDisplay(payload.spanish);
      feedback.textContent = 'Start typing the Spanish sentence.';
      feedback.style.color = '#1f2937';
      spanishContainer.focus({ preventScroll: true });
    } catch (error) {
      currentSentence = null;
      englishBlock.textContent = '—';
      spanishDisplay.textContent = '—';
      status.textContent = 'Could not load a sentence. Retry in a moment.';
      feedback.textContent = error instanceof Error ? error.message : String(error);
      feedback.style.color = '#b91c1c';
    } finally {
      setLoading(false);
    }
  };

  checkButton.addEventListener('click', () => {
    const score = evaluateAnswer();
    if (typeof score === 'number') {
      setTimeout(() => {
        if (!isLoading) {
          fetchSentence().catch((error) => {
            console.error('Failed to fetch sentence', error);
          });
        }
      }, 1000);
    }
  });
  skipButton.addEventListener('click', () => {
    fetchSentence().catch((error) => {
      console.error('Failed to fetch sentence', error);
    });
  });

  accentToggle.addEventListener('change', () => {
    enforceAccents = accentToggle.checked;
    accentText.textContent = enforceAccents ? 'Accents required' : 'Accents optional';
    feedback.textContent = enforceAccents
      ? 'Accents must match exactly.'
      : 'Accent-insensitive mode: á == a, ñ == n, etc.';
    feedback.style.color = '#2563eb';

    if (currentSentence) {
      for (let i = 0; i < currentIndex; i += 1) {
        const expected = currentSentence.spanish[i];
        const normalizedExpected = normalizeForComparison(expected, enforceAccents);
        const stored = charSpans[i].dataset.entered;
        let currentChar = stored && stored.length > 0 ? stored : expected;
        if (!stored || stored.length === 0) {
          currentChar = charStates[i] === 'pending' ? expected : '';
        }
        const normalizedActual = normalizeForComparison(currentChar, enforceAccents);
        const isCorrect = normalizedActual === normalizedExpected;
        charStates[i] = isCorrect ? 'correct' : 'incorrect';
        charSpans[i].style.color = isCorrect ? colors.correct : colors.incorrect;
      }
      updateCursor();
    }
  });

  resetButton.addEventListener('click', () => {
    sessionScore = 0;
    saveScore(sessionScore);
    updateScoreDisplay();
    feedback.textContent = 'Score reset for this session.';
    feedback.style.color = '#2563eb';
  });

  fetchSentence().catch((error) => {
    console.error('Failed to fetch initial sentence', error);
  });
});
