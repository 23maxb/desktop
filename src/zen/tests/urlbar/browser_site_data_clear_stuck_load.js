/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SiteDataManager } = ChromeUtils.importESModule(
  "resource:///modules/SiteDataManager.sys.mjs"
);

const HANG_URL =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  ) + "site_data_hang.sjs";

/**
 * Stands in for the removal prompt, recording which sites it was asked about
 * and declining, so nothing is actually cleared.
 */
function recordPrompts() {
  const prompted = [];
  const original = SiteDataManager.promptSiteDataRemoval;
  SiteDataManager.promptSiteDataRemoval = (win, domains) => {
    prompted.push(...domains);
    return false;
  };
  registerCleanupFunction(() => {
    SiteDataManager.promptSiteDataRemoval = original;
  });
  return prompted;
}

function waitForDocumentStart(browser) {
  return new Promise(resolve => {
    const listener = {
      onStateChange(aBrowser, webProgress, request, stateFlags) {
        const { STATE_START, STATE_IS_DOCUMENT } = Ci.nsIWebProgressListener;
        if (
          aBrowser === browser &&
          webProgress.isTopLevel &&
          stateFlags & STATE_START &&
          stateFlags & STATE_IS_DOCUMENT
        ) {
          gBrowser.removeTabsProgressListener(listener);
          resolve();
        }
      },
    };
    gBrowser.addTabsProgressListener(listener);
  });
}

function clearSiteDataItem() {
  return document.getElementById("context_zenClearSiteData");
}

async function isClearSiteDataEnabled() {
  const popup = document.getElementById("zenSiteDataActions");
  const shown = BrowserTestUtils.waitForPopupEvent(popup, "shown");
  popup.openPopup(gURLBar.textbox, "after_start");
  await shown;
  const enabled = !clearSiteDataItem().hasAttribute("disabled");
  const hidden = BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  popup.hidePopup();
  await hidden;
  return enabled;
}

add_task(async function test_clears_the_site_a_tab_is_stuck_opening() {
  const prompted = recordPrompts();
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  const started = waitForDocumentStart(tab.linkedBrowser);
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, HANG_URL);
  await started;

  ok(await isClearSiteDataEnabled(), "the item is enabled for the stuck page");
  clearSiteDataItem().doCommand();
  await TestUtils.waitForCondition(() => prompted.length, "prompt is shown");
  Assert.deepEqual(
    prompted,
    ["example.com"],
    "asks to clear the data of the page that won't load"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_loaded_page_still_clears_its_own_site() {
  const prompted = recordPrompts();
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.org/"
  );

  clearSiteDataItem().doCommand();
  await TestUtils.waitForCondition(() => prompted.length, "prompt is shown");
  Assert.deepEqual(prompted, ["example.org"], "asks about the loaded page");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_disabled_without_a_site() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  ok(!(await isClearSiteDataEnabled()), "nothing to clear on a blank page");
  BrowserTestUtils.removeTab(tab);
});
