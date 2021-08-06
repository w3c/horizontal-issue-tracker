/* eslint-env node */

"use strict";

const { Repository, GitHub } = require("./lib/github.js"),
  HorizontalRepositories = require("./lib/horizontal-repositories.js"),
  monitor = require("./lib/monitor.js"),
  fetch = require("node-fetch"),
  email = require("./email.js"),
  octokit = require("./lib/octokit-cache.js"),
  config = require("./lib/config.js"),
  tracked_repositories = require("./lib/repositories.js");

const LINK_REGEX = "https://github.com/([^/]+/[^/]+)/(issues|pull)/([0-9]+)",
  MAGIC_CHARACTER = "§"; // section character

// ##
// shortcuts for reporting purposes

function log(issue, msg) {
  monitor.log(`${issue.html_url} ${msg}`);
}

function error(issue, msg) {
  monitor.error(`${issue.html_url} ${msg}`);
}

function warn(issue, msg) {
  monitor.warn(`${issue.html_url} ${msg}`);
}

// ##
// create uniq and cached Repository objects
//  we cache those objects to avoid fetching the same things over and over

let uniqRepositories; // initialized in main() at each loop

function resetRepositories() {
  uniqRepositories = new Map();
}

// Instantiate a Repository object given a full name
// Note: this does not create new repository on GitHub, just create a better JS object
function createRepository(full_name) {
  let name = full_name.toLowerCase();
  let repo = uniqRepositories.get(name);
  if (!repo) {
    repo = new Repository(name);
    uniqRepositories.set(name, repo);
  }
  return repo;
}

// ##
//  This is used to maintain all of the shortnames used in horizontal repositories
// populated in getHRissues(repo)
let REPO2SHORTNAMES; // this gets reset at each run

function resetRepo2Shortnames() {
  REPO2SHORTNAMES = {};
}

// associate a label to a repo
function addShortlabel(repoName, labelName) {
  repoName = repoName.toLowerCase();
  // add this label to list of labels used by the spec repo
  let ar = REPO2SHORTNAMES[repoName];
  if (!ar) {
    REPO2SHORTNAMES[repoName] = ar = [];
  }
  if (!ar.includes(labelName)) {
    ar.push(labelName);
  }
}

// Returns the known labels for a repo
function getShortlabel(repoName) {
  return REPO2SHORTNAMES[repoName];
}

// Returns an iterator
function getShortLabels() {
  return Object.entries(REPO2SHORTNAMES);
}

// ##
// How we establish the link between an horizontal issue and its respective specification issues
// is based on the links in the body if the issue (the first comment on GH)
// one horizontal issue <-> many spec issues
function related(body) {
  body = (body || "");
  const matches = body.match(new RegExp(`${MAGIC_CHARACTER} ${LINK_REGEX}`, 'g'));
  if (matches) {
    return matches.map(s => s.substring(2).trim());
  }
}

// ##
// This looks to see if a label is in the issue body
function needsHorizontalLabels(issue, hr_labels) {
  const needs = (issue.body || "").toLowerCase().match(/\+([a-z0-9]+)-(tracker|needs-resolution)/g);
  if (!needs) return undefined;
  const rlabels = [];
  needs.forEach(s => {
    let fname = s.substring(1);
    const hlabel = hr_labels.find(l => l.name === fname);
    if (hlabel) {
      if (hlabel.name !== "a11y-needs-resolution") {
        rlabels.push(hlabel);
      }
    }
  });
  return rlabels;
}

// does an issue contain a given label?
function hasLabel(issue, labelName) {
  return (issue.labels && issue.labels.reduce((a, c) => a || (c && c.name.includes(labelName)), false));
}

// remove a label from an issue (both on the JS object and on GH)
function removeIssueLabel(repo, issue, labelName) {
  if (issue.labels) {
    const new_labels = [];
    let found = false;
    issue.labels.forEach(l => {
      if (!l) {
        error(issue, `@@invalid issue labels list (undefined label)`);
      } else if (l.name !== labelName) {
        new_labels.push(l);
      } else {
        found = true;
      }
    });
    if (found) {
      issue.labels = new_labels;
      return repo.removeIssueLabel(issue, {name: labelName } ).catch(err => {
       error(issue, `could not remove label "${labelName}" : ${err} `);
      });
    } else {
      error(issue, `no label ${labelName} found, so it can't be removed`);
    }
  }
  return issue;
}

