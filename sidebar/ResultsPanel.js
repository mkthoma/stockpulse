import { isLikelyEnglishHeadline } from '../lib/isEnglishHeadline.js';

export class ResultsPanel {
  constructor() {
    this.panel        = document.querySelector('.results-panel');
    this.resultsText  = document.querySelector('.results-text');
    this.timelineRows = document.querySelector('.timeline-rows');
    this.errorBanner  = document.querySelector('.error-banner');
    this.idleState    = document.querySelector('.idle-state');
  }

  showAnswer(text) {
    this.idleState?.classList.add('hidden');
    this.hideError();

    if (this.resultsText) {
      this.resultsText.innerHTML = '';
      this.resultsText.appendChild(this._renderMarkdown(text));
    }
    this.panel?.classList.add('visible');
  }

  showTimeline(correlatedDays) {
    if (!this.timelineRows || !correlatedDays?.length) return;

    this.timelineRows.innerHTML = '';

    // Section label
    const label = document.createElement('div');
    label.className   = 'timeline-section-label';
    label.textContent = 'Daily Breakdown';
    this.timelineRows.appendChild(label);

    for (const day of correlatedDays) {
      const dirClass    = day.direction.toLowerCase();
      const sign        = day.change_pct > 0 ? '+' : '';
      const arrow       = day.direction === 'Up' ? '▲' : day.direction === 'Down' ? '▼' : '—';
      const isSignif    = Math.abs(day.change_pct) >= 1.5;

      const row = document.createElement('div');
      row.className = `day-row${isSignif ? ' significant' : ''}`;

      // Left column: date + price change stacked
      const metaEl = document.createElement('div');
      metaEl.className = 'day-meta';

      const dateEl = document.createElement('span');
      dateEl.className   = 'day-date';
      dateEl.textContent = String(day.date).slice(5); // MM-DD

      const changeEl = document.createElement('span');
      changeEl.className   = `day-change ${dirClass}`;
      changeEl.textContent = `${arrow} ${sign}${day.change_pct}%`;

      metaEl.appendChild(dateEl);
      metaEl.appendChild(changeEl);

      // Right column: up to 2 headlines, each truncated
      const headlinesEl = document.createElement('div');
      headlinesEl.className = 'day-headlines';

      const englishNews = (day.news ?? []).filter(a =>
        isLikelyEnglishHeadline(a.headline ?? '')
      );
      const topNews = englishNews.slice(0, 2);

      if (topNews.length > 0) {
        for (const article of topNews) {
          const raw = article.headline ?? '';
          const truncated = raw.length > 72 ? raw.slice(0, 70) + '…' : raw;
          const span = document.createElement('span');
          span.className   = 'day-headline-item';
          span.textContent = truncated;
          headlinesEl.appendChild(span);
        }
      } else {
        const span = document.createElement('span');
        span.className   = 'day-headline-item no-news';
        const hadAny = (day.news ?? []).length > 0;
        span.textContent = hadAny
          ? 'No English-language headlines for this day'
          : 'No news found';
        headlinesEl.appendChild(span);
      }

      row.appendChild(metaEl);
      row.appendChild(headlinesEl);
      this.timelineRows.appendChild(row);
    }

    this.timelineRows.classList.add('visible');
  }

  showError(message) {
    if (!this.errorBanner) return;
    this.errorBanner.textContent = `⚠ ${message}`;
    this.errorBanner.classList.add('visible');
  }

  hideError() {
    this.errorBanner?.classList.remove('visible');
  }

  reset() {
    this.panel?.classList.remove('visible');
    if (this.resultsText) this.resultsText.innerHTML = '';
    this.timelineRows?.classList.remove('visible');
    if (this.timelineRows) this.timelineRows.innerHTML = '';
    this.hideError();
    this.idleState?.classList.remove('hidden');
  }

  // ── Markdown renderer ──────────────────────────────────────────
  // Builds DOM nodes — no innerHTML, no XSS risk.
  // Each ## heading creates a .md-section card that wraps all content
  // until the next ## heading, giving each section a clean card look.

  _renderMarkdown(text) {
    const root = document.createElement('div');
    root.className = 'md-body';

    const lines = text.split('\n');
    let listEl    = null;
    let sectionEl = null; // current .md-section card

    // Helper: get the current content target (section card if open, else root)
    const target = () => sectionEl ?? root;

    for (const raw of lines) {
      const line = raw;

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        listEl = null;
        target().appendChild(document.createElement('hr'));
        continue;
      }

      // H2 — open a new section card
      if (line.startsWith('## ')) {
        listEl    = null;
        sectionEl = document.createElement('div');
        sectionEl.className = 'md-section';
        const h = document.createElement('h2');
        h.className = 'md-h2';
        this._inline(h, line.slice(3));
        sectionEl.appendChild(h);
        root.appendChild(sectionEl);
        continue;
      }

      // H3
      if (line.startsWith('### ')) {
        listEl = null;
        const h = document.createElement('h3');
        h.className = 'md-h3';
        this._inline(h, line.slice(4));
        target().appendChild(h);
        continue;
      }

      // List item (*, -, +)
      const listMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
      if (listMatch) {
        if (!listEl) {
          listEl = document.createElement('ul');
          listEl.className = 'md-ul';
          target().appendChild(listEl);
        }
        const li = document.createElement('li');
        li.className = 'md-li';
        this._inline(li, listMatch[2]);
        listEl.appendChild(li);
        continue;
      }

      // Blank line — close list but keep section open
      if (line.trim() === '') {
        listEl = null;
        continue;
      }

      // Disclaimer / note block (lines starting with ***)
      if (line.startsWith('***') || line.toLowerCase().startsWith('*disclaimer')) {
        listEl = null;
        const note = document.createElement('div');
        note.className = 'md-disclaimer';
        this._inline(note, line.replace(/^\*{1,3}/, '').replace(/\*{1,3}$/, ''));
        target().appendChild(note);
        continue;
      }

      // Regular paragraph
      listEl = null;
      const p = document.createElement('p');
      p.className = 'md-p';
      this._inline(p, line);
      target().appendChild(p);
    }

    return root;
  }

  // Render inline markdown: ***bold italic***, **bold**, *italic*, `code`
  _inline(parent, text) {
    // Split on bold-italic, bold, italic, and code spans
    const TOKEN = /(\*{3}[^*]+\*{3}|\*{2}[^*]+\*{2}|\*[^*]+\*|`[^`]+`)/g;
    let last = 0;
    let match;

    while ((match = TOKEN.exec(text)) !== null) {
      if (match.index > last) {
        parent.appendChild(document.createTextNode(text.slice(last, match.index)));
      }

      const raw = match[0];
      if (raw.startsWith('***')) {
        const s = document.createElement('strong');
        const e = document.createElement('em');
        e.textContent = raw.slice(3, -3);
        s.appendChild(e);
        parent.appendChild(s);
      } else if (raw.startsWith('**')) {
        const s = document.createElement('strong');
        s.textContent = raw.slice(2, -2);
        parent.appendChild(s);
      } else if (raw.startsWith('*')) {
        const e = document.createElement('em');
        e.textContent = raw.slice(1, -1);
        parent.appendChild(e);
      } else if (raw.startsWith('`')) {
        const c = document.createElement('code');
        c.className   = 'md-code';
        c.textContent = raw.slice(1, -1);
        parent.appendChild(c);
      }

      last = match.index + raw.length;
    }

    if (last < text.length) {
      parent.appendChild(document.createTextNode(text.slice(last)));
    }
  }
}
