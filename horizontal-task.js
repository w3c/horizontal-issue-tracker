/* eslint-env node */

"use strict";

const { Repository, GitHub } = require("./lib/github.js"),
  HorizontalRepositories = require("./lib/horizontal-repositories.js"),
  monitor = require("./lib/monitor.js"),
  fetch = require("node-fetch");

const HR_REPOS_URL = "https://w3c.github.io/validate-repos/hr-repos.json",

// those are repositories that aren't part of hr-repos.json and yet, we track them
  EXTRA_REPOSITORIES = ["whatwg/encoding", "whatwg/html", "whatwg/url", "whatwg/fetch",
     "w3c/webcomponents", "w3c/note-respec-repo-template"],

  LINK_REGEX = "https://github.com/([^/]+/[^/]+)/(issues|pull)/([0-9]+)",

  MAGIC_CHARACTER = "§"; // section character

const allRepositories = new Map();

// for reporting purposes

const report = {};

function getReportEntry(name) {
  let entry = report[name];
  if (!entry) {
    entry = {logs: [], errors: [], warnings: []};
  }
  report[name] = entry;
  return entry;
}

function log(issue, msg) {
  getReportEntry(issue.html_url).logs.push(msg);
  monitor.log(`${issue.html_url} ${msg}`);
}

function error(issue, msg) {
  getReportEntry(issue.html_url).errors.push(msg);
  monitor.error(`${issue.html_url} ${msg}`);
}

function warn(issue, msg) {
  getReportEntry(issue.html_url).warnings.push(msg);
  monitor.warn(`${issue.html_url} ${msg}`);
}


// Instantiate a Repository object given a full name
// Note: this does not create new repository on GitHub, just create a better JS object
// we cache those objects to avoid fetching the same things over and over
function createRepository(full_name) {
  let repo = allRepositories.get(full_name);
  if (!repo) {
    repo = new Repository(full_name);
    allRepositories.set(full_name, repo);
  }
  return repo;
}


// How we establish the link between an horizontal issue and its respective specification issues
// HR issue <-> spec issues (one to many)
function related(body) {
  body = (body || "");
  const matches = body.match(new RegExp(`${MAGIC_CHARACTER} ${LINK_REGEX}`, 'g'));
  if (matches) {
    return matches.map(s => s.substring(2).trim());
  }
}

// @@ DEPRECATE ME
// This looks to see if a label is in the issue body
function needsHorizontalLabels(issue) {
  const needs = (issue.body || "").toLowerCase().match(/\+([a-z0-9]+)-(tracker|needs-resolution)/g);
  if (!needs) return undefined;
  return needs.map(s => { return { name: s.substring(1) }});
}

// does the issue contain a given label?
// label is a string
function hasLabel(issue, label) {
  return (issue.labels.reduce((a, c) => a || c.name.includes(label), false));
}

// does the url matches the html URL of a GH repository
// if yes, return the fullname of the repository
function htmlRepoURL(url) {
  return url.match(new RegExp(LINK_REGEX))[1];
}

// This is used to do how shortnames magic
// populated in getHRissues(repo)
const REPO2SHORTNAMES = {};
// one label per repo
function getShortlabel(repo) {
  return REPO2SHORTNAMES[repo];
}

// @@ document me
async function getHRLabels(repo) {
  const labels = await repo.getLabels();

  // filter to issues with track
  // decorate the issues with their dependencies
  for (const label of labels) {
    // @@TODO
  }
  return labels;
}