// set a label on an issue (both on the JS object and on GH)
function setIssueLabel(repo, issue, labelNames) {
  issue.labels = (issue.labels || []).concat(labelNames.map(s => { name: s}));
  return repo.setIssueLabel(issue, labelNames);
}

// does the url matches the html URL of a GH repository
// if yes, return the fullname of the repository
function htmlRepoURL(url) {
  return url.match(new RegExp(LINK_REGEX))[1];
}

// repo is an horizontal group repository to track issues and comments
// we return the list of all issues decorated with information relevant to our tracking
// we also attempt to learn from those issues for our shortname labels handling
async function getHRIssues(repo) {
  const ttl = (config.debug)? 15 : -1;  // -1 => no cache please
  const issues = await repo.getIssues(ttl);

  // filter to issues that needs tracking
  // decorate the issues with their dependencies
  for (const issue of issues) {
    // first look for the format used by i18n-activity
    issue.linkTo = related(issue.body);
    // shortcut for later, one of "a11y, "i18n", "security", "privacy", "tag"
    issue.hr_prefix = repo.horizontalCategory;
    // grab the list of GH links in the issues for later (without the magic character)
    issue.links = (issue.body || "").match(new RegExp(LINK_REGEX, 'g'));

    issue.repoObject = repo;

    // needs-resolution trumps tracker
    if (hasLabel(issue, "needs-resolution")) {
      issue.hr_label = "needs-resolution";
    } else if (hasLabel(issue, "tracker")) {
      issue.hr_label = "tracker";
    }

    // if this HR issue links to one spec repo, we're learning shortnames
    if (issue.linkTo && issue.linkTo.length === 1 && issue.labels) {
      // do we have a shortname label for it? If so, we're learning the shortname(s) for that spec repo
      for (const label of issue.labels.filter(l => l.name.startsWith("s:"))) {
        const repoName = htmlRepoURL(issue.linkTo[0]);
        if (repoName) addShortlabel(repoName, label.name);
      }
    }

    if (issue.linkTo) {
      const spec_issues = []; // we load the associated specification issues
      for (const link of issue.linkTo) {
        const match = link.match(new RegExp(LINK_REGEX));
        let issueRepo = createRepository(match[1]);
        const issueNumber = Number.parseInt(match[3]);
        let spec_issue = await issueRepo.getIssue(issueNumber).catch(() => undefined);
        if (spec_issue) {
            if (spec_issue.html_url.toLowerCase() !== link.toLowerCase() && !hasLabel(issue, "moved?")) {
              let newRepo = createRepository(htmlRepoURL(spec_issue.html_url));;
              // this wasn't detected before, so add "moved?" and "pending"
              monitor.warn(`Moved repository: "${issueRepo.full_name}" is now "${newRepo.full_name}"`);
              warn(issue, `new labels 'moved?','pending'`);
              if (!config.debug) {
                setIssueLabel(issue.repoObject, issue, [ "moved?", "pending" ]).catch(monitor.error);
              }
              issueRepo = newRepo;
            }
            spec_issue.repoObject = issueRepo;
            spec_issues.push(spec_issue);
        } else {
          // we can't find: either the cache didn't refresh yet or the issue got moved
          // label issue has moved since we couldn't find it anymore
          spec_issue = await octokit.request(`GET /repos/${issueRepo.full_name}/issues/${issueNumber}`)
            .then(res => {
              if (res.status === 201 || res.status === 200) {
                return res.data;
              } else {
                console.error(res);
                return undefined;
              }
            }).catch(() => undefined);
          if (spec_issue && spec_issue.html_url !== link && !hasLabel(issue, "moved?")) {
            // this wasn't detected before, so add "moved?" and "pending"
            log(issue, `moved? ${link}`);
            setIssueLabel(issue.repoObject, issue, [ "moved?", "pending" ]).catch(monitor.error);
          } else {
            if (issue.state === "open") {
              error(issue, `invalid linked issue? ${link}`);
            } else {
              log(issue, `invalid linked issue? ${link}`);
            }
          }
        }
      }
      if (spec_issues.length > 0) {
        issue.spec_issues = spec_issues;
        if (issue.linkTo.length !== issue.spec_issues.length) {
          error(issue, `loaded ${issue.spec_issues.length} issues instead of ${issue.linkTo.length}`);
        }
      }
    }
  }
  return issues;
}


