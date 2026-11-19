/* Presentation animation and recorded-case exploration. */
const pageOptions = new URLSearchParams(window.location.search);
const isDraft = pageOptions.get('draft') === '1';
document.documentElement.classList.toggle('is-draft', isDraft);
const bindingFallbacks = new WeakMap();
let studyData;

const keyMomentVideo = document.querySelector('#key-moment-video');
const keyMomentChapters = document.querySelector('.case-video-chapters');
let keyMomentPendingSeek;
function seekKeyMoment(time) {
  if (keyMomentPendingSeek) keyMomentVideo.removeEventListener('loadedmetadata', keyMomentPendingSeek);
  const seek = () => {
    keyMomentPendingSeek = null;
    const limit = Number.isFinite(keyMomentVideo.duration) ? keyMomentVideo.duration : Infinity;
    keyMomentVideo.currentTime = Math.min(time, limit);
  };
  if (keyMomentVideo.readyState > 0) seek();
  else {
    keyMomentPendingSeek = seek;
    keyMomentVideo.addEventListener('loadedmetadata', seek, { once: true });
  }
}
if (keyMomentVideo && keyMomentChapters) {
  let hasStarted = false;
  let hasCompleted = false;
  let resumeWhenVisible = false;
  let visibleRatio = 0;
  keyMomentVideo.pause();
  keyMomentVideo.muted = true;
  keyMomentVideo.controls = false;
  keyMomentChapters.hidden = false;

  function updateKeyMomentVisibility(ratio) {
    visibleRatio = ratio;
    if (document.hidden || ratio < 0.2) {
      if (!keyMomentVideo.paused && !keyMomentVideo.ended) {
        resumeWhenVisible = true;
        keyMomentVideo.pause();
      }
      return;
    }
    if (ratio >= 0.65 && !hasCompleted && (!hasStarted || resumeWhenVisible)) {
      resumeWhenVisible = false;
      keyMomentVideo.play().catch(() => {});
    }
  }

  keyMomentVideo.addEventListener('play', () => { hasStarted = true; });
  keyMomentVideo.addEventListener('ended', () => {
    hasCompleted = true;
    resumeWhenVisible = false;
    keyMomentVideo.controls = true;
  });
  document.addEventListener('visibilitychange', () => updateKeyMomentVisibility(visibleRatio));
  if ('IntersectionObserver' in window) {
    const videoVisibility = new IntersectionObserver(entries => {
      updateKeyMomentVisibility(entries[0].intersectionRatio);
    }, { threshold: [0, 0.2, 0.65] });
    videoVisibility.observe(keyMomentVideo);
  } else {
    const checkVideoVisibility = () => {
      const bounds = keyMomentVideo.getBoundingClientRect();
      const height = Math.max(0, Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0));
      updateKeyMomentVisibility(bounds.height ? height / bounds.height : 0);
    };
    window.addEventListener('scroll', checkVideoVisibility, { passive: true });
    window.addEventListener('resize', checkVideoVisibility);
    checkVideoVisibility();
  }

  function toggleKeyMomentPlayback() {
    resumeWhenVisible = false;
    if (keyMomentVideo.paused) keyMomentVideo.play().catch(() => {});
    else keyMomentVideo.pause();
  }
  keyMomentVideo.addEventListener('click', () => {
    if (!keyMomentVideo.controls) toggleKeyMomentPlayback();
  });
  keyMomentVideo.addEventListener('keydown', event => {
    if (!keyMomentVideo.controls && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      toggleKeyMomentPlayback();
    }
  });
  keyMomentChapters.querySelectorAll('[data-video-time]').forEach(button => {
    button.addEventListener('click', () => {
      hasStarted = true;
      resumeWhenVisible = false;
      keyMomentVideo.pause();
      seekKeyMoment(Number(button.dataset.videoTime));
    });
  });
}

