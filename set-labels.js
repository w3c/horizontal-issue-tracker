/* eslint-env node */

"use strict";

// Use node set-labels.js [repository full name]*
// If no arguments, it will fetch the list of repositories from https://w3c.github.io/validate-repos/hr-repos.json

const HorizontalRepositories = require("./lib/horizontal-repositories.js"),
      {Repository} = require("./lib/github.js"),
      config = require("./lib/config.js"),
      fetch = require("node-fetch"),
      fs = require('fs').promises,
      monitor = require("./lib/monitor.js");

const HR_REPOS_URL = "https://w3c.github.io/validate-repos/hr-repos.json";
const W3C_APIURL = "https://api.w3.org/";

const SHORTNAME_COLOR = "6bc5c6";

const postfixes = [".", ":", "Level", "0", "1", "2", "3", "Revision", "Version", "Module", "-"];

function fetchW3C(queryPath) {
  if (!config.w3capikey) throw new ReferenceError("Missing W3C key")
  const apiURL = new URL(queryPath, W3C_APIURL);
  apiURL.searchParams.set("apikey", config.w3capikey);
  apiURL.searchParams.set("embed", "1"); // grab everything
  return fetch(apiURL).then(r => r.json()).then(data => {
    if (data.error) return data;
    if (data.pages && data.pages > 1 && data.page < data.pages) {
      return fetchW3C(data._links.next.href).then(nextData => {
        let key = Object.keys(data._embedded)[0];
        let value = data._embedded[key];
        return value.concat(nextData);
      });
    }
    let value;
    if (data._embedded) {
      let key = Object.keys(data._embedded)[0];
      value = data._embedded[key];
    } else {
      value = data;
    }
    return value;
  });
}

