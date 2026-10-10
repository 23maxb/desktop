/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, when } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const SEARCH_DEBOUNCE_MS = 250;

export const PAGE_SIZE = 100;
export const MS_PER_DAY = 86400000;
const WHEN_DAYS = { today: 1, week: 7, month: 30 };

/**
 * Builds the exclusive "when" filter group shared by time-based sections.
 *
 * @param {string} titleL10nId - Fluent id of the group title
 */
export function whenFilterGroup(titleL10nId) {
  return {
    id: "when",
    titleL10nId,
    exclusive: true,
    options: Object.keys(WHEN_DAYS).map(id => ({
      id,
      l10nId: `library-filter-${id}`,
    })),
  };
}

export class ZenLibrarySearchSection extends MozLitElement {
  static properties = {
    searchQuery: { type: String, state: true },
    filtersOpen: { type: Boolean, state: true },
  };

  #searchDebounce = null;
  #searchDone = Promise.resolve();
  #sentinelObserver = null;

  constructor() {
    super();
    this.searchQuery = "";
    this.filtersOpen = false;
    this.activeFilters = new Set();
  }

  createRenderRoot() {
    return this;
  }

  get searchPlaceholderL10nId() {
    return "";
  }

  get filterTitleL10nId() {
    return "";
  }

  /**
   * Filter groups shown in the filter panel. Sections without filters keep
   * this empty, which also hides the filter button. An `exclusive` group
   * behaves like a radio group where the active option can also be toggled
   * back off.
   *
   * @returns {{id: string, titleL10nId: string, exclusive?: boolean,
   *            options: {id: string, l10nId?: string, label?: string,
   *                      icon?: string, disabled?: boolean}[]}[]}
   */
  get filterGroups() {
    return [];
  }

  renderItems() {
    return null;
  }

  onSearchChanged() {}
  onFiltersChanged() {}

  /**
   * Opens what a row stands for, when it is picked from the keyboard. Sections
   * whose rows can be opened in other ways override this.
   *
   * @param {Element} row - The row with focus
   * @param {object} how
   * @param {boolean} how.inBackground - Accel was held
   * @param {boolean} how.glance - Alt was held, asking for a glance
   */
  onRowKeyActivate(row, how) {
    if (!how.glance) {
      row.click();
    }
  }
  onListScrolledToEnd() {}

  isFilterActive(groupId, optionId) {
    return this.activeFilters.has(`${groupId}:${optionId}`);
  }

  /**
   * Number of days selected in the "when" filter group, or null when no
   * option is active.
   */
  get activeWhenDays() {
    for (const [id, days] of Object.entries(WHEN_DAYS)) {
      if (this.isFilterActive("when", id)) {
        return days;
      }
    }
    return null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#searchDebounce) {
      clearTimeout(this.#searchDebounce);
      this.#searchDebounce = null;
    }
    this.#sentinelObserver?.disconnect();
    this.#sentinelObserver = null;
  }

