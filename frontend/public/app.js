// SpanishType vanilla frontend: fetch a random sentence and let the user type the Spanish version.

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = '';

  const title = document.createElement('h1');
  title.textContent = 'SpanishType';
  root.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.textContent = 'Type the Spanish translation for the sentence shown below.';
  root.appendChild(subtitle);

  const status = document.createElement('p');
  status.textContent = 'Loading a sentence…';
  root.appendChild(status);

  const englishLabel = document.createElement('h2');
  englishLabel.textContent = 'English';
  englishLabel.style.marginBottom = '0.25rem';
  root.appendChild(englishLabel);

  const englishBlock = document.createElement('blockquote');
  englishBlock.style.fontSize = '1.25rem';
  englishBlock.style.marginTop = '0';
  englishBlock.style.marginBottom = '1.5rem';
  englishBlock.textContent = '…';
  root.appendChild(englishBlock);

  const inputLabel = document.createElement('label');
  inputLabel.textContent = 'Spanish answer';
  inputLabel.setAttribute('for', 'answer');
  inputLabel.style.display = 'block';
  inputLabel.style.marginBottom = '0.5rem';
  root.appendChild(inputLabel);

  const answerInput = document.createElement('textarea');
  answerInput.id = 'answer';
  answerInput.rows = 3;
  answerInput.style.width = '100%';
  answerInput.style.fontSize = '1rem';
  answerInput.style.padding = '0.5rem';
  root.appendChild(answerInput);

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '0.75rem';
  controls.style.marginTop = '0.75rem';
  root.appendChild(controls);

  const checkButton = document.createElement('button');
  checkButton.type = 'button';
  checkButton.textContent = 'Check answer';
  controls.appendChild(checkButton);

  const skipButton = document.createElement('button');
  skipButton.type = 'button';
  skipButton.textContent = 'New sentence';
  controls.appendChild(skipButton);

  const feedback = document.createElement('p');
  feedback.style.minHeight = '1.5rem';
  feedback.style.marginTop = '1rem';
  feedback.style.color = '#1f2937';
  root.appendChild(feedback);

  let currentSentence = null;
  let isLoading = false;

  const setLoading = (loading) => {
    isLoading = loading;
    checkButton.disabled = loading;
    skipButton.disabled = loading;
    answerInput.disabled = loading;
    if (loading) {
      status.textContent = 'Loading a sentence…';
      englishBlock.textContent = '…';
    }
  };

  const normalize = (value) => value.trim().replace(/\s+/g, ' ');

  const evaluateAnswer = () => {
    if (!currentSentence) return;
    const target = normalize(currentSentence.spanish);
    const attempt = normalize(answerInput.value);

    if (!attempt) {
      feedback.textContent = 'Type your answer before checking!';
      feedback.style.color = '#b45309';
      return;
    }

    const isCorrect = attempt.localeCompare(target, 'es', { sensitivity: 'base' }) === 0;

    if (isCorrect) {
      feedback.textContent = '✅ Correct! Nice work.';
      feedback.style.color = '#047857';
    } else {
      feedback.textContent = `❌ Close! Correct answer: “${currentSentence.spanish}”.`;
      feedback.style.color = '#b91c1c';
    }
  };

  const apiBase = window.__SPANISHTYPE_API_BASE__
    || (window.location.port === '8788' ? 'http://127.0.0.1:8787' : '');

  const fetchSentence = async () => {
    if (isLoading) return;
    setLoading(true);
    feedback.textContent = '';
    feedback.style.color = '#1f2937';
    answerInput.value = '';

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
      answerInput.disabled = false;
      answerInput.focus();
    } catch (error) {
      currentSentence = null;
      englishBlock.textContent = '—';
      status.textContent = 'Could not load a sentence. Retry in a moment.';
      feedback.textContent = error instanceof Error ? error.message : String(error);
      feedback.style.color = '#b91c1c';
    } finally {
      setLoading(false);
    }
  };

  checkButton.addEventListener('click', evaluateAnswer);
  skipButton.addEventListener('click', fetchSentence);
  answerInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      evaluateAnswer();
    }
  });

  fetchSentence().catch((error) => {
    console.error('Failed to fetch initial sentence', error);
  });
});