function readValue(data, path) {
  return path.split('.').reduce((value, key) => value == null ? undefined : value[key], data);
}
function displayValue(value, element) {
  if (value == null) return '—';
  let text = element.dataset.format === 'integer' && Number.isInteger(value)
    ? value.toLocaleString('en-US') : String(value);
  return (element.dataset.prefix || '') + text + (element.dataset.suffix || '');
}
function bindData(scope = document) {
  const elements = [...scope.querySelectorAll('[data-bind]')];
  if (scope.matches?.('[data-bind]')) elements.unshift(scope);
  elements.forEach(element => {
    const value = readValue(studyData, element.dataset.bind);
    const text = displayValue(value, element);
    if (!bindingFallbacks.has(element)) {
      bindingFallbacks.set(element, element.textContent.trim());
      if (isDraft && element.textContent.trim() !== text) {
        console.warn('Data binding mismatch:', element.dataset.bind, element.textContent.trim(), text);
      }
    }
    element.textContent = text;
    element.classList.toggle('is-pending', value == null);
  });
  scope.querySelectorAll('[data-bind-width]').forEach(element => {
    const value = readValue(studyData, element.dataset.bindWidth);
    element.hidden = value == null;
    if (value != null && Number(value) >= 0 && Number(value) <= 100) element.style.width = value + '%';
  });
  scope.querySelectorAll('[data-bind-label]').forEach(element => {
    const label = element.dataset.bindLabel.replace(/\{([^}]+)\}/g, (_, path) => {
      const value = readValue(studyData, path);
      return value == null ? '—' : String(value);
    });
    element.setAttribute('aria-label', label);
  });
}

const heroVideo = document.querySelector('#hero-video');
const heroButton = document.querySelector('.hero-playback');
if (heroVideo && heroButton) {
  const requestedHero = pageOptions.get('hero');
  const options = document.querySelector('#hero-options').content.querySelectorAll('video[data-hero]');
  const selectedHero = Array.from(options).find(option => option.dataset.hero === requestedHero);
  if (selectedHero) {
    heroVideo.poster = selectedHero.getAttribute('poster');
    heroVideo.src = selectedHero.getAttribute('src');
    heroVideo.setAttribute('aria-label', selectedHero.getAttribute('aria-label'));
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let wantsPlayback = !reducedMotion.matches;
  let isVisible = !('IntersectionObserver' in window);

  function updateHeroButton() {
    const state = heroVideo.ended ? 'replay' : heroVideo.paused ? 'play' : 'pause';
    const label = { play: 'Play animation', pause: 'Pause animation', replay: 'Replay animation' }[state];
    heroButton.dataset.state = state;
    heroButton.setAttribute('aria-label', label);
    heroButton.title = label;
  }

  function updateHeroPlayback() {
    if (wantsPlayback && isVisible && !document.hidden && !heroVideo.ended) {
      heroVideo.play().catch(error => {
        if (error.name === 'NotAllowedError') wantsPlayback = false;
        updateHeroButton();
      });
    } else {
      heroVideo.pause();
    }
  }

  heroVideo.controls = false;
  heroButton.hidden = false;
  updateHeroButton();
  heroVideo.addEventListener('play', updateHeroButton);
  heroVideo.addEventListener('pause', updateHeroButton);
  heroVideo.addEventListener('ended', () => {
    wantsPlayback = false;
    updateHeroButton();
  });
  heroButton.addEventListener('click', () => {
    wantsPlayback = heroVideo.paused || heroVideo.ended;
    if (heroVideo.ended) heroVideo.currentTime = 0;
    updateHeroPlayback();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      wantsPlayback = false;
      heroVideo.pause();
    }
  });
  document.addEventListener('visibilitychange', updateHeroPlayback);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.intersectionRatio >= 0.5;
      updateHeroPlayback();
    }, { threshold: 0.5 });
    observer.observe(heroVideo);
  } else {
    updateHeroPlayback();
  }
}

