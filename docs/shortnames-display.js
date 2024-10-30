/* eslint-env browser */

"use strict";
import { config as confinit, el, id, fetchJSON } from "./Groups/lib/utils.js";

// Define the repository
const config = confinit({
  ttl: 15
});

const SHORTNAMES = fetchJSON("shortnames.json");

function display_error(err) {
  id("log").textContent = err;
  if (config.debug) console.error(err);
}

// BELOW IS WHERE THINGS STARTS HAPPENING

/*
 * Our entry point
 * Grab the data
 * 1. for each shortname label, compute the issues
 * 2. remember which labels we saw while you're at it
 * 3. for each shortname label, invoke displayRepo
 * 4. build the menu for filter labels
 * *
 */
async function getAllData() {
  const ulData = el("ul");
  const ulReport = el("ul");

  SHORTNAMES.then(data => {

    // we need to sort them alphabetically
    const entries = [];
    for (const [key, value] of Object.entries(data)) {
      value.key = key;
      if (!value.title) {
        value.title = key;
        if (config.debug && value.link) {
          ulReport.append(el("li", { "id": `report-title-${value.key}` },
          `No title for `, el("code", value.key), ". See ",
          el("a", {
            href: `${value.link}`
          }, value.link)));
        }
      }
      value.sortKey = value.title.toLowerCase().replace(/[- :.[\]]/g, '');
      if (value.sortKey.startsWith('"')) {
        value.sortKey = value.sortKey.substring(1);
      }
      entries.push(value);
    }
    function sortEntries(a, b) {
      const t1 = a.sortKey;
      const t2 = b.sortKey;
      if (t1 < t2) {
        return -1;
      };
      if (t1 > t2) {
        return 1;
      };
      return 0;
    }
    entries.sort(sortEntries);

    entries.forEach(value => {
      if (config.retired || !value.retired) {
        ulData.append(el("li", { "id": value.key },
          el("a", {
            href: `review.html?shortname=${value.key}`
          },
          (value.title)? value.title : value.key
          )
        ));
      }
      if (config.debug && value.serie && value.key !== value.serie) {
        ulReport.append(el("li", { "id": `report-${value.key}` },
          `Consider replacing `,
          el("a", {
            href: `review.html?shortname=${value.key}`
          }, el("code", value.key)),
          ` with `, el("code", value.serie)
          ));
      }
      if (config.debug && config.link && !value.link) {
        ulReport.append(el("li", { "id": `report-link-${value.key}` },
          "No editor's draft link for ", el("code", value.key)
          ));
      }
    });

  }).catch(err => {
    display_error(err)
  });
  id("rawdata").append(ulData);
  if (config.debug) {
    id("report").append(el("h2", "Debug"));
    id("report").append(el("p",
    "Edit the file ",
    el("a", { href: "https://github.com/w3c/horizontal-issue-tracker/blob/main/docs/shortnames.json"}, "shortnames.json")));
    id("report").append(ulReport);
  }
}

// the script is defer, so just go for it when you're ready
getAllData().then(() => {
  if (config.debug) console.log("DONE");
})
