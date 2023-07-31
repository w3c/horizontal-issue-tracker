/* eslint-env node */

"use strict";

// Use node set-labels.js [repository full name]*
// If no arguments, it will fetch the list of repositories from https://w3c.github.io/validate-repos/hr-repos.json

const HorizontalRepositories = require("./lib/horizontal-repositories.js"),
      {Repository} = require("./lib/github.js"),
      config = require("./lib/config.js"),
      fetch = require("node-fetch"),
      fs = require('fs').promises,
      tracked_repositories = require("./lib/repositories.js"),
      monitor = require("./lib/monitor.js");

const W3C_APIURL = "https://api.w3.org/";
const SERIE_REGEXP = new RegExp("https://api.w3.org/specification-series/([^]+)$");
const SHORTNAME_COLOR = "6bc5c6";

const postfixes = [".", ":", "Level", "0", "1", "2", "3", "(Second Edition)", "(Revised)", "Revision", "Version", "Module", "-"];
const prefixes = ["The"];

config.debug = false;

// to get information out of the W3C API
function fetchW3C(queryPath) {
  const apiURL = new URL(queryPath, W3C_APIURL);
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

const GH = "https://github.com/\([^/]+/[^/]+\)/blob/\([^/]+\)/\(.*\)";

const GH_SHORTNAMES = "https://www.w3.org/PM/horizontal/shortnames.json";
const LOCATION = "https://github.com/w3c/horizontal-issue-tracker/blob/main/docs/shortnames.json";
const CACHE_FILE = "cache.json";
const CACHE = fs.readFile(CACHE_FILE).then(JSON.parse);

const TR_COPY = "./w3c_tr.json";

// used by getSpecifications to load the list of specifications from W3C
async function getSpecificationsInternal() {
  return fetchW3C("specifications").then(specs => {
    fs.writeFile(TR_COPY, JSON.stringify(specs, null, " ")).catch(console.error);
    return specs;
  });
}
// get the list of specifications of W3C
async function getSpecifications() {
  if (config.debug) {
    return fs.readFile(TR_COPY).then(JSON.parse).catch(err => getSpecificationsInternal());
  } else {
    return getSpecificationsInternal();
  }
}

// save the content into a github.com location
async function save_document_github(location, content) {
  if (config.debug) {
    monitor.warn(`In DEBUG mode. Not saving ${location}`);
    return;
  }
  if (location.startsWith("https://github.com/")) {
    let branch;
    let path;
    let repo;
    let match = location.match(GH);
    if (match) {
      repo = match[1];
      branch = match[2];
      path = match[3];
    } else {
      monitor.error(`not a valid location ${location}`);
      return;
    }
    repo = new Repository(repo);
    return repo.createContent(path, "Snapshot", content, branch).then(res => {
      switch (res.status) {
        case 200:
          monitor.log(`Updated into ${location}`);
          break;
        case 201:
          monitor.log(`Created into ${location}`);
          break;
        default:
          monitor.error(`Unexpected status ${res.status}`);
          throw new Error(`Unexpected status ${res.status}`);
      }
      return res;
    });
  } else {
    throw new Error(`not a valid location ${location}`);
  }
}

// load our shortnames DB
async function getShortNames() {
  return CACHE.then(cache => {
    if (cache[LOCATION])
      return JSON.parse(cache[LOCATION]);
    else
      return {};
  });
}

// save our shortnames DB
async function save_cache(content) {
  CACHE.then(cache => {
    if (cache[LOCATION] === content) {
      monitor.log(`Content already saved ${LOCATION}`);
      return true;
    } else {
      cache[LOCATION] = content;
      return save_document_github(LOCATION, content).then(res => {
        if (!config.debug)
          fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, " "))
      });
    }
  });
}

// take an array of strings and return the longest common starting string
// eg [ "fon", "fons", "fond"] will return "fon"
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

// take an array of specification titles and extract the common title
// eg [ "CSS Fonts Level 2", "CSS Fonts Level 3"] will return "CSS Fonts"
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
    do {
      found = false;
      prefixes.forEach(p => {
        if (title.startsWith(p)) {
          title = title.substring(p.length).trim();
          found = true;
        }
      });
    } while (found);
  }
  return title;
}

// extract the serie out of a W3C TR specification
// or returns undefined if it can't find one
function getSerie(spec) {
  return (spec.serie) ? spec.serie : spec.serie = spec._links.series.href.match(SERIE_REGEXP)[1].toLowerCase();
}