const showcaseVideo = document.querySelector('#showcase-video');
if (showcaseVideo) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let wantsPlayback = !reducedMotion.matches;
  let visibleRatio = 0;
  let visibilityPause = false;

  function pauseShowcaseForVisibility() {
    if (!showcaseVideo.paused) {
      visibilityPause = true;
      showcaseVideo.pause();
    }
  }

  function updateShowcaseVisibility(ratio = visibleRatio) {
    visibleRatio = ratio;
    if (document.hidden || ratio < 0.2) {
      pauseShowcaseForVisibility();
    } else if (ratio >= 0.65 && wantsPlayback && !showcaseVideo.ended) {
      showcaseVideo.play().catch(() => {});
    }
  }

  showcaseVideo.pause();
  showcaseVideo.muted = true;
  showcaseVideo.controls = false;
  showcaseVideo.addEventListener('play', () => { wantsPlayback = true; });
  showcaseVideo.addEventListener('pause', () => {
    if (visibilityPause) visibilityPause = false;
    else wantsPlayback = false;
  });
  showcaseVideo.addEventListener('ended', () => {
    wantsPlayback = false;
    showcaseVideo.controls = true;
  });
  function toggleShowcasePlayback() {
    visibilityPause = false;
    wantsPlayback = showcaseVideo.paused;
    if (wantsPlayback) showcaseVideo.play().catch(() => {});
    else showcaseVideo.pause();
  }
  showcaseVideo.addEventListener('click', () => {
    if (!showcaseVideo.controls) toggleShowcasePlayback();
  });
  showcaseVideo.addEventListener('keydown', event => {
    if (!showcaseVideo.controls && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      toggleShowcasePlayback();
    }
  });
  document.addEventListener('visibilitychange', () => updateShowcaseVisibility());
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      wantsPlayback = false;
      pauseShowcaseForVisibility();
    }
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      updateShowcaseVisibility(entry.intersectionRatio);
    }, { threshold: [0, 0.2, 0.65] });
    observer.observe(showcaseVideo);
  } else {
    const checkVisibility = () => {
      const bounds = showcaseVideo.getBoundingClientRect();
      const height = Math.max(0, Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0));
      updateShowcaseVisibility(bounds.height ? height / bounds.height : 0);
    };
    window.addEventListener('scroll', checkVisibility, { passive: true });
    window.addEventListener('resize', checkVisibility);
    checkVisibility();
  }
}

const header = document.querySelector('#site-header');
const menuToggle = document.querySelector('.mobile-menu-toggle');
const menu = document.querySelector('#navigation-links');
const dialog = document.querySelector('#detail-dialog');
let dialogTrigger = null;
function closeMenu() {
  menuToggle.setAttribute('aria-expanded', 'false');
  menu.classList.remove('open');
}
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(open));
  menu.classList.toggle('open', open);
});
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    closeMenu(); menuToggle.focus();
  }
});
if ('IntersectionObserver' in window) {
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('motion-ready');
    const reveals = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); reveals.unobserve(entry.target); }
      });
    }, { threshold: 0.06 });
    document.querySelectorAll('[data-reveal]').forEach(element => reveals.observe(element));
  }
}

const gallery = document.querySelector('#highlight-track');
const cards = Array.from(gallery.querySelectorAll('.highlight-card'));
const previous = document.querySelector('#gallery-prev');
const next = document.querySelector('#gallery-next');
let galleryIndex = 0;
function updateGallery() {
  const maximum = gallery.scrollWidth - gallery.clientWidth;
  const atEnd = maximum > 4 && gallery.scrollLeft >= maximum - 4;
  const start = parseFloat(getComputedStyle(gallery).paddingLeft);
  const bounds = gallery.getBoundingClientRect();
  const distances = cards.map(card => Math.abs(card.getBoundingClientRect().left - bounds.left - start));
  galleryIndex = atEnd ? cards.length - 1 : distances.indexOf(Math.min.apply(null, distances));
  previous.disabled = gallery.scrollLeft < 4;
  next.disabled = maximum <= 4 || atEnd;
  document.querySelector('#gallery-current').textContent = String(galleryIndex + 1);
}
function moveGallery(direction) {
  const index = Math.min(cards.length - 1, Math.max(0, galleryIndex + direction));
  const padding = parseFloat(getComputedStyle(gallery).paddingLeft);
  gallery.scrollTo({ left: cards[index].offsetLeft - padding, behavior: 'smooth' });
}
previous.addEventListener('click', () => moveGallery(-1));
next.addEventListener('click', () => moveGallery(1));
gallery.addEventListener('scroll', updateGallery, { passive: true });
gallery.addEventListener('keydown', event => {
  if (event.target === gallery && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); moveGallery(event.key === 'ArrowRight' ? 1 : -1);
  }
});
window.addEventListener('resize', updateGallery);
updateGallery();