async function run() {
  const hr = new HorizontalRepositories();

  let repositories = await fetch(HR_REPOS_URL).then(data => data.json());
  // add a few more repositories, such as the repository template
  repositories = repositories.concat(["w3c/note-respec-repo-template"]);

  // in case we need to add a new repository in the system, use the command line
  if (process.argv.length > 2) {
    repositories = [];
    for (let index = 2; index < process.argv.length; index++) {
      repositories.push(process.argv[index]);
    }
    monitor.log(`Process new repositories: ${repositories.join(",")}`)
  }

  // transform the list of repositories into actual Repository objects
  repositories = repositories.map(r => new Repository(r));
  // we check for labels
  repositories.forEach(repo => hr.checkRepositoryForLabels(repo).catch(e => {
    if (e.errors && e.errors[0].code === "already_exists") {
      monitor.warn(`${repo.full_name} : likely inconsistent cache status, refreshing the labels`);
      repo.getLabels(-1).catch(monitor.error);
    } else {
      monitor.error(`${repo.full_name} : can't set proper labels. ${e}`);
    }
  }));
  // we check for horizontal-admin team
  repositories.forEach(repo => hr.checkRepositoryForTeam(repo).catch(e => {
    monitor.error(`${repo.full_name}: can't set horizontal-admin team. ${e}`);
  }));

  if (process.argv.length > 2) {
    // we're done here since it was only meant to add a new repository
    return;
  }

  // The following is a starting code for specification shortname labels in horizontal repositories
  // @@continue
  const hrRepos = await hr.repositories;
  let labels = [].concat(...(await Promise.all(hrRepos.map(repo => {
    return repo.getLabels(-1).then(labels => {
      labels.forEach(l => {
        // we decorate the labels with the repo name and their repo object
        l.repo = repo.full_name;
        l.repoObject = repo;
      });
      return labels;
    });
  }))));

  // filter out the labels that aren't for shortnames
  labels = labels.filter(l => l.name.startsWith('s:'));

  /*
    const specifications = await fetchW3C("specifications");
    fs.writeFile("w3c_tr.json", JSON.stringify(specifications));
  */
  const specifications = require("./w3c_tr.json");

  function common_substring(strings) {
    if (strings.length === 1) {
      return strings[0];
    }
    let r = '';
    let i = -1;
    let found = true;
    do {
      i++;
      let cc = strings[0][i];
      found = strings.reduce((a, v) => a && (cc === v[i]), true);
    } while (found);
    return strings[0].substring(0, i);
  }

  function cleanTitle(titles) {
    let title = common_substring(titles).trim();
    if (title) {
      let found;
      do {
        found = false;
        postfixes.forEach(p => {
          if (title.endsWith(p)) {
            title = title.substring(0, title.length - p.length).trim();
            found = true;
          }
        });
      } while (found);
    }
    return title;
  }

  function findSpecByLink(link) {
    let rspec;
    let titles = [];
    let links = [];
    if (link.match("https://drafts.csswg.org/[-0a-zA-Z]+/")
        || link.match("https://drafts.css-houdini.org/[-0a-zA-Z]+/")
        || link.match("https://drafts.fxtf.org/[-0a-zA-Z]+/")) {
       link = link.substring(0, link.length-1) + "(-[0-9]+)?/";
    }
    specifications.forEach(spec => {
      if (spec["editor-draft"] && spec["editor-draft"].match(link)) {
        if (!rspec) {
          rspec = spec;
          titles.push(spec.title);
          if (spec["editor-draft"]) links.push(spec["editor-draft"]);
        } else {
          if (!titles.includes(spec.title)) {
            titles.push(spec.title);
          }
          if (spec["editor-draft"] && !links.includes(spec["editor-draft"])) {
            links.push(spec["editor-draft"]);
          }
          // monitor.log(`We already found this specification: ${link}`);
          // console.log(rspec);
        }
      }
    })
    let s = {};
    if (titles.length >= 1) {
      let title = cleanTitle(titles);
      if (title) {
        s.title = title;
      } else {
        if (link === "https://html.spec.whatwg.org/multipage/") {
          s.title = "HTML";
        } else {
          monitor.error(`Can't find ${link}`);
        }
      }
    }
    if (links.length >= 1) {
      s["editor-draft"] = links[0];
    }
    if (!s.title) return undefined;
    return s;
  }

  function findSpecBySerie(serie) {
    let rspec;
    let titles = [];
    let links = [];
    let ns = {};
    serie = serie.toLowerCase();

    const whatwgspecs = [ "HTML", "DOM", "Storage", "Fetch" ];
    whatwgspecs.forEach(t => {
      if (t.toLowerCase() === serie) {
        ns.title = t;
        ns["editor-draft"] = `https://${t.toLowerCase()}.spec.whatwg.org/`
      }
    });
    if (ns.title) return ns;

    specifications.forEach(spec => {
      let s = spec._links.series.href.match("specification-series/(.+)")[1];
      if (s) s = s.toLowerCase();
      if (s === serie) {
        if (!rspec) {
          rspec = spec;
          titles.push(spec.title);
          if (spec["editor-draft"]) links.push(spec["editor-draft"]);
        } else {
          if (!titles.includes(spec.title)) {
            titles.push(spec.title);
          }
          if (spec["editor-draft"] && !links.includes(spec["editor-draft"])) {
            links.push(spec["editor-draft"]);
          }
          // monitor.log(`We already found this specification: ${link}`);
          // console.log(rspec);
        }
      }
    })
    if (titles.length >= 1) {
      let title = cleanTitle(titles);
      if (title) {
        ns.title = title;
      } else {
        if (!ns.title) {
          monitor.error(`Can't find ${link}`);
        }
      }
    }
    if (links.length >= 1) {
      ns["editor-draft"] = links[0];
    }
    if (!ns.title) return undefined;
    return ns;
  }

  const map = new Map();
  // we run through the labels and make sure they are consistent across repositories
  // The labels are learning from each other, thus setting it properly on one will fix the others.
  labels.forEach(l => {
    const used = map.get(l.name);
    if (used) {
      // we compare the description to detect if the label is set up properly
      if (!used.description || used.description === "") {
        if (!l.description || l.description === "") {
          // here, we can't learn, so we're giving up on this one
          monitor.error(`${used.repo}#${used.name} and ${l.repo}#${l.name} needs a label description`);
        } else {
          monitor.warn(`${used.repo} : ${l.name} needs ${l.description}`);
          used.description = l.description;
          // @@TODO set the label properly
        }
      } else if (!l.description || l.description === "") {
        monitor.warn(`${l.repo} : ${l.name} needs ${used.description}`);
        l.description = used.description;
        // @@TODO set the label properly
      } else if (l.description && l.description !== "" && l.description !== used.description) {
        // this is inconsistent, so we're giving up
        monitor.error(`${l.name} : [${l.repo} ${l.description}] != [${used.repo} ${used.description}]`);
      } else if (l.color !== SHORTNAME_COLOR) {
        // just in case
        monitor.warn(`${l.repo} : wrong color for ${l.name}`);
      }
    } else {
      // first time we're seeing it, so just add it
      map.set(l.name, {name: l.name, description: l.description, repo: l.repo, repoObject: l.repoObject});
      if (l.color !== SHORTNAME_COLOR) {
        // just in case
        monitor.warn(`${l.repo} : wrong color for ${l.name}`);
      }
    }
  })

  const shortnames = Array.from(map.values());


  const domains = new Set();
  const dump_shortnames = {};
  shortnames.forEach(short => {
    const serie = short.name.substring(2);
    let nshort = { link: short.description };
    let spec = findSpecBySerie(serie);
    if (spec) {
      if (spec["editor-draft"] && !short.description) {
        nshort.link = spec["editor-draft"];
        short.repoObject.updateLabel({
          name: short.name,
          color: SHORTNAME_COLOR,
          description: spec["editor-draft"]
        }).then(e =>
          monitor.log(`We added ${spec["editor-draft"]} to ${short.repoObject.full_name}/${short.name}`)
        ).catch(err =>
          monitor.error(`Failed adding ${spec["editor-draft"]} to ${short.repoObject.full_name}/${short.name} : ${err}`)
        )
      }
    } else {
      if (short.description) {
        const link = short.description;
        spec = findSpecByLink(link);
        const matches = link.match(new RegExp("https://([^/]+)/"));
        if (matches) {
          domains.add(matches[1]);
        }
      }
    }

    if (spec) {
      nshort.title = spec.title;
    } else {
      // we didn't find it (not yet published, WICG, WHATWG, ...), so time to make some guessing
      if (!short.description) {
        nshort = undefined;
        monitor.error(`(${short.name})[${short.name}] not found`);
      }
    }
    if (nshort) {
      if (!nshort.link) {
        monitor.error(`Discarding entry for ${serie} (no editor draft)`);
      } else if (!dump_shortnames[serie]) {
          dump_shortnames[serie] = nshort;
      } else {
        monitor.error(`Duplicate shortname entry for ${serie}`);
      }
    }
  })
  for (const [key, value] of Object.entries(dump_shortnames)) {
    if (!value.title) {
      dump_shortnames[key] = undefined;
      monitor.error(`Discarding entry for ${key} [${value.link}] (no title)`)
    }
  }
  // console.log(domains);
  return (new Repository("horizontal-issue-tracker")).createContent(
    "docs/shortnames.json", "Shortnames snapshot", JSON.stringify(dump_shortnames), "main").then(res => {
    switch (res.status) {
      case 200:
        monitor.log(`Updated shortnames`);
        break;
      case 201:
        monitor.log(`Created shortnames`);
        break;
      default:
        monitor.error(`Unexpected status ${res.status} shortnames.json}`);
        throw new Error(`Unexpected status ${res.status} shortnames.json`);
    }
    return res;
  });
}

run();

/* IF YOU NEED TO RENAME A LABEL, USE A SET OF LABELS with "oldname", eg.
  labels = [
    {
      "name": "i18n-tracker",
      "oldname": "i18n-tracking",
      "longdesc": "The Internationalization (i18n) Group may add this label to indicate that they are following a discussion. Other WGs can also add the label to any issue to automatically bring the discussion to the attention of the i18n Group. Issues with this label don't need to be resolved to the satisfaction of the i18n Group before a transition.",
      "description": "Group bringing to attention of Internationalization, or tracked by i18n but not needing response.",
      "color": "F9C9FF",
      "excludeGroups": [  32113,  72665 ]
    }
  ];

*/