// We're checking each open horizontal issue with regards to its corresponding spec issues
async function checkHRIssues(issues, labels) {
  // filter to issues with track
  // decorate the issues with their dependencies
  for (const issue of issues) {
    const needs_resolution = issue.hr_prefix + "-needs-resolution";
    const tracker = issue.hr_prefix + "-tracker";

    if (!issue.spec_issues) {
      if (issue.hr_label && issue.state === "open" && issue.hr_label === "needs-resolution") {
        // stay silent on "tracker" for now
        warn(issue, `doesn't link to a specification issue but has ${issue.hr_label}`);
      }
    }

    if (issue.spec_issues && issue.hr_label && issue.state === "open") {
      // ignore closed issues in horizontal repositories
      // issue.hr_label is "needs-resolution" or "tracker" (from getHRIssues)

      // first, we're looking to see a proper shortname, if needed
      if (issue.labels.findIndex(l => l.name.startsWith('s:')) === -1) {
        for (const spec_issue of issue.spec_issues) {
          const shortnames = getShortlabel(spec_issue.full_name);
          if (shortnames) {
            if (shortnames.length === 1) {
              const repoName = htmlRepoURL(issue.html_url);
              if (repoName !== "w3c/sealreq") { // @@UGLY oh my. really?!?
                log(issue, ` shortname match : ${shortnames[0]}`);
                setIssueLabel(issue.repoObject, issue, [ shortnames[0] ]).catch(err => error(issue, err));
              }
            } else {
              if (htmlRepoURL(spec_issue.html_url) !== "w3c/csswg-drafts") {
                // this one is tricky, so just give up
                warn(issue, `multiple shortname matches : ${shortnames.join(',')}`);
              }
            }
          } else {
            if (hasLabel(issue, "pending")) {
              warn(issue, "no shortname label found");
            }
            // we have no idea on what we're looking at, so give up
          }
        }
      }

      // check if we need a needs-resolution on issue.hr_label
      if (issue.hr_label === "tracker") {
        for (const spec_issue of issue.spec_issues) {
          if (hasLabel(spec_issue, needs_resolution)) {
            warn(issue, `links to ${spec_issue.html_url} and needs to add needs-resolution`);
            /*
            if (issue.hr_prefix !== "i18n") { // check with r12a first
              // we're taking option 2 https://github.com/w3c/horizontal-issue-tracker/issues/16
              await setIssueLabel(issue.repoObject, issue, [ "needs-resolution" ]);
            }
            continue;
            */
          }
        }
      }

      // for all issues that are linking to spec issues
      for (const spec_issue of issue.spec_issues) {
        if (spec_issue.state === "closed") {
          // the WG closed their issue, so check that we have the label "close?" on the HR issue
          const isClosed = hasLabel(issue, "close?");
          if (!isClosed) {
            log(issue, `added label "close?"`);
            await setIssueLabel(issue.repoObject, issue, [ "close?" ]);
          }
        }

        if (issue.hr_label === "needs-resolution") {
          if (!hasLabel(spec_issue, needs_resolution)) {
            warn(spec_issue, `links to ${issue.html_url} and needs to have ${needs_resolution}`);
            await setIssueLabel(spec_issue.repoObject, spec_issue, [ needs_resolution ]);
          }
          if (hasLabel(spec_issue, tracker)) {
            log(spec_issue, `links to ${issue.html_url} and needs to drop ${tracker}`);
            await removeIssueLabel(spec_issue.repoObject, spec_issue, tracker);
          }
        }
      }
    }
    // needs-resolution/tracker handling for the HR issue itself
    // if needs-resolution and tracker, remove tracker
    if (issue.hr_label === "needs-resolution" && hasLabel(issue, "tracker")) {
      // an issue shouldn't have needs-resolution and tracker at the same time
      log(issue, `dropping tracker label due to needs-resolution`);
      removeIssueLabel(issue.repoObject, issue, "tracker");
    }
  }
  return true;
}