// Keep the approved static artwork and add optional exploration on top.
const architectureFigure = document.querySelector('#execution-loop');
if (architectureFigure) {
  const diagram = architectureFigure.querySelector('.system-diagram');
  const buttons = [...architectureFigure.querySelectorAll('[data-architecture-node]')];
  const traces = [...diagram.querySelectorAll('[data-trace]')];
  const title = architectureFigure.querySelector('#architecture-detail-title');
  const body = architectureFigure.querySelector('#architecture-detail-body');
  const reset = architectureFigure.querySelector('.architecture-reset');
  const modules = {
    llm: {
      title: 'LLM planner · Plan and review',
      body: 'The task and execution context inform high-level decisions. The Harness returns feedback for the next decision.',
      links: ['task-planner', 'planner-harness'],
      related: ['harness']
    },
    harness: {
      title: 'Harness · Coordinate the loop',
      body: 'Turn decisions into policy instructions, monitor feedback, and use bounded tools when needed before handing execution back.',
      links: ['planner-harness', 'harness-policy', 'executor-feedback', 'bounded-control'],
      related: ['llm', 'vla', 'executor']
    },
    vla: {
      title: 'Frozen VLA · Turn instructions into actions',
      body: 'Receive the current instruction and generate action chunks. New observations return through the same connection; policy weights stay fixed.',
      links: ['harness-policy', 'policy-executor'],
      related: ['harness', 'executor']
    },
    executor: {
      title: 'Executor · Act and report back',
      body: 'Execute actions and return observations and progress feedback. Bounded direct tools provide a separate route for critical intervention.',
      links: ['policy-executor', 'executor-feedback', 'bounded-control'],
      related: ['vla', 'harness']
    }
  };
  let selected = null;
  let hovered = null;
  let focused = null;
  function renderArchitecture() {
    const active = hovered || focused || selected;
    const module = modules[active];
    diagram.dataset.activeNode = active || '';
    buttons.forEach(button => {
      const key = button.dataset.architectureNode;
      button.classList.toggle('is-active', key === active);
      button.classList.toggle('is-related', module?.related.includes(key) || false);
      button.setAttribute('aria-pressed', String(key === selected));
    });
    traces.forEach(path => path.classList.toggle('is-lit', module?.links.includes(path.dataset.trace) || false));
    title.textContent = module?.title || 'One connected loop.';
    body.textContent = module?.body || 'Hover to preview. Select a module to keep its connections highlighted.';
    reset.disabled = !active;
  }
  buttons.forEach(button => {
    const key = button.dataset.architectureNode;
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hovered = key; renderArchitecture();
    });
    button.addEventListener('pointerleave', () => { hovered = null; renderArchitecture(); });
    button.addEventListener('focus', () => { hovered = null; focused = key; renderArchitecture(); });
    button.addEventListener('blur', () => { focused = null; renderArchitecture(); });
    button.addEventListener('click', () => { selected = key; renderArchitecture(); });
  });
  function resetArchitecture() {
    selected = hovered = focused = null;
    renderArchitecture();
  }
  reset.addEventListener('click', resetArchitecture);
  architectureFigure.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); resetArchitecture(); }
  });
  if ('IntersectionObserver' in window) {
    const visibility = new IntersectionObserver(entries => {
      diagram.toggleAttribute('data-offscreen', !entries[0].isIntersecting);
    });
    visibility.observe(diagram);
  }
  diagram.classList.add('architecture-interactive');
  reset.hidden = false;
  renderArchitecture();
}