// repo is an horizontal group repository to track issues and comments
// we return the list of all issues decorated with information relevant to our tracking
// we also attempt to learn from those issues for our shortname labels handling
async function getHRIssues(repo) {
  const issues = await repo.getIssues(1); // ttl is one minute

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

      if (hasLabel(issue, "tracker")) {
        // an issue shouldn't have needs-resolution and tracker at the same time
        log(issue, `tracker label on a needs-resolution?`);
        repo.removeIssueLabel(issue, { name: "tracker"});
        // @@TODO remove tracker from issue.labels object as well?
      }
    } else if (hasLabel(issue, "tracker")) {
      issue.hr_label = "tracker";
    }

    // if this HR issue links to one spec repo, we're learning shortnames
    if (issue.linkTo && issue.linkTo.length === 1 && issue.labels) {
      // do we have a shortname label for it? If so, we're learning the shortname(s) for that spec repo
      for (const label of issue.labels.filter(l => l.name.startsWith("s:"))) {
        const repoName = htmlRepoURL(issue.linkTo[0]);
        if (repoName) {
          // add this label to list of labels used by the spec repo
          let ar = getShortlabel(repoName);
          if (!ar) {
            REPO2SHORTNAMES[repoName] = ar = [];
          }
          if (!ar.includes(label.name)) {
            ar.push(label.name);
          }
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

    if (!issue.linkTo) {
      if (issue.hr_label && issue.state === "open" && issue.hr_label === "needs-resolution") {
        // stay silent on "tracker" for now
        warn(issue, `doesn't link to a specification issue but has ${issue.hr_label}`);
      }
    }


    if (issue.linkTo && issue.hr_label && issue.state === "open") {
      // ignore closed issues in horizontal repositories
      // issue.hr_label is "needs-resolution" or "tracker" (from getHRIssues)

      // first, we're looking if shortname is correct or can be fixed
      if (issue.labels.findIndex(l => l.name.startsWith('s:')) === -1) {
        for (const link of issue.linkTo) {
          const repoName = htmlRepoURL(link);
          const shortnames = (repoName) ? getShortlabel(repoName) : undefined;
          if (shortnames) {
            if (shortnames.length === 1) {
              if (repoName !== "w3c/sealreq") { // @@UGLY oh my. really?!?
                log(issue, ` shortname match : ${shortnames[0]}`);
                issue.repoObject.setIssueLabel(issue, [ shortnames[0] ]).catch(monitor.error);
              }
            } else {
              error(issue, `multiple shortname matches : ${shortnames.join(',')}`);
              // this one is tricky, so just give up
              // @@TODO handle the CSS logic
            }
          } else {
            error(issue, "no shortname label found");
            // we have no idea on what we're looking at, so give up
          }
        }
      }

      // for all issues that are linking to spec issues
      for (const link of issue.linkTo) {
        const match = link.match(new RegExp(LINK_REGEX));
        let issueRepo = match[1];
        const issueNumber = Number.parseInt(match[3]);

        issueRepo = createRepository(issueRepo);
        const spec_issue = await issueRepo.getIssue(issueNumber);
        if (spec_issue && spec_issue.state === "closed") {
          // the WG closed their issue, so check that we have the label "close?" on the HR issue
          const isClosed = (issue.labels && issue.labels.find(l => l.name === "close?"));
          if (!isClosed) {
            const hrRepo = htmlRepoURL(issue.html_url);
            const label = labels.find(l => l.gh.full_name === hrRepo);
            if (label) {
              // create label close?
              log(issue, `added label "close?"`);
              await label.gh.setIssueLabel(issue, [ "close?" ]);
            } else {
              throw new Error(`We shouldn't be here! ${hrRepo}`);
            }
          }
        }
        if (spec_issue
          && !hasLabel(spec_issue, issue.hr_prefix + '-' + issue.hr_label)) {
          // the WG removed the horizontal label?
          const name = issue.hr_prefix + '-' + issue.hr_label;
          if (name !== "i18n-tracker") { // @@UGLY too much history here to touch this
            warn(spec_issue, `links to ${issue.html_url} and was fixed to add ${name}`);
            await issueRepo.setIssueLabel(spec_issue, [ issue.hr_prefix + '-' + issue.hr_label ]);
          }
        } else if (!spec_issue) {
          monitor.error(`Redirected? ${link}`);
        }
      }
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

// This is the most important function: create an horizontal issue
// hlabels is the subset of horizontal labels found that are relevant
async function createHRIssue(issue, hlabels) {

  // do we have a shortname match?
  function findShortlabel(issue) {
    const repoName = htmlRepoURL(issue.html_url);
    const shortnames = (repoName) ? getShortlabel(repoName) : undefined;
    if (shortnames) {
      if (shortnames.length === 1) {
        return shortnames[0];
      } else {
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

  // the issue got already closed, so we skip it
  // @@make sure this is what we want
  if (issue.state == "closed") {
    // skip it
    return;
  }
  const shortlabel = findShortlabel(issue);

  // for all horizontal labels, create the issue in the horizontal repo
  // @@what if the spec issue has tracker and needs-resolution, will we create a duplicate?
  for (const label of hlabels) {
    const title = issue.title;
    // label.subcategory is "tracker" or "needs-resolution"
    const labels = [label.subcategory, "pending"];

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
    if (label.name === 'i18n-tracker') {
      // https://github.com/w3c/i18n-activity/wiki/Automation-requirements#3-automatic-creation-of-tracker-issues-for-wg-issues-being-tracked
      for (const ilabel of issue.labels) {
        const match = ilabel.name.match(/i18n-([a-zA-Z0-9]+lreq)/);
        if (match) {
          labels.push(match[1]);
        }
      }
      labels.push("spec-type-issue");
    }
    if (shortlabel) labels.push(shortlabel);
    log(issue, `creating a new horizontal issue ${label.gh.full_name} ${title} ${labels.join(',')}`);
    return label.gh.createIssue(title, body, labels);
  }
}

// Check that a specification issue is proper
async function checkIssue(issue, labels, all_hr_issues) {
  const needed_labels = needsHorizontalLabels(issue); // @@deprecate me

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
  // @@deprecate me
  if (needed_labels) {
    const needed = [];
    for (const l of needed_labels) {
      const f = hLabelFound.find(lh => lh.name === l.name);
      if (!f) {
        hLabelFound.push(l);
        needed.push(l);
      }
    }
    if (needed.length > 0) {
      log(issue, `setting labels ${needed.map(l => l.name)}`);
      const repo = createRepository(htmlRepoURL(issue.html_url));
      await repo.setIssueLabel(issue, needed.map(l => l.name));
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
  // see if something needs to be reused from this code
        for (let index = 0; index < foundHR.length; index++) {
          const fissue = foundHR[index];
          const hLabel = hLabelFound[index];
          if (!hasLabel(fissue, hLabel.subcategory)) {
            monitor.log(`mismatched sublabel ${issue.html_url} and ${fissue.html_url} for ${hLabel.name}`);
          }
          if (fissue.hr_prefix !== hLabel.category) {
            monitor.log(`mismatched horizontal ${issue.html_url} and ${fissue.html_url} for ${hLabel.name}`);
          }
        }
}

async function main() {
  const hr = new HorizontalRepositories();
  const labels = await hr.labels;
  let hr_issues = [];

  monitor.log("We're loading the horizontal issues");
  for (const repo of (await hr.repositories)) {
    hr_issues = hr_issues.concat(await getHRIssues(repo));
  }
  monitor.log(`Loaded ${hr_issues.length} horizontal issues for ${labels.length} labels`);

  for (const [key, value] of Object.entries(REPO2SHORTNAMES)) {
    if (value.length != 1) {
      console.log(`SHORTNAME: ${key} has ${value.join(',')}`);
    }
  }

  monitor.log("We're checking the horizontal issues");

  await checkHRIssues(hr_issues, labels);

  let repositories = await fetch(HR_REPOS_URL).then(data => data.json());

  repositories = repositories.concat(EXTRA_REPOSITORIES);

  // transform them into Repository objects
  repositories = repositories.map(r => createRepository(r));

  /*
  monitor.log("We're checking the specification repositories");
  for (let index = 0; index < repositories.length; index++) {
    const repo = repositories[index];
    await hr.checkRepositoryForLabels(repo).catch(e => {
      monitor.error(`repository ${repo.full_name} ${e}`);
    });
  }
  */
  monitor.log("We're loading the specification open issues");
  let all = [];
  for (let index = 0; index < repositories.length; index++) {
    const repo = repositories[index];
    all.push(await repo.getOpenIssues());
  }


  await Promise.all(all).then(issues => {
    issues = issues.flat();
    let total = issues.length;
    monitor.log(`we're checking the ${total} specification open issues`);
    const checks = [];
    for (let index = 0; index < issues.length; index++) {
      const issue = issues[index];
      checks.push(checkIssue(issue, labels, hr_issues));
    }
    return Promise.all(checks);
  })

}

main();
