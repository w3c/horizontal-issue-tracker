"use strict";

import { config as confinit, formatDate, el, id, fetchJSON, hrLinkTo, ghRequest } from "../Groups/lib/utils.js";

// Define the repository
const config = confinit({
  // the horizontal group repository
  repo: 'w3c/i18n-activity',
  ttl: 15,
  // the labels to display on the page
  labels: 'pending,needs-resolution,tracker,close?',
  extra_labels: 'advice-requested,needs-review,waiting,deferred'
});

const HR_LABELS = fetchJSON("https://w3c.github.io/common-labels.json")
  .then(labels => labels.filter(l => l.repo));
const SHORTNAMES = fetchJSON("shortnames.json");

function display_error(err) {
  id("log").textContent = err;
  if (config.debug) console.error(err);
}

// might as well do this here, we'll use it as an array later
config.labels = config.labels.split(',');
config.extra_labels = config.extra_labels.split(',');
config.all_labels = [].concat(config.labels, config.extra_labels);

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
  const hr_repos = await HR_LABELS;
  const GH_URL = `${config.cache}/v3/repos/${config.repo}/issues`;
  let issues;
  const sections = {};
  const repo_labels = {};
  const short_labels = [];
  const sprefix = 's:';
  const lFilter = l => l.name.startsWith(sprefix);

  // console.log(hr_repos.find(r => r.repo === config.repo));
  config.groupname = (hr_repos.find(r => r.repo === config.repo)).groupname;

  for (const a of document.getElementsByClassName('link_repo')) {
    a.textContent = config.repo;
    a.href = `https://github.com/${config.repo}/issues`;
  }

  for (const e of document.getElementsByClassName('groupname')) {
    e.textContent = config.groupname;
  }

  // here we go, request the open issues
  const promise_issues = ghRequest(GH_URL, {
    ttl: config.ttl,
    fields: "body,html_url,labels,title,created_at,number"
  }); // might as well request the max

  // this is for perf testing purposes. a race between github and github-cache
  fetchJSON(`https://api.github.com/repos/${config.repo}/issues`).catch(display_error);

  issues = await promise_issues;

  if (config.debug) console.log(`finished Issue length: ${issues.length}`);

  issues = issues.filter(issue => issue.labels); // filter out issues with no labels

  // group issues by label, adding to the labels array
  for (const issue of issues) {  // for each issue with labels grabbed from GH
    for (const label of issue.labels.filter(lFilter)) { // for each shortname label in that issue
      if (sections[label.name]) {
        sections[label.name].push(issue);
      } else {
        sections[label.name] = [issue];
        short_labels.push(label);
      }
    }
    for (const label of issue.labels) { // remember labels for buildFilters
      if (config.debug) console.log(label.name);
      repo_labels[label.name] = label;
    }
  }
  for (const [header, fIssues] of Object.entries(sections)) {
    const label = short_labels.find(l => l.name === header);
    let short_label = header.substring(sprefix.length);
    SHORTNAMES.then(data => {
      let name = data[short_label];
      let title = short_label;
      if (name && name.title) {
        title = name.title;
      }
      displayRepo(title, short_label, label, fIssues);
    }).catch(err => {
      displayRepo(short_label, short_label, label, fIssues);
    });
  }

  buildFilters(repo_labels);

  // tally the issues on the page
  // const trs = document.querySelectorAll('tr')
  // id('total').textContent = trs.length;

  otherTrackingRepos();
}

// Display repository information
function displayRepo(header, short_label, label, issues) {
  // Add a container to put the repository info and issues in
  let table, tr, td, a, updated, toc, span
  let labelSection = el('section',
    el('h2', {id:header},
    el('a', {class:'self-link','aria-label':'§', href:`#${header}`}, ''),
    el('a', {href:`${label.description}`}, header),
    " (",
    el('a', {href:`review.html?shortname=${short_label}`}, "filter"),
    ")"));

  table = el('table');

  for (const issue of issues) {
    tr = el('tr');
    td = el('td');

    for (const label of issue.labels.filter(l => config.all_labels.includes(l.name))) {
      if (label.name == "tracker" || label.name == "needs-resolution") {
        td.append(el('span',
          {style: `background-color:#${label.color}`,
            title: label.name, class: 'labels' },
           `${label.name} `));
      }
    }
    //a.href = issueData['html_url']
    td.append(el('a', {href:hrLinkTo(issue),target:'_blank'}, issue.title));
    tr.append(td);

    td = el('td');
    td.className = 'issueType'
    // find labels
    for (const label of issue.labels.filter(l => config.all_labels.includes(l.name))) {
      if (!(label.name == "tracker" || label.name == "needs-resolution")) {
        td.append(el('span',
          {style: `background-color:#${label.color}`,
            title: label.name, class: 'labels'},
           `${label.name} `));
      }
    }
    tr.append(td);

    tr.append(el('td', {class:'date',title:'Date created'}, formatDate(issue.created_at)));

    td = el('td',{title:'Issue number in the tracker repo',class:'trackerId'},
      el('a',
        {href:`https://github.com/${config.repo}/issues/${issue.number}`,target:'_blank'},
         issue.number));
    //td.textContent = issueData.number
    tr.append(td)

    table.append(tr)
  }

  labelSection.append(table)
  // Add the label header to the DOM
  id("rawdata").append(labelSection)
}