let recordedCases = [];
let activeCase = 'A07-03';
let activeEvent = 0;
const eventTabs = document.querySelector('#event-tabs');
function currentCase() { return recordedCases.find(item => item.id === activeCase); }
function renderCaseComparison(item) {
  const story = item.comparison_story;
  const number = value => value.toLocaleString('en-US');
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function eventButton(index, className) {
    const button = element('button', className);
    button.type = 'button';
    button.dataset.eventIndex = index;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectEvent(index));
    return button;
  }
  function symbol(text, className) {
    const node = element('span', className, text);
    node.setAttribute('aria-hidden', 'true');
    return node;
  }
  const heading = element('div', 'comparison-heading');
  heading.append(element('span', '', 'Failure → Intervention → Success'), element('span', '', story.cohort_label));
  const contextNote = element('p', 'comparison-context', story.context_note);
  const lanes = element('div', 'comparison-lanes');
  lanes.style.setProperty('--case-stages', story.milestones.length);
  function lane(className, title, subtitle) {
    const row = element('div', 'comparison-lane ' + className);
    const label = element('div', 'lane-label');
    label.append(element('strong', '', title), element('span', '', subtitle));
    const track = element('div', 'lane-track');
    row.append(label, track);
    lanes.append(row);
    return track;
  }
  const reference = lane('reference-lane', story.reference_label, story.reference_subtitle);
  const context = element('div', 'reference-context');
  context.append(element('span', 'lane-state', 'Original failure'), element('h4', '', story.reference_title), element('p', '', story.reference_body));
  const failed = element('div', 'reference-outcome');
  failed.append(element('span', 'event-step', 'Step ' + number(story.reference_step)), symbol('−', 'outcome-symbol'), element('strong', '', 'Not completed'), element('p', '', 'No task success recorded.'));
  reference.append(context, failed);
  const revised = lane('revised-lane', story.current_label, story.current_subtitle);
  story.milestones.forEach(milestone => {
    const card = eventButton(milestone.event_index, 'case-event-card ' + milestone.variant + '-event');
    card.append(
      element('span', 'event-step', milestone.step_label),
      element('span', 'event-card-kind', milestone.phase),
      element('strong', '', milestone.title),
      element('span', 'event-card-body', milestone.body),
      symbol(milestone.variant === 'outcome' ? '✓' : '+', 'event-open')
    );
    revised.append(card);
  });
  const extraEvents = element('div', 'case-extra-events');
  extraEvents.setAttribute('aria-label', 'Additional recorded events');
  story.extra_events.forEach(extra => {
    const button = eventButton(extra.event_index, 'case-extra-event');
    button.append(document.createTextNode(extra.label + ' '), symbol('+', ''));
    extraEvents.append(button);
  });
  eventTabs.replaceChildren(heading, contextNote, lanes, extraEvents, element('p', 'comparison-scale', story.step_note));
}
function selectEvent(index) {
  const event = currentCase()?.events[index];
  if (!event) return;
  activeEvent = index;
  eventTabs.querySelectorAll('[data-event-index]').forEach(button => {
    const selected = Number(button.dataset.eventIndex) === index;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const stepLabel = event.end_step
    ? 'Steps ' + event.step.toLocaleString('en-US') + '–' + event.end_step.toLocaleString('en-US')
    : 'Step ' + event.step.toLocaleString('en-US');
  document.querySelector('#event-kicker').textContent = event.kind + ' · ' + stepLabel;
  document.querySelector('#event-title').textContent = event.title;
  document.querySelector('#event-body').textContent = event.body;
  const quote = document.querySelector('#event-quote');
  quote.textContent = event.quote ? '“' + event.quote + '”' : '';
  quote.hidden = !event.quote;
}
function selectCase(id) {
  const item = recordedCases.find(entry => entry.id === id);
  if (!item) return;
  activeCase = id;
  document.querySelectorAll('[data-case]').forEach(button => {
    const selected = button.dataset.case === id;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelector('#case-task').textContent = item.task;
  document.querySelector('#case-heading').innerHTML = item.title;
  document.querySelector('#case-description').textContent = item.description;
  document.querySelector('#case-reference').textContent = item.reference;
  const facts = document.querySelector('.case-facts');
  facts.replaceChildren();
  item.facts.forEach((fact, index) => {
    const wrapper = document.createElement('span');
    const value = document.createElement('strong');
    if (index === 0) value.id = 'case-steps';
    value.textContent = fact.value;
    const label = document.createElement('span');
    label.textContent = fact.label;
    wrapper.append(value, label);
    facts.append(wrapper);
  });
  renderCaseComparison(item);
  selectEvent(item.comparison_story.default_event);
}
document.querySelectorAll('[data-case]').forEach(button => button.addEventListener('click', () => selectCase(button.dataset.case)));

const details = {
  "selected-protocol": {"eyebrow": "RoboCasa365 · selected 200-scene view", "title": "The selected scenes.<br> Matched to the policy.", "content": "<p>This selected view contains <span data-bind=\"heldout200.episodes\">200</span> distinct held-out scenes from <span data-bind=\"heldout200.tasks\">50</span> tasks in <span data-bind=\"heldout200.scene_batches\">4</span> scene batches. The policy-only reference is the matching scene subset of the accepted <span data-bind=\"protocol.episodes\">250</span>-episode evaluation. The selected harness results use the same frozen <span data-bind=\"protocol.policy\">Xiaomi-Robotics-1</span> with Harness <span data-bind=\"protocol.harness_version\">1.2.3.5</span> and <span data-bind=\"heldout200.llm\">GPT-6 Astra</span>.</p><ul class=\"dialog-list\"><li><strong>Matched outcomes.</strong> <span data-bind=\"heldout200.cells.both\">104</span> scenes succeed both ways, <span data-bind=\"heldout200.cells.harness_only\">37</span> only with the harness, <span data-bind=\"heldout200.cells.policy_only\">11</span> only with the policy, and <span data-bind=\"heldout200.cells.neither\">48</span> in neither run.</li><li><strong>Planning timeout.</strong> <span data-bind=\"heldout200.planning_timeout_overrides\">10</span> selected scenes use a <span data-bind=\"heldout200.planning_timeout_seconds\">600</span>-second planning timeout. This is a supplemental mixed-timeout view.</li><li><strong>Success.</strong> The environment decides the native outcome, not the language model.</li></ul><p class=\"dialog-paragraph\">These matched-scene counts describe observed outcomes. They do not isolate a single intervention or the effect of a planning-timeout change.</p>"},
  protocol: {"eyebrow": "RoboCasa365 · held-out split · Harness 1.2.3.5", "title": "The same episodes.<br> Run twice.", "content": "<p>The held-out split has <span data-bind=\"protocol.tasks\">50</span> tasks: <span data-bind=\"protocol.tasks_by_category.atomic\">18</span> atomic, <span data-bind=\"protocol.tasks_by_category.composite_seen\">16</span> composite-seen, and <span data-bind=\"protocol.tasks_by_category.composite_unseen\">16</span> composite-unseen. Each task is run in <span data-bind=\"protocol.scenes_per_task\">5</span> scenes, <span data-bind=\"protocol.episodes\">250</span> episodes in total. Every episode is run once with the frozen <span data-bind=\"protocol.policy\">Xiaomi-Robotics-1</span> policy alone and once with the same policy inside the harness, using <span data-bind=\"paired250.llm\">GPT-6 Sol</span>.</p><ul class=\"dialog-list\"><li><strong>Paired outcomes.</strong> <span data-bind=\"paired250.cells.both\">124</span> episodes succeed both ways, <span data-bind=\"paired250.cells.harness_only\">35</span> only with the harness, <span data-bind=\"paired250.cells.policy_only\">15</span> only without it, and <span data-bind=\"paired250.cells.neither\">76</span> in neither run.</li><li><strong>Success.</strong> Decided by the environment's own check, not by the language model.</li><li><strong>No task-specific help.</strong> No per-task memory, no exploration in advance, no per-task scripts.</li><li><strong>What the system can use.</strong> Camera images with depth, execution feedback, a file-reading tool, and bounded direct-control tools, in addition to rewording the instruction.</li></ul><p class=\"dialog-paragraph\">Paired counts show what changed between the two runs. They do not assign a cause to any single episode.</p>"},
  'case-scope': null
};
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
  const detail = details[button.dataset.open];
  if (!detail) return;
  dialogTrigger = button;
  document.querySelector('#dialog-eyebrow').textContent = detail.eyebrow;
  document.querySelector('#dialog-title').innerHTML = detail.title;
  document.querySelector('#dialog-content').innerHTML = detail.content;
  bindData(document.querySelector('#dialog-content'));
  dialog.showModal(); dialog.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}));
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
});
dialog.addEventListener('close', () => { document.body.style.overflow = ''; dialogTrigger?.focus({ preventScroll: true }); });