// find an issue in the list of horizontal issues
// @@if ran too frequently, the script can generate duplicate. Do we have a bug in here?!?
function findIssue(issue, hr_issues) {
  const link = issue.html_url;
  const found = [];
  for (const hr_issue of hr_issues) {
    if (hr_issue.linkTo && hr_issue.linkTo.includes(link)) {
      found.push(hr_issue);
    }
  }
  return found;
}

let pre2021issue = 0;

// This is the most important function: create an horizontal issue
// hlabels is the subset of horizontal labels found that are relevant
async function createHRIssue(issue, hlabels) {

  // do we have a shortname match?
  function findShortlabel(issue) {
    const repoName = htmlRepoURL(issue.html_url);
    const shortnames = (repoName) ? getShortlabel(repoName) : undefined;
    if (shortnames) {
      if (shortnames.length === 1) {
        return shortnames;
      } else {
        if (repoName === "w3c/csswg-drafts") {
          // this is CSS, so let's play the guess game
          let cssSpecs = issue.title.match(/\[([a-zA-Z_]+(-[a-zA-Z_]+)*)(-[0-9]+)?\]/g);
          if (cssSpecs) { // if not null
            return cssSpecs.map(s => s.replace('[', 's:').replace(']', '').replace(/-[0-9]+$/, ''));
          }
        }
        error(issue, `Too many labels :  ${shortnames.join(', ')}`);
      }
    } else {
      error(issue, `No short labels for ${repoName}`);
    }
    // return undefined;
  }

  // skip those for now @@UGLY
  if (htmlRepoURL(issue.html_url) === "w3c/webex" || htmlRepoURL(issue.html_url) === "w3c/tr-pages") {
    return;
  }

  // the issue got already closed, so we skip it if it's prior to 2021
  if (issue.state == "closed") {
    const year = Number.parseInt(issue.created_at.substring(0, 4));
    if (year <= 2020) {
      pre2021issue++;
      return;
    }
  }
  const shortlabels = findShortlabel(issue);

  let all_creation = [];

  // for all horizontal labels, create the issue in the horizontal repo
  // @@what if the spec issue has tracker and needs-resolution, will we create a duplicate?
  for (const label of hlabels) {
    const title = issue.title;
    // label.subcategory is "tracker" or "needs-resolution"
    let labels = [label.subcategory, "pending"];

    let body = "**This is a tracker issue.** Only discuss things here if they are "
      + label.category + " group internal meta-discussions about the issue. "
      + "**Contribute to the actual discussion at the following link:**"
      + `\n\n${MAGIC_CHARACTER} ${issue.html_url}\n`;

    // special handling for i18n
    if (label.category === "i18n") {
      body += "\n"
        + "\nInstructions:"
        + "\n- check for the following labels, then remove the PENDING label, then delete these instructions"
        + "\n"
        + "\n- TRACKER & S:...  should be there"
        + "\n- add ADVICE-REQUESTED if the WG-issue is specifically asking for i18n to advise/comment"
        + "\n- add NEEDS-ATTENTION if this is an important issue"
        + "\n"
        + "\n- if there's an i18n-*lreq label in the WG repo:"
        + "\n   -  ...LREQ label(s) should be there"
        + "\n   - SPEC-TYPE-ISSUE should be there"
        + "\n   - add TYPE-INFO-REQUEST if a request for script/language expert advice"
        + "\n    - add I:...  label(s)";
    }
    if (label.name === 'i18n-tracker' || label.name === 'i18n-needs-resolution') {
      // https://github.com/w3c/i18n-activity/wiki/Automation-requirements#3-automatic-creation-of-tracker-issues-for-wg-issues-being-tracked
      let found = false;
      for (const ilabel of issue.labels) {
        const match = ilabel.name.match(/i18n-([a-zA-Z0-9]+lreq)/);
        if (match) {
          labels.push(match[1]);
          found = true;
        }
      }
      if (found) {
        labels.push("spec-type-issue");
      }
    }
    if (shortlabels) labels = labels.concat(shortlabels);

    const horizontal_repo = label.gh;
    log(issue, `creating a new horizontal issue ${horizontal_repo.full_name} ${title} ${labels.join(',')}`);
    if (config.debug) {
      log(issue, `DEBUG mode so abort`);
      return;
    }
    all_creation.push(
      // let's check if the shortname labels are there...
      horizontal_repo.getLabels().then(repo_labels => {
        const request_labels = [];
        if (shortlabels) {
          shortlabels.forEach(clabel => {
            const f = repo_labels.find(l => l.name === clabel);
            if (!f) {
              request_labels.push(horizontal_repo.setLabel({ name: clabel, color: "#6bc5c6", description: "missing link"})
                .then(() =>
                  monitor.log(`${horizontal_repo.full_name} got the new label ${clabel}. Update the link?`))
                .catch(err => {
                  monitor.warn(`${horizontal_repo.full_name} failed to create the new label ${clabel}`);
                  console.log(err);
                }));
            }
          })
          return Promise.all(request_labels);
        } else {
          return null; // nothing to do
        }
      })
      .catch(monitor.error) // ignore those issues
      .then(() => label.gh.createIssue(title, body, labels))
      .then(new_issue => {
        log(new_issue, `is a new horizontal issue for ${issue.html_url}`);
      }).catch(err => {
        console.error(err);
        error(issue, `Something went wrong when creating a new issue in ${label.gh.full_name}: ${err.status} ${err}`);
      })
    ); // all_creation.push
  } // for (const label of hlabels)
  return Promise.all(all_creation);
}

