/* eslint-env browser */

"use strict";

// Define the repository
const config = {
  // the horizontal group repository
  repo: 'w3c/i18n-activity',
  debug: false,
  ttl: 15,
  // the labels to display on the page
  labels: 'pending,needs-resolution,tracker,close?',
  extra_labels: 'advice-requested,needs-review,waiting,deferred'
};

const HR_LABELS = fetch("https://w3c.github.io/hr-labels.json").then(res => res.json());
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

// get the url of the actual issue, if there is a § marker
function linkTo(issue) {
  // get the url of the actual issue, if there is a § marker
  let match = issue.body.match(/§ [^\r\n$]+/g);
  if (match) {
    match = match[0].substring(2).trim().split(' ')[0];
    if (match.indexOf('http') !== 0) {
      match = undefined;
    }
  }
  if (!match) {
    match = issue.html_url;
  }
  return match;
}

// might as well do this here, we'll use it as an array later
config.labels = config.labels.split(',');
config.extra_labels = config.extra_labels.split(',');
config.all_labels = [].concat(config.labels, config.extra_labels);

// for the parameters added to GH URLs
function searchParams(params) {
  if (!params) return "";
  let s = [];
  for (const [key,value] of Object.entries(params)) {
    s.push(`${key}=${value}`);
  }
  return s.join('&');
}

const GH_CACHE = "https://labs.w3.org/github-cache";

/*
 * Grab GitHub data
 */
async function ghRequest(url, options) {
  let data = [];
  let errorText;
  try {
    const response = await fetch(url + '?' + searchParams(options));
    if (response.ok) {
      data = await response.json();
    } else {
      if (response.status >= 500) {
        errorText = `cache responded with HTTP '${response.status}'. Try again later.`;
      } else {
        errorText = `Unexpected cache response HTTP ${response.status}`;
      }
    }
  } catch (err) {
    errorText = err.message;
  }
  if (errorText) {
    const error = { url, options, message: errorText };
    navigator.sendBeacon(`${GH_CACHE}/monitor/beacon`, JSON.stringify({ traceId, error }));
  }
  return data;
}

// telemetry for performance monitoring
const traceId = (""+Math.random()).substring(2, 18); // for resource correlation
const rtObserver = new PerformanceObserver(list => {
  const resources = list.getEntries().filter(entry => entry.name.startsWith(GH_CACHE + '/v3/repos')
                                                      || entry.name.startsWith("https://api.github.com/"));
  if (resources.length > 0) {
    navigator.sendBeacon(`${GH_CACHE}/monitor/beacon`, JSON.stringify({ traceId, resources }));
  }
});
rtObserver.observe({entryTypes: ["resource"]});

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
  const GH_URL = `${GH_CACHE}/v3/repos/${config.repo}/issues`;
  let issues;
  const sections = {};
  const repo_labels = {};
  const short_labels = [];
  const sprefix = 's:';
  const lFilter = l => l.name.startsWith(sprefix);

  console.log(hr_repos.find(r => r.repo === config.repo));
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
  fetch(`https://api.github.com/repos/${config.repo}/issues`).catch(console.error);

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
  const trs = document.querySelectorAll('tr')
  document.getElementById('total').textContent = trs.length;

  otherTrackingRepos();
}

// Display repository information
function displayRepo(header, short_label, label, issues) {
  // Add a container to put the repository info and issues in
  let table, tr, td, a, updated, toc, span
  let labelSection = domElement('section',
    domElement('h2', {id:header},
    domElement('a', {class:'self-link','aria-label':'§', href:`#${header}`}, ''),
    domElement('a', {href:`${label.description}`}, header),
    " (",
    domElement('a', {href:`review.html?shortname=${short_label}`}, "filter"),
    ")"));

  table = domElement('table');

  for (const issue of issues) {
    tr = domElement('tr');
    td = domElement('td');

    for (const label of issue.labels.filter(l => config.all_labels.includes(l.name))) {
      if (label.name == "tracker" || label.name == "needs-resolution") {
        td.appendChild(domElement('span',
          {style: `background-color:#${label.color}`,
            title: label.name, class: 'labels' },
           `${label.name} `));
      }
    }
    //a.href = issueData['html_url']
    td.appendChild(domElement('a', {href:linkTo(issue),target:'_blank'}, issue.title));
    tr.appendChild(td);

    td = domElement('td');
    td.className = 'issueType'
    // find labels
    for (const label of issue.labels.filter(l => config.all_labels.includes(l.name))) {
      if (!(label.name == "tracker" || label.name == "needs-resolution")) {
        td.appendChild(domElement('span',
          {style: `background-color:#${label.color}`,
            title: label.name, class: 'labels'},
           `${label.name} `));
      }
    }
    tr.appendChild(td);

    tr.appendChild(domElement('td', {class:'date',title:'Date created'}, formatDate(new Date(issue.created_at))));

    td = domElement('td',{title:'Issue number in the tracker repo',class:'trackerId'},
      domElement('a',
        {href:`https://github.com/${config.repo}/issues/${issue.number}`,target:'_blank'},
         issue.number));
    //td.textContent = issueData.number
    tr.appendChild(td)

    table.appendChild(tr)
  }

  labelSection.appendChild(table)
  // Add the label header to the DOM
  document.getElementById("rawdata").appendChild(labelSection)
}

// build our menu
function buildFilters(repo_labels) {
  const ul = document.getElementById("filterList");

  function createLi(label) {
    const span = domElement('span',
      {class:'labels',style: `background-color:#${label.color}`},
       ` ${String.fromCharCode(160)} `);
    return domElement('li', {"data-label":`${label.name}`},
      domElement('a',
        {href:'#', title:`${label.description}`, onclick:`filterByLabel('${label.name}')`},
        span, ` ${String.fromCharCode(160)} ${label.name}`));
  }

  for (const label of config.labels) {
    const gh_label = repo_labels[label];
    if (gh_label) {
      ul.appendChild(createLi(gh_label));
    }
  }

  const clear = domElement('li',
  domElement('a',{href:"#",title:'Clear all of the filters',onclick:"filterByLabel('clear')"},
    domElement("span", {class:'labels',style:"background-color: white"},
              ` ${String.fromCharCode(160)} `),
    ` ${String.fromCharCode(160)} Clear filter`));
  ul.appendChild(clear);

  let internalLine = false;
  for (const extra_label of config.extra_labels) {
    const gh_label = repo_labels[extra_label];
    if (gh_label) {
      if (!internalLine) {
        ul.appendChild(domElement('li', "Internal group labels:"));
        internalLine = true;
      }
      ul.appendChild(createLi(gh_label));
    }
  }

}

// build our menu
async function otherTrackingRepos() {
  const ul = document.getElementById("otherReposList");
  const labels = await HR_LABELS;
  const repos = [...new Set(labels.map(l => l.repo))].sort();
  let hr_issues = [];

  for (const repo of repos) {
    const li = domElement('li', domElement('a',{href:`?repo=${repo}`}, ` ${repo}`));
    if (config.repo === repo) {
      li.classList.add('selected');
    }
    ul.appendChild(li);
  }
}

// invoke when selecting a filter in the menu
function filterByLabel(label) {
  const rawdata = document.getElementById('rawdata');
  const filterMenu = document.getElementById("filterList");

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
    document.getElementById('total').textContent = trsTotal.length;
    document.getElementById("select-label").textContent = '';
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
  document.getElementById('total').textContent = filteredIssues;
  document.getElementById("select-label").textContent = `, with label '${label}'`;
}


// the script is defer, so just go for it when you're ready
getAllData().then(() => {
  if (config.debug) console.log("DONE");
})