// build our menu
function buildFilters(repo_labels) {
  const ul = id("filterList");

  function createLi(label) {
    const span = el('span',
      {class:'labels',style: `background-color:#${label.color}`},
       ` ${String.fromCharCode(160)} `);
    return el('li', {"data-label":`${label.name}`},
      el('a',
        {href:'#', title:`${label.description}`, onclick:`filterByLabel('${label.name}')`},
        span, ` ${String.fromCharCode(160)} ${label.name}`));
  }

  for (const label of config.labels) {
    const gh_label = repo_labels[label];
    if (gh_label) {
      ul.append(createLi(gh_label));
    }
  }

  const clear = el('li',
  el('a',{href:"#",title:'Clear all of the filters',onclick:"filterByLabel('clear')"},
    el("span", {class:'labels',style:"background-color: white"},
              ` ${String.fromCharCode(160)} `),
    ` ${String.fromCharCode(160)} Clear filter`));
  ul.append(clear);

  let internalLine = false;
  for (const extra_label of config.extra_labels) {
    const gh_label = repo_labels[extra_label];
    if (gh_label) {
      if (!internalLine) {
        ul.append(el('li', "Internal group labels:"));
        internalLine = true;
      }
      ul.append(createLi(gh_label));
    }
  }

}

// build our menu
async function otherTrackingRepos() {
  const ul = id("otherReposList");
  const labels = await HR_LABELS;
  const repos = [...new Set(labels.map(l => l.repo))].sort();
  let hr_issues = [];

  for (const repo of repos) {
    const li = el('li', el('a',{href:`?repo=${repo}`}, ` ${repo}`));
    if (config.repo === repo) {
      li.classList.add('selected');
    }
    ul.append(li);
  }
}

// invoke when selecting a filter in the menu
function filterByLabel(label) {
  const rawdata = id('rawdata');
  const filterMenu = id("filterList");

  if (config.debug) console.log(`filterByLabel('${label}')`);

  // filters page contents to show only those items with label specified
  const sections = rawdata.querySelectorAll('section');

  // clear all previous filters
  for (const tr of rawdata.querySelectorAll('tr')) {
    tr.classList.remove('hidden');
  }
  for (const section of sections) {
    section.classList.remove('hidden');
  }
  for (const li of filterMenu.querySelectorAll('li')) {
    li.classList.remove('selected');
  }
  if (label === 'clear') {
    let trsTotal = rawdata.querySelectorAll('tr');
    id('total').textContent = trsTotal.length;
    id("select-label").textContent = '';
    return; // abort
  }

  for (const section of sections) {
    let secLabelFound = false;
    for (const issue of section.querySelectorAll('tr')) {
      let labelFound = false;
      for (const span of issue.querySelectorAll('span')) {
        if (span.title === label) {
          labelFound = true;
        }
      }
      if (!labelFound) {
        issue.classList.add('hidden')
      } else {
        secLabelFound = true;
      }
    }
    if (!secLabelFound) {
      section.classList.add('hidden')
    }
  }

  for (const li of filterMenu.querySelectorAll('li')) {
    if (li.getAttribute('data-label') === label) {
      li.classList.add('selected');
    }
  }

  // tally the issues on the page
  let trsTotal = document.querySelectorAll('tr')
  let trs = document.querySelectorAll('tr.hidden')
  let filteredIssues = trsTotal.length - trs.length
  id('total').textContent = filteredIssues;
  id("select-label").textContent = `, with label '${label}'`;
}


// the script is defer, so just go for it when you're ready
getAllData().then(() => {
  if (config.debug) console.log("DONE");
})