  firstUpdated() {
    if (super.firstUpdated) {
      super.firstUpdated();
    }

    this.addEventListener("keydown", this.#onKeyDown);

    const results = this.querySelector(".zen-library-search-results");
    this.#sentinelObserver = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          this.onListScrolledToEnd();
        }
      },
      { root: results, rootMargin: "200px" }
    );
    this.#sentinelObserver.observe(
      this.querySelector(".zen-library-search-sentinel")
    );

    results.addEventListener(
      "scroll",
      () => results.toggleAttribute("scrolled", results.scrollTop > 0),
      { passive: true }
    );
  }

  updated(changedProperties) {
    if (super.updated) {
      super.updated(changedProperties);
    }
    if (changedProperties.has("filtersOpen") && this.filtersOpen) {
      const inner = this.querySelector(".zen-library-filter-panel-inner");
      this.style.setProperty(
        "--zen-library-filter-height",
        `${inner.scrollHeight + 8}px`
      );
    }
  }

  #onSearchInput(event) {
    const { value } = event.target;
    if (this.#searchDebounce) {
      clearTimeout(this.#searchDebounce);
    }
    this.#searchDebounce = setTimeout(() => {
      this.#searchDebounce = null;
      this.#applySearch(value);
    }, SEARCH_DEBOUNCE_MS);
  }

  #applySearch(value) {
    const query = value.trim();
    if (query !== this.searchQuery) {
      this.searchQuery = query;
      this.#searchDone = Promise.resolve(this.onSearchChanged());
    }
  }

  get #searchInput() {
    return this.querySelector(".zen-library-search-box input");
  }

  /** @returns {Element[]} The rows the keyboard moves between, in order */
  get #rows() {
    return [
      ...this.querySelectorAll(".zen-library-search-results .zen-library-row"),
    ];
  }

  #focusRow(row) {
    if (!row) {
      return false;
    }
    row.tabIndex = -1;
    row.focus();
    row.scrollIntoView({ block: "nearest" });
    return true;
  }

  /**
   * Leaves the search box for the first row, once whatever was typed into it
   * has been searched for, so a quick Tab doesn't land on stale results.
   */
  async #enterResults() {
    const input = this.#searchInput;
    if (this.#searchDebounce) {
      clearTimeout(this.#searchDebounce);
      this.#searchDebounce = null;
      this.#applySearch(input.value);
    }
    await this.#searchDone;
    await this.updateComplete;
    if (document.activeElement === input) {
      this.#focusRow(this.#rows[0]);
    }
  }

  #onKeyDown = event => {
    const input = this.#searchInput;
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.target === input) {
      if (
        (event.key === "Tab" && plain && !event.shiftKey) ||
        (event.key === "ArrowDown" && plain)
      ) {
        event.preventDefault();
        this.#enterResults();
      }
      return;
    }

    const row = event.target;
    if (!row.classList?.contains("zen-library-row")) {
      return;
    }
    const rows = this.#rows;
    const index = rows.indexOf(row);
    const back =
      event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey);
    const forward =
      event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey);
    if (back) {
      if (!this.#focusRow(rows[index - 1])) {
        input.focus();
      }
    } else if (forward) {
      this.#focusRow(rows[index + 1]);
    } else if (event.key === "Enter") {
      this.onRowKeyActivate(row, {
        inBackground: event.getModifierState("Accel"),
        glance: event.altKey,
      });
    } else if (event.key === "Escape") {
      input.focus();
    } else if (event.key.length === 1 && plain) {
      // Typing again goes back to the search, which the key then lands in.
      input.focus();
      return;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  #toggleFilter(group, optionId) {
    const key = `${group.id}:${optionId}`;
    const wasActive = this.activeFilters.has(key);
    if (group.exclusive) {
      for (const option of group.options) {
        this.activeFilters.delete(`${group.id}:${option.id}`);
      }
    }
    if (wasActive) {
      this.activeFilters.delete(key);
    } else {
      this.activeFilters.add(key);
    }
    this.requestUpdate();
    this.onFiltersChanged();
  }

  #renderFilterOption(group, option) {
    return html`
      <button
        class="zen-library-filter-chip"
        ?active=${this.isFilterActive(group.id, option.id)}
        ?disabled=${option.disabled}
        @click=${() => this.#toggleFilter(group, option.id)}
      >
        ${when(option.icon, () => html`<img src=${option.icon} alt="" />`)}
        ${
          option.l10nId
            ? html`<span data-l10n-id=${option.l10nId}></span>`
            : html`<span>${option.label}</span>`
        }
      </button>
    `;
  }

  #renderFilterPanel() {
    return html`
      <div class="zen-library-filter-header" ?inert=${!this.filtersOpen}>
        <h2 data-l10n-id=${this.filterTitleL10nId}></h2>
        <button
          class="zen-library-filter-done"
          data-l10n-id="library-filter-done"
          @click=${() => {
            this.filtersOpen = false;
          }}
        ></button>
      </div>
      <div class="zen-library-filter-panel">
        <div class="zen-library-filter-panel-inner" ?inert=${!this.filtersOpen}>
          ${this.filterGroups.map(
            group => html`
              <div class="zen-library-filter-group">
                <h3 data-l10n-id=${group.titleL10nId}></h3>
                <div class="zen-library-filter-options">
                  ${group.options.map(option =>
                    this.#renderFilterOption(group, option)
                  )}
                </div>
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  #faded = false;

  async onShown() {
    if (this.#faded) {
      this.removeAttribute("fade-in");
    } else {
      this.#faded = true;
      this.setAttribute("fade-in", "true");
    }
    await this.focusSearch();
  }

  /**
   * Puts the caret in the search box, once it has been rendered.
   */
  async focusSearch() {
    await this.updateComplete;
    this.querySelector(".zen-library-search-box input")?.focus();
  }

  render() {
    const hasFilters = !!this.filterGroups.length;
    return html`
      <div class="zen-library-search-top" ?open=${this.filtersOpen}>
        <div class="zen-library-search-header" ?inert=${this.filtersOpen}>
          <div class="zen-library-search-box">
            <img
              src="chrome://browser/skin/zen-icons/search-glass.svg"
              alt=""
            />
            <input
              type="search"
              data-l10n-id=${this.searchPlaceholderL10nId}
              @input=${this.#onSearchInput}
            />
          </div>
          ${when(
            hasFilters,
            () => html`
              <button
                class="zen-library-filter-button"
                @click=${() => {
                  this.filtersOpen = true;
                }}
              >
                <img
                  src="chrome://browser/skin/zen-icons/circle-bars-filter.svg"
                  draggable="false"
                  alt=""
                />
                <span data-l10n-id="library-filter-button"></span>
              </button>
            `
          )}
        </div>
        ${when(hasFilters, () => this.#renderFilterPanel())}
      </div>
      <div class="zen-library-search-results">
        ${this.renderItems()}
        <div class="zen-library-search-sentinel"></div>
      </div>
    `;
  }
}
