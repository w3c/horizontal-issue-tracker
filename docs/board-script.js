"use strict";

import { config as confinit, el, id, fetchJSON, ghRequest, hrLinkTo } from "../Groups/lib/utils.js";

// Define the repository
const config = confinit({ttl: 15, name: "privacy" });

function display_error(err) {
  id("log").textContent = err;
  if (config.debug) console.error(err);
}

const HR_COMMON = fetchJSON("https://w3c.github.io/common-labels.json")
  .then(labels => labels.filter(l => l.repo)) // only the horizontal repo

const HR_CONFIG = HR_COMMON
  .then(labels => {
    const lf = config.name.toLowerCase();
    const lb = labels.filter(l => l.groupname.toLowerCase() === lf);
    if (lb.length === 2) {
      return lb[0];
    } else {
      throw new Error(`Horizontal ${lf} not found`);
    }
  });

async function getGroup() {
  const grpc = await HR_CONFIG;
  return fetchJSON(`https://api.w3.org/groups/${grpc.group}`).then(data => {
    data.identifier = data._links.self.href.substring('https://api.w3.org/groups/'.length);
    data.horizontal = grpc;
    return data;
  });
}

async function getTrackerIssues() {
  const grpc = await HR_CONFIG;
  return ghRequest(`${config.cache}/v3/repos/${grpc.repo}/issues`, {
    ttl: config.ttl,
    fields: "html_url,number,title,labels,assignees,body,updated_at,created_at"})
   .then(data => {
    data.forEach(issue => {
      // we decorate the issues with their linked spec issue
      issue.hr_url = hrLinkTo(issue);
    });
    return data;
   });
}

async function getReviewRequests() {
  const grpc = await HR_CONFIG;
  return ghRequest(`${config.cache}/v3/repos/${grpc["repo-request"]}/issues`, {
    ttl: config.ttl,
    fields: "html_url,number,title,labels,assignees,created_at"});
}

async function getAgendaRequests() {
  const group = await getGroup();
  return ghRequest(`${config.cache}/extra/issues/${group.id}`, {
    ttl: config.ttl,
    search: "agenda",
    fields: "html_url,title,comments,updated_at,assignee,labels,pull_request,milestone"});
}

async function getCharterReviews() {
  const grpc = await HR_CONFIG;
  const hcomp = `${grpc.groupname} review completed`;
  const raw_issues = await ghRequest(`${config.cache}/v3/repos/w3c/strategy/issues`,
    { ttl: config.ttl,
       labels: "Horizontal%20review%20requested",
       fields: "html_url,number,title,labels,created_at"});
  const issues = [];
  raw_issues.forEach(issue => {
    const labels = issue.labels.filter(l => l.name === hcomp);
    if (labels.length === 0) issues.push(issue);
  });
  return issues;
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
async function screen_refresh() {
  getGroup().then(group => {
    id("name").textContent = group.horizontal.groupname;
    id('nb_leaderboard').href = `leaderboard.html?name=${group.horizontal.groupname}`;
    id('nb_chairboard').href = `https://www.w3.org/PM/Groups/chairboard.html?gid=${group.identifier}`;
    id('nb_agenda').href = `https://www.w3.org/PM/Groups/agenda.html?gid=${group.identifier}`;
    id('nb_issues').href = `https://www.w3.org/PM/Groups/issueboard.html?gid=${group.identifier}`;
  }).catch(display_error);
  getReviewRequests().then(async (data) => {
    const g = await HR_CONFIG;
    const elt = id("reviews");
    const ul = el("ul");
    const a = elt.querySelector("h2 span a");
    let href = `https://github.com/${g["repo-request"]}/issues`;
    a.href = href;
    a.textContent = g["repo-request"];
    data.forEach(issue => {
        const li =
          el("li", 
            el("a", {href:issue.html_url},`${issue.title}`)
          );
        if (issue.assignees && issue.assignees.length) {
          issue.assignees.forEach(assignee => {
            li.append(' (')
            li.append(el("a", {href:`https://github.com/${assignee.login}`},
              assignee.login));
            li.append(')');
          });
        } else {
          li.append(' (please volunteer)');
        }
        ul.append(li);
    });
    elt.querySelector("div").firstElementChild.replaceWith(ul);
  }).catch(display_error);
  getCharterReviews().then(async (data) => {
    const g = await HR_CONFIG;
    const elt = id("charters");
    const ul = el("ul");
    const a = elt.querySelector("h2 span a");
    let href = `https://github.com/w3c/strategy/issues?q=is%3Aopen+label%3A"Horizontal+review+requested"+-label%3A"${g.groupname}+review+completed"`;
    a.href = href;
    a.textContent = "w3c/strategy";
    data.forEach(issue => {
      ul.append(
        el("li", 
          el("a", {href:issue.html_url},`${issue.title}`)
        )
      );
    })
    elt.querySelector("div").firstElementChild.replaceWith(ul);
  }).catch(display_error);

  function li_issue(issue) {
    const li = el("li");
    issue.labels.forEach(label => {
      if (label.name.startsWith('s:')) {
        li.append('[')
        li.append(el("a", {
          class:'spec-label',
          href:label.description},
          label.name.substring(2)));
        li.append('] ');
      }
    });
    li.append(el("a", {href:issue.hr_url},`${issue.title}`));
    li.append(" ",
      el("span", {"class": "intitle"}, "(from ",
      el("a", {href:issue.html_url},`#${issue.number}`),
      ")")
    );
    return li;
  }
  getTrackerIssues().then(async (data) => {
    const g = await HR_CONFIG;
    const elt = id("tracker");
    const a = elt.querySelector("h2 span a");
    let href = `https://github.com/${g["repo"]}/issues`;;
    a.href = href;
    a.textContent = g.repo;
    let ul = el("ul");
    let nrs = data.filter(i => i.labels.find(l=>l.name==='needs-resolution'));
    nrs.forEach(issue => ul.append(li_issue(issue)));
    id("label-needs-resolution").querySelector("summary").textContent = `${nrs.length} ${g.groupname} issues with needs-resolution`;
    id("label-needs-resolution").querySelector("div").firstElementChild.replaceWith(ul);
    ul = el("ul");
    nrs = data.filter(i => i.labels.find(l=>l.name==='tracker'));
    nrs.forEach(issue => ul.append(li_issue(issue)));
    id("label-tracker").querySelector("summary").textContent = `${nrs.length} ${g.groupname} issues with tracker`;
    id("label-tracker").querySelector("div").firstElementChild.replaceWith(ul);
  }).catch(display_error);

  getAgendaRequests().then(async (data) => {
    const g = await HR_CONFIG;
    const elt = id("agenda");
    const a = elt.querySelector("h2 span a");
    let href = `https://www.w3.org/groups/${g.group}/tools/#repositories`;
    a.href = href;
    const ul = el("ul");
    data.forEach(issue => {
      const li =
      el("li", 
        el("a", {href:issue.html_url},`${issue.title}`)
      );
      ul.append(li);
    })
    elt.querySelector("div").firstElementChild.replaceWith(ul);
  }).catch(display_error);

  // 
  HR_COMMON.then(data => {
    const elt = id("others").firstElementChild;
    const commons = new Set();
    data.forEach(entry => commons.add(entry.groupname));
    elt.replaceChildren(); // clear the element content
    commons.forEach(name => {
      elt.append(" [",
        el("a", {href: `?name=${name}`}, name),
        "]"
      );
    });
  }).catch(display_error);
}

// the script is defer, so just go for it when you're ready
screen_refresh().catch(display_error);