// Check that a specification issue is proper
async function checkIssue(issue, labels, all_hr_issues) {
  const needed_labels = needsHorizontalLabels(issue, labels);

  if (!issue.labels && !needed_labels) {
    return; // no labels, we're done here
  }

  const hLabelFound = [];
  if (issue.labels) {
    for (const label of labels) {
      if (hasLabel(issue, label.name)) {
        hLabelFound.push(label);
      }
    }
  }

  if (needed_labels) {
    const needed = [];
    for (const l of needed_labels) {
      let f = hLabelFound.find(lh => lh.name === l.name);
      if (!f) {
        if (l.subcategory === "tracker") {
          const sl = l.category + "-needs-resolution";
          f = hLabelFound.find(lh => lh.name === sl);
          if (!f) {
            hLabelFound.push(l);
            needed.push(l);
          }
        } else { /// it's a needs-resolution
          hLabelFound.push(l);
          needed.push(l);
        }
      }
    }
    if (needed.length > 0) {
      log(issue, `setting ${needed.length} label(s): ${needed.map(l => l.name)}`);
      const repo = createRepository(htmlRepoURL(issue.html_url));
      const repo_labels = repo.getLabels();
      needed.forEach(label => {
        const f = labels.find(l => l.name === label.name);
        if (!f) {
          monitor.warn(`${repo.full_name} is missing horizontal labels! Couldn't find ${label.name}`);
        }
      })
      await setIssueLabel(repo, issue, needed.map(l => l.name)).then(() => {
        needed.forEach(l => issue.labels.push(l)); // update the issue in memory
      });
    }
  }
  if (hLabelFound.length === 0) {
    return // no horizontal labels, we're done here
  }
  const foundHR = findIssue(issue, all_hr_issues) || [];
  const create = [];
  for (const hLabel of hLabelFound) {
    const found = foundHR.find(hr => hLabel.gh.full_name === htmlRepoURL(hr.html_url));
    if (!found) create.push(hLabel);
  }
  if (create.length === 0) {
    return // all horizontal labels have a corresponding HR issue
  }
  return createHRIssue(issue, create);
}

// pretty formatting of numbers
function fn(n) {
  return new Intl.NumberFormat().format(n);
}

