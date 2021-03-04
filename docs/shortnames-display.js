/* eslint-env browser */

"use strict";

// Define the repository
const config = {
  debug: false,
  ttl: 15,
};

const SHORTNAMES = fetch("shortnames.json").then(r => r.json());

// parse the URL to update the config
for (const [key, value] of (new URL(window.location)).searchParams) {
  config[key] = value;
}

function displayError(text) {
  const log = document.getElementById('log')
  const p = document.createElement('p');
  p.textContent = "ERROR: " + text;
}

// format a Date, "Aug 21, 2019"
function formatDate(date) {
  // date is a date object
  const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
  return date.toLocaleString('en-US', options);
}

// create an element easily
// attrs is object (and optional)
// content is Element or string
function domElement(name, attrs, ...content) {
  const elt = document.createElement(name);
  const makeChild = c =>(c instanceof Element)?
    c : (typeof c === 'string')?
         document.createTextNode(c) : undefined;

  if (attrs) {
    const c = makeChild(attrs);
    if (c) {
      elt.appendChild(c);
    } else {
      for (const [name, value] of Object.entries(attrs)) {
        elt.setAttribute(name, value);
      }
    }
  }
  for (const child of content) {
    if (child instanceof Element) {
      elt.appendChild(child);
    } else {
      elt.appendChild(document.createTextNode(child));
    }
  }
  return elt;
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
  const ulData = domElement("ul");
  const ulReport = domElement("ul");

  SHORTNAMES.then(data => {

    // we need to sort them alphabetically
    const entries = [];
    for (const [key, value] of Object.entries(data)) {
      value.key = key;
      if (!value.title) {
        value.title = key;
        if (config.debug && value.link) {
          ulReport.appendChild(domElement("li", { "id": `report-title-${value.key}` },
          `No title for `, domElement("code", value.key), ". See ",
          domElement("a", {
            href: `${value.link}`
          }, value.link)));
        }
      }
      value.sortKey = value.title.toLowerCase();
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
        ulData.appendChild(domElement("li", { "id": value.key },
          domElement("a", {
            href: `review.html?shortname=${value.key}`
          },
          (value.title)? value.title : value.key
          )
        ));
      }
      if (config.debug && value.serie && value.key !== value.serie) {
        ulReport.appendChild(domElement("li", { "id": `report-${value.key}` },
          `Consider replacing `,
          domElement("a", {
            href: `review.html?shortname=${value.key}`
          }, domElement("code", value.key)),
          ` with `, domElement("code", value.serie)
          ));
      }
      if (config.debug && config.link && !value.link) {
        ulReport.appendChild(domElement("li", { "id": `report-link-${value.key}` },
          "No editor's draft link for ", domElement("code", value.key)
          ));
      }
    });

  }).catch(err => {
    console.error(err)
  });
  document.getElementById("rawdata").appendChild(ulData);
  if (config.debug) {
    document.getElementById("report").appendChild(domElement("h2", "Debug"));
    document.getElementById("report").appendChild(domElement("p",
    "Edit the file ",
    domElement("a", { href: "https://github.com/w3c/horizontal-issue-tracker/blob/main/docs/shortnames.json"}, "shortnames.json")));
    document.getElementById("report").appendChild(ulReport);
  }
}

// the script is defer, so just go for it when you're ready
getAllData().then(() => {
  if (config.debug) console.log("DONE");
})