function renderCategoryChart() {
  const chart = document.querySelector('#task-rate-chart');
  const evaluation = studyData?.heldout200;
  if (!chart || !evaluation) return;
  const axisMin = Number(chart.dataset.axisMin);
  const axisMax = Number(chart.dataset.axisMax);
  const descriptions = [];
  evaluation.categories.forEach(category => {
    const group = chart.querySelector(`[data-task-category="${category.key}"]`);
    if (!group) return;
    const policyRate = category.policy_alone / category.total * 100;
    const harnessRate = category.with_harness / category.total * 100;
    [['policy', policyRate], ['harness', harnessRate]].forEach(([kind, rate]) => {
      const bar = group.querySelector(`.task-rate-bar.${kind}-bar`);
      const height = (rate - axisMin) / (axisMax - axisMin) * 100;
      bar.style.setProperty('--bar-height', Math.max(0, Math.min(100, height)) + '%');
      bar.querySelector('.task-rate-number').textContent = rate.toFixed(1);
    });
    group.querySelector('.task-scene-count').textContent = category.total + ' scenes';
    descriptions.push(`${category.label}: without Harness ${policyRate.toFixed(1)}%, with Harness ${harnessRate.toFixed(1)}%, on ${category.total} matched scenes`);
  });
  chart.setAttribute('aria-label', `Success rate by task group on a shared linear scale from ${axisMin} to ${axisMax} percent. ` + descriptions.join('. ') + '.');
}


