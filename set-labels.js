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

function fetchW3C(queryPath) {
  if (!config.w3capikey) throw new ReferenceError("Missing W3C key")
  const apiURL = new URL(queryPath, W3C_APIURL);
  apiURL.searchParams.set("apikey", config.w3capikey);
  apiURL.searchParams.set("embed", "1"); // grab everything
  console.log(`fetch ${apiURL}`);
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
    return repo.getLabels().then(labels => {
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
/*
  const specifications = await fetchW3C("specifications");
  fs.writeFile("w3c_tr.json", JSON.stringify(specifications));
*/
  const specifications = require("./w3c_tr.json");
  const shortnames = Array.from(map.values());

  function findSpec(link) {
    let title;
    let rspec;
    specifications.forEach(spec => {
      if (link === spec["editor-draft"]) {
        if (!rspec) {
          rspec = spec;
        } else {
          monitor.log(`We already found this specificaton: ${link}`);
          // console.log(rspec);
        }
      }
    })
    return rspec;
  }
  shortnames.forEach(short => {
    if (short.description) {
      const link = short.description;
      const spec = findSpec(link);
      if (spec) {
        short.title = spec.title;
      } else {
        // we didn't find it (not yet publsihed, WICG, WHATWG, ...), so time to make some guessing
        monitor.error(`${short.description} not found`);
      }
    }
  })
  fs.writeFile("shortnames.json", JSON.stringify(shortnames));
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