// find the title for a given serie
function getSerieTitle(specs, serie) {
  const titles = [];
  serie = serie.toLowerCase(); // just to make sure
  specs.forEach(spec => {
    const s = getSerie(spec); // this is already in lowercase
    if (s === serie) {
      titles.push(spec.title);
    }
  });
  if (titles.length >= 1) {
    return cleanTitle(titles);
  }
  // return undefined
}

// find all of the shortnames for a given serie
function getSerieShortname(specs, serie) {
  const shortnames = new Set();
  serie = serie.toLowerCase(); // just to make sure
  specs.forEach(spec => {
    const s = getSerie(spec); // this is already in lowercase
    if (s === serie) {
      shortnames.add(spec.shortname);
    }
  });
  return [...shortnames];
}

// true if the serie latest-version is retired
function isSerieRetired(specs, serie) {
  const status = [];
  serie = serie.toLowerCase(); // just to make sure
  specs.forEach(spec => {
    const s = getSerie(spec); // this is already in lowercase
    if (s === serie) {
      const st = spec._links["latest-version"].title; // this is already in lowercase
      status.push(st);
    }
  });
  return status.reduce((a, v) => a && v === "Retired", true);
}


async function run() {
  const hr = new HorizontalRepositories();

  let repositories = await tracked_repositories.w3c();

  repositories.concat(await tracked_repositories.extra());

  // add a few more repositories, such as the repository template
  repositories = repositories.concat(["w3c/note-respec-repo-template"]);

  const CGs = [ "80485", "87846" ];
  let idx = 0;
  while (idx < CGs.length) {
    const repos = await fetch(`https://labs.w3.org/github-cache/extra/repos/${CGs[idx++]}`)
      .then(res => res.json())
      .then(repos => repos.filter(repo => repo.w3c
        && repo.w3c["repo-type"]
        && repo.w3c["repo-type"].find(t => t === "cg-report")));

    repos.forEach(repo => {
      let name = repo.full_name.toLowerCase();
      if (!repositories.find(r => r === name)) {
        monitor.log(`Adding new WICG repository ${name}`);
        repositories.push(name);
      }
    });
  }

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

  const debug = true;

  const specifications = await getSpecifications();
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
    let ns = {};
    if (titles.length >= 1) {
      let title = cleanTitle(titles);
      if (title) {
        ns.title = title;
      } else {
        if (link === "https://html.spec.whatwg.org/multipage/") {
          ns.title = "HTML";
        } else {
          monitor.error(`Can't find ${link}`);
        }
      }
    }
    if (links.length >= 1) {
      ns["editor-draft"] = links[0];
    }
    if (rspec) {
      ns["serie"] = getSerie(rspec);
    }
    if (!ns.title) return undefined;
    return ns;
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
        if (["html", "dom"].includes(serie)) {
          ns.serie = serie;
        }
      }
    });
    if (ns.title) return ns;

    specifications.forEach(spec => {
      let s = getSerie(spec);
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
    if (rspec) {
      ns["serie"] = getSerie(rspec);
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
      }
    } else {
      // first time we're seeing it, so just add it
      map.set(l.name, {name: l.name, description: l.description, color: l.color, repo: l.repo, repoObject: l.repoObject});
    }
    if (l.color !== SHORTNAME_COLOR) {
      // just in case
      if (l.description) {
        const r = new Repository(l.repo);
        l.color = SHORTNAME_COLOR;
        r.updateLabel(l).then(() => {
          monitor.log(`Fixed color for ${l.repo} / ${l.name}`);
        }).catch(err => {
          console.log(err);
          monitor.error(`Failed to fix color for ${l.repo} / ${l.name}: ${err}`);
        });
      } else {
        monitor.warn(`${l.repo} : wrong color for ${l.name} and no description`);
      }
      //promises.push(repo.updateLabel(l));
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
      nshort.w3c = {
        serie: spec.serie
      };
    } else {
      // we didn't find it (not yet published, WICG, WHATWG, ...), so time to make some guessing
      if (!short.description) {
        nshort = undefined;
        monitor.error(`(${short.name})[${short.name}] not found`);
      }
    }
    if (nshort) {
      if (!dump_shortnames[serie]) {
          dump_shortnames[serie] = nshort;
      } else {
        monitor.error(`Duplicate shortname entry for ${serie}`);
      }
    }
  })

  // gather all of the series we found (serie is not yet equivalent to shortnames :/ )
  let all_series = [];
  for (const [key, value] of Object.entries(dump_shortnames)) {
    if (value.w3c && value.w3c.serie) {
      all_series.push(value.w3c.serie);
    }
  }

  // if changes are made in GH, we'll pick it up here
  const cached = await fetch(GH_SHORTNAMES).then(res => res.json());
  for (const [key, value] of Object.entries(cached)) {
    let entry = dump_shortnames[key];
    if (!entry) {
      if (value.w3c && value.w3c.serie) {
        if (!all_series.includes(value.w3c.serie)) {
          dump_shortnames[key] = value;
        } else {
          monitor.error(`key ${key} missing but exists as a serie ${value.serie}. Discarded`)
        }
      } else {
        dump_shortnames[key] = value;
      }
    } else {
      if (!entry.title && value.title) {
        entry.title = value.title;
      }
      if (entry.title && value.title && entry.title !== value.title) {
        monitor.log(`GH Update (title): "${entry.title}" -> "${value.title}"`);
        entry.title = value.title;
      }
      if (!entry.link && value.link) {
        entry.link = value.link;
      }
      if (entry.link && value.link && entry.link !== value.link) {
        monitor.log(`GH Update (link): "${entry.link}" -> "${value.link}"`);
        // entry.link = value.link;
      }
      if (!entry.w3c && value.w3c) {
        entry.w3c = value.w3c;
      }
      if (entry.w3c && entry.w3c.serie && value.w3c && value.w3c.serie && entry.w3c.serie !== value.w3c.serie) {
        monitor.log(`GH Update (serie): "${entry.w3c.serie}" -> "${value.w3c.serie}"`);
        entry.w3c.serie = value.w3c.serie;
      }
    }
  }

  // gather all of the series we found (serie is not yet equivalent to shortnames :/ )
  all_series = [];
  for (const [key, value] of Object.entries(dump_shortnames)) {
    if (value.w3c && value.w3c.serie) {
      all_series.push(value.w3c.serie);
    }
  }

  // if W3C knows about some series, we'll pick it up here
  specifications.forEach(spec => {
    const serie = getSerie(spec);
    if (serie) {
      const retired = isSerieRetired(specifications, serie);
      let entry = dump_shortnames[serie];
      if (!entry && !all_series.includes(serie)) {
          let title = getSerieTitle(specifications, serie);
          if (title && title.length < 2) {
            // that's way too short for a title
            monitor.error(`Discarding title from ${serie} [${title}] (too short)`);
            title = null;
          }
          monitor.log(`Adding from W3C: ${serie} [${title}]`);
          dump_shortnames[serie] = {
            title : title,
            link  : spec["editor-draft"],
            w3c: {
              serie : serie
            }
          };
          entry = dump_shortnames[serie];
      } else if (!entry) {
        for (const [key, value] of Object.entries(dump_shortnames)) {
          if (value.w3c && value.w3c.serie === serie) {
            entry = value;
          }
        }
      }
      if (entry && retired) {
        entry.retired = true;
      }
    }
  })
  const series = await fetchW3C("specification-series");
  series.forEach(serie => {
    serie.shortnameL = serie.shortname.toLowerCase();
  });


  for (const [key, value] of Object.entries(dump_shortnames)) {
    if (value.w3c && value.w3c.serie) {
      const str = value.w3c.serie;
      const sw = series.find(s => s.shortnameL === str);
      if (sw) {
        if (value.title !== sw.name) {
          monitor.warn(`Mismatched serie with W3C: ${value.title} !== ${sw.name}`);
          value.title = sw.name;
        }
        if (!value.title) {
          value.title = sw.name;
        }
        value.w3c.serie = sw.shortname;
      }
    }
    if (!value.title) {
      monitor.warn(`Missing title for ${key} [${value.link}]`)
    }
    if (value.w3c && value.w3c.serie && value.w3c.serie !== key) {
      monitor.warn(`Mismatched serie and shortname ${key} serie: ${value.w3c.serie}`)
    }
    if (value.w3c && value.w3c.serie) {
      const shortnames = getSerieShortname(specifications, value.w3c.serie);
      if (shortnames.length > 0) {
        value.w3c.shortnames = shortnames;
      }
    }
  }
  return save_cache(JSON.stringify(dump_shortnames, null, " ")).catch(err => {
    console.log(err.status)
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