function renderPolicies() {
  const rows = document.querySelector('#policy-rows');
  if (!rows) return;
  rows.replaceChildren();
  studyData.policies.forEach((policy, index) => {
    const row = document.createElement('div');
    row.className = 'policy-row';
    const heading = document.createElement('h4');
    heading.textContent = policy.name;
    const count = document.createElement('p');
    count.textContent = policy.episodes + ' episodes';
    row.append(heading, count);
    [['Policy alone', 'policy_percent', 'policy'], ['With the harness', 'harness_percent', 'harness']].forEach(([label, key, kind]) => {
      const bar = document.createElement('div');
      bar.className = 'paired-bar';
      const title = document.createElement('div');
      title.className = 'paired-bar-label';
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('strong');
      value.dataset.bind = 'policies.' + index + '.' + key;
      value.dataset.suffix = '%';
      value.textContent = policy[key] + '%';
      title.append(name, value);
      const track = document.createElement('div');
      track.className = 'bar-track';
      track.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('span');
      fill.className = 'bar-fill ' + kind + '-fill';
      fill.dataset.bindWidth = 'policies.' + index + '.' + key;
      track.append(fill);
      bar.append(title, track);
      row.append(bar);
    });
    rows.append(row);
  });
}

function updateResourceLinks() {
  document.querySelectorAll('[data-resource]').forEach(card => {
    const key = card.dataset.resource;
    const url = studyData.links[key];
    let available = false;
    if (typeof url === 'string' && url) {
      try { available = ['https:', 'http:'].includes(new URL(url, window.location.href).protocol); } catch { /* Keep an unavailable card inert. */ }
    }
    const replacement = document.createElement(available ? 'a' : 'div');
    replacement.className = card.className;
    replacement.dataset.resource = key;
    replacement.replaceChildren(...card.childNodes);
    if (available) {
      replacement.href = url;
      replacement.target = '_blank';
      replacement.rel = 'noopener';
      replacement.querySelector('.resource-link').textContent = (key === 'paper' ? 'Read the paper' : 'View the code') + ' ↗';
      replacement.querySelector('.resource-link').classList.remove('resource-unavailable');
    } else {
      replacement.setAttribute('aria-disabled', 'true');
      replacement.querySelector('.resource-link').textContent = 'Coming soon';
      replacement.querySelector('.resource-link').classList.add('resource-unavailable');
    }
    card.replaceWith(replacement);
  });
}

function applyStudyData(data, source) {
  studyData = data;
  recordedCases = data.cases;
  details['case-scope'] = data.case_scope;
  details.protocol.eyebrow = data.protocol.benchmark + ' · held-out split · Harness ' + data.protocol.harness_version;
  renderCategoryChart();
  renderPolicies();
  updateResourceLinks();
  bindData();
  selectCase(recordedCases.some(item => item.id === activeCase) ? activeCase : recordedCases[0].id);
  document.documentElement.dataset.studySource = source;
}
// The inline snapshot keeps the static page and case explorer usable offline.
// assets/study-data.json remains the canonical editable data source.
const fallbackStudyData = JSON.parse(document.querySelector('#study-data-fallback').textContent);
applyStudyData(fallbackStudyData, 'fallback');
fetch('assets/study-data.json?v=roboharness-zero-1')
  .then(response => { if (!response.ok) throw new Error('Study data unavailable'); return response.json(); })
  .then(data => {
    // An older cached data file must not replace the complete inline snapshot.
    if (Array.isArray(data.cases) && data.cases.length && data.cases.every(item => Array.isArray(item.comparison_story?.milestones))) {
      applyStudyData(data, 'file');
    }
  })
  .catch(() => { /* Retain the complete HTML snapshot when a request is unavailable. */ });