async function main() {
  const hr = new HorizontalRepositories();
  const labels = await hr.labels;

  // ###
  // First, check things from the point of view of the horizontal group repositories

  const hr_repos = await hr.repositories;

  monitor.log(`Loading issues from ${hr_repos.length} horizontal repositories`);

  let hr_issues = [];

  let good = true;
  for (const repo of hr_repos) {
    let issues = await getHRIssues(repo);
    if (!issues || !issues.length) {
      good = false;
      throw new Error(`Failed to retrieve ${repo.full_name}`);
    }
    monitor.log(`fetched ${issues.length} horizontal issues from ${repo.full_name}`);
    hr_issues = hr_issues.concat(issues);
  }
  if (!good) {// extra protection but we should never reach this Error
    throw new Error("unreachable statement");
  }

  // we populated our map of shortnames while loading the horizontal issues
  // so report if multiple shortnames apply to the same repository
  // this helps detect inconsistencies in the data
  for (const [key, value] of getShortLabels()) {
    if (value && value.length > 1) {
      monitor.log(`multiple shortnames for ${key} : ${value.join(',')}`);
    }
  }

  // check the specification issue labels from the point of view of the horizontal group repositories
  //
  monitor.log(`Loaded and checking ${fn(hr_issues.length)} horizontal issues for ${labels.length} labels`);

  await checkHRIssues(hr_issues, labels);


  // ###
  // Second, check things from the point of view of the specification repositories
  let repositories = await tracked_repositories.all();

  monitor.log(`Tracking issues from ${repositories.length} specification repositories`);

  // did we discover a repository while loading issues from the horizontal group repositories?
  const new_repos = [];
  for (let index = 0; index < hr_issues.length; index++) {
    const hr_issue = hr_issues[index];
    if (hr_issue.spec_issues) {
      hr_issue.spec_issues.forEach(spec_issue => {
        const repoName = spec_issue.repoObject.full_name.toLowerCase();
        if (!repositories.includes(repoName)
           && !new_repos.includes(repoName)) {
          new_repos.push(repoName);
          monitor.warn(`${hr_issue.hr_prefix} tracks an unknown repository: ${repoName}`);
        }
      })
    }
  }
  repositories = repositories.map(r => createRepository(r));

  let all = [];
  for (let index = 0; index < repositories.length; index++) {
    // don't use map here, to be gentle on the GitHub cache
    // so wait for each repo to load before going to the next
    // note that we don't give a ttl, so issue "freshness" depends on github-cache
    all.push(await repositories[index].getIssues().catch(() => {
      monitor.error(`failed to load issues from ${repositories[index].full_name}`);
      return [];
    }));
  }

  return Promise.all(all).then(issues => issues.flat()).then(issues => {
    let total = issues.length;
    let open = issues.filter(issue => issue.state === "open").length;

    // nice display of number to show off
    monitor.log(`Tracking ${fn(total)} specification issues (${fn(total - open)} closed and ${fn(open)} open)`);

    const checks = [];
    for (let index = 0; index < issues.length; index++) {
      const issue = issues[index];
      checks.push(checkIssue(issue, labels, hr_issues));
    }
    return Promise.all(checks);
  }).then(all => {
    // we're done with everything
    monitor.log(`${pre2021issue} issues were not created since they got closed prior to the year 2021`)
    monitor.log("we're done and it seems nothing broke. Good luck.");
  });
}

function loop() {
  // reinitialize the cached Repository objects and our map of shortnames at each run
  resetRepositories();
  resetRepo2Shortnames();

  main().then(function () {
    if (!config.debug)
      email(monitor.get_logs());
  }).catch(function (err) {
    console.error(err);
    if (!config.debug) {
      monitor.error(`Something went wrong: ${err}`);
      email(monitor.get_logs());
    }
  });

  if (!config.debug) {
    setTimeout(loop, 60000 * 60 * 12); // every 12 hours
  }
}

async function init() {
  /// empty as far as I know
  return "ok";
}

init().then(function () {
  loop();
}).catch(function (err) {
  console.error("Error ocurred");
  console.error(err);
  console.error(err.stack);
});
