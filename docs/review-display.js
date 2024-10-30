"use strict";

import { config as confinit, formatDate, el, id, fetchJSON, hrLinkTo, ghRequest } from "./Groups/lib/utils.js";

// Define the repository
const config = confinit({
  shortname: 'html',
  ttl: 15,
  // the labels to display on the page
  labels: [{
    name: 'needs-resolution',
    color: 'red'
  },
  {
    name: 'tracker',
    color: 'blue'
  }],
  extra_labels: ''
});

const HR_LABELS = fetchJSON("https://w3c.github.io/common-labels.json")
  .then(labels => labels.filter(l => l.repo));
const SHORTNAMES = fetchJSON("shortnames.json");

function display_error(err) {
  id("log").textContent = err;
  if (config.debug) console.error(err);
}

// might as well do this here, we'll use it as an array later
config.extra_labels = config.extra_labels.split(',');
config.all_labels = [].concat(config.labels.map(l => l.name), config.extra_labels);

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
  const slabel = `s:${config.shortname}`;
  const labels = await HR_LABELS;

  const repos = [...new Set(labels.map(l => l.repo))].sort();
  let ipromises = [];

  repos.forEach(repo => {
    const GH_URL = `${config.cache}/v3/repos/${repo}/issues`;
    ipromises.push(ghRequest(GH_URL, {
      state: 'all',
      ttl: config.ttl,
      fields: "body,html_url,state,labels,title,created_at,number"
    })); // might as well request the max
  });
  let issues = await Promise.all(ipromises)
  .then(r => {
    let nt = [];
    r.forEach((hrepo, index) => {
      let entry = {
        repo: repos[index],
        issues: hrepo.filter(issue => issue.labels
          && (issue.labels.find(l => l.name === "tracker") || issue.labels.find(l => l.name === "needs-resolution"))
          && issue.labels.find(l => l.name === slabel))
      }
      nt.push(entry);
    })
    return nt;
  })

  if (config.debug) console.log(`finished Issue length: ${issues.length}`);


  let link;
  issues.forEach(entry => {
    let issue = entry.issues[0];
    if (!link && issue) {
      link =  issue.labels.find(l => l.name === slabel).description;
    }
  })
  if (link) {
    id('spec_link').href = link;
  }

  // group issues by label, adding to the labels array
  let repo_labels = [];
  let issuesCounter = 0;
  let needsResolutionCounter = 0;
  issues.forEach(entry => {
    entry.issues.forEach(issue => {
      if (issue.state == "open" && issue.labels.find(l => l.name === "needs-resolution")) {
        needsResolutionCounter++;
      }
      issuesCounter++;
      for (const label of issue.labels) { // remember labels for buildFilters
        if (config.debug) console.log(label.name);
          repo_labels[label.name] = label;
      }
    });
    displayRepo(entry.repo,
      (labels.find(r => r.repo === entry.repo)).groupname,
       entry.issues);
  });

  buildFilters(repo_labels);

  // tally the issues on the page
  const trs = document.querySelectorAll('tr')
  id('total').textContent = trs.length;
  if (needsResolutionCounter > 0) {
    id('blocker').textContent = needsResolutionCounter;
    id('status').textContent = '🛑';
  } else if (issuesCounter > 0) {
    id('status').textContent = '✅';
  }

  for (const e of document.getElementsByClassName('shortname')) {
    e.textContent = config.shortname;
  }
  id('spec_link').textContent = config.shortname;

  SHORTNAMES.then(data => {
    let name = data[config.shortname];
    if (name && name.title) {
      for (const e of document.getElementsByClassName('shortname')) {
        e.textContent = name.title;
      }
      id('spec_link').textContent = name.title;
    }
    if (name) {
      if (name.serie) {
        id('spec_link').href = `https://www.w3.org/TR/${name.serie}`;
      } else if (name.link) {
        id('spec_link').href = name.link;
      }
    }
}).catch(err => {
    display_error(err);
  });
}

// Display repository information
function displayRepo(repo, groupname, issues) {
  // Add a container to put the repository info and issues in
  let table, tr, td, a, updated, toc, span
  let labelSection = el('section',
    el('h2', {id:repo},
    el('a', {class:'self-link','aria-label':'§', href:`#${repo}`}, ''),
    el('a', {href: `https://github.com/${repo}/issues?q=label:s:${config.shortname}`}, groupname)));

  table = el('table');
  const open_issues = issues.filter(issue => issue.state === 'open');
  const closed_issues = issues.filter(issue => issue.state === 'closed');

  for (const issue of open_issues) {
    tr = el('tr');
    td = el('td');

    for (const label of issue.labels.filter(l => config.all_labels.includes(l.name))) {
      if (label.name == "tracker" || label.name == "needs-resolution") {
        const l = config.labels.find(l => l.name === label.name);
        td.append(el('span',
          {style: `background-color:${l.color}`,
            title: l.name, class: 'labels' },
           `${l.name} `));
      }
    }
    //a.href = issueData['html_url']
    td.append(el('a', {href:hrLinkTo(issue),target:'_blank'}, issue.title));
    tr.append(td);

    tr.append(el('td', {class:'date',title:'Date created'}, formatDate(new Date(issue.created_at))));

    td = el('td',{title:'Issue number in the tracker repo',class:'trackerId'},
      el('a',
        {href:`https://github.com/${repo}/issues/${issue.number}`,target:'_blank'},
         issue.number));
    //td.textContent = issueData.number
    tr.append(td)

    table.append(tr)
  }

  if (open_issues.length) {
    labelSection.append(table);
  } else {
    labelSection.append(el('p', 'No open horizontal issues found.'));
  }

  let plurial = 's';
  let n = closed_issues.length;
  if (n === 1) plurial = '';
  if (n === 0) n = 'No';
  labelSection.append(el('p', `${n} closed horizontal `,
  `issue${plurial} found.`));


  // Add the label header to the DOM
  id("rawdata").append(labelSection)
}

// build our menu
function buildFilters(repo_labels) {
  const ul = id("filterList");

  function createLi(label) {
    const span = el('span',
      {class:'labels',style: `background-color:${label.color}`},
       ` ${String.fromCharCode(160)} `);
    return el('li', {"data-label":`${label.name}`},
      el('span',
        span, ` ${String.fromCharCode(160)} ${label.name}`));
  }

  for (const label of config.labels) {
    const gh_label = repo_labels[label.name];
    if (gh_label) {
      ul.append(createLi(label));
    }
  }

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


// the script is defer, so just go for it when you're ready
getAllData().then(() => {
  if (config.debug) console.log("DONE");
})
