/* eslint-env browser */

"use strict";

// Define the repository
const config = {
  shortname: 'html',
  debug: false,
  ttl: 15,
  // the labels to display on the page
  labels: 'pending,needs-resolution,tracker,close?',
  extra_labels: 'advice-requested,needs-review,waiting,deferred'
};

const LABELS_URL = "https://w3c.github.io/hr-labels.json";

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
  const slabel = `s:${config.shortname}`;
  const labels = await fetch(LABELS_URL).then(data => data.json());
  const repos = [...new Set(labels.map(l => l.repo))].sort();
  let ipromises = [];
  repos.forEach(repo => {
    const GH_URL = `${GH_CACHE}/v3/repos/${repo}/issues`;
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
        issues: hrepo.filter(issue => issue.labels && issue.labels.find(l => l.name === slabel))
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
    document.getElementById('spec_link').href = link;
  }

  // group issues by label, adding to the labels array
  let repo_labels = [];
  issues.forEach(entry => {
    entry.issues.forEach(issue => {
      for (const label of issue.labels) { // remember labels for buildFilters
        if (config.debug) console.log(label.name);
          repo_labels[label.name] = label;
      }
    });
    displayRepo(entry.repo, entry.issues);
  });

  buildFilters(repo_labels);

  // tally the issues on the page
  const trs = document.querySelectorAll('tr')
  document.getElementById('total').textContent = trs.length;

  document.getElementById('shortname').textContent = config.shortname;
  document.getElementById('spec_link').textContent = config.shortname;
}

// Display repository information
function displayRepo(repo, issues) {
  // Add a container to put the repository info and issues in
  let table, tr, td, a, updated, toc, span
  let labelSection = domElement('section',
    domElement('h2', {id:repo},
    domElement('a', {class:'self-link','aria-label':'§', href:`#${repo}`}, ''),
    domElement('a', {href: `https://github.com/${repo}/issues?q=label:s:${config.shortname}`}, repo)));

  table = domElement('table');
  const open_issues = issues.filter(issue => issue.state === 'open');
  const closed_issues = issues.filter(issue => issue.state === 'closed');

  for (const issue of open_issues) {
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
        {href:`https://github.com/${repo}/issues/${issue.number}`,target:'_blank'},
         issue.number));
    //td.textContent = issueData.number
    tr.appendChild(td)

    table.appendChild(tr)
  }

  if (open_issues.length) {
    labelSection.appendChild(table);
  } else {
    labelSection.appendChild(domElement('p', 'No open horizontal issues found.'));
  }

  labelSection.appendChild(domElement('p', `${closed_issues.length} closed horizontal issues found.`));


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
      domElement('span',
        span, ` ${String.fromCharCode(160)} ${label.name}`));
  }

  for (const label of config.labels) {
    const gh_label = repo_labels[label];
    if (gh_label) {
      ul.appendChild(createLi(gh_label));
    }
  }

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


// the script is defer, so just go for it when you're ready
getAllData().then(() => {
  if (config.debug) console.log("DONE");
})
