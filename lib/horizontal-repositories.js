/* eslint-env node */

"use strict";

const { Repository, setHRTeam } = require("./github.js"),
  monitor = require("./monitor.js"),
  fetch = require("node-fetch");

// the official source of horizontal labels
const HR_LABELS_URL = "https://w3c.github.io/hr-labels.json";

class HorizontalLabels {
  constructor() {
    this._repositories = []; // initialize before the fetch
    this.labels = fetch(HR_LABELS_URL).then(data => data.json())
      .then(labels => {
        this._repositories = []; // this is meant to prevent duplicate Repository objects
        for (const label of labels) {
          let repo = this._repositories.find(r => r.full_name === label.repo);
          label.category = label.name.substring(0, label.name.indexOf('-'));
          label.subcategory = label.name.substring(label.name.indexOf('-') + 1);
          if (!repo) {
            repo = new Repository(label.repo, 1);
            repo.horizontalCategory = label.category;
            this._repositories.push(repo);
          }
          label.gh = repo;
        }
        return labels;
      });
  }

  get repositories() {
    return this.labels.then(() => this._repositories);
  }

  get url() {
    return HR_LABELS_URL;
  }

  // This checks a repo for the proper horizontal labels
  async checkRepositoryForLabels(repo) {
    const conf = await repo.w3c;
    const repo_labels = await repo.getLabels();
    const hrLabels = await this.labels;
    const promises = [];
    let settingLabel = false;
    hrLabels.forEach(l => {
      let exclude = [];
      if (conf && conf.group) {
        exclude = l.excludeGroups.filter(e => conf.group.includes(e));
      }
      if (exclude.length) {
        // this repo doesn't need this label, abort
        return;
      }

      // do we need to rename some repo labels (mostly unused nowadays)
      let hasIT = repo_labels.filter(la => la.name.toLowerCase() === l.oldname);
      if (hasIT.length) {
        promises.push(repo.renameLabel(l));
      } else {
        // do we have the label?
        hasIT = repo_labels.filter(la => la.name.toLowerCase() === l.name);
        if (!hasIT.length) {
          // nope, set it
          if (!settingLabel) {
            settingLabel = true;
            monitor.log(`Adding horizontal labels for ${repo.full_name}`);
          }
          promises.push(repo.setLabel(l));
        } else if (hasIT[0].color != l.color || hasIT[0].description != l.description) {
          // yes, but not the right color/description
          promises.push(repo.updateLabel(l));
        } else {
          // it's a good one
        } // if
      } // else
    }) // labels.forEach
    return Promise.all(promises); // rejects with the reason of the first promise that rejects
  }

  // This will check if the horizontal-team if present and has pull (triage) access.
  // If not present, it will add the team
  // If not pull (triage) access, it will emit a warning
  async checkRepositoryForTeam(repo) {
    let teams = await repo.teams;
    const triage = teams.find(team => team.name == "horizontal-admin");
    if (!triage) {
      return setHRTeam(repo);
    } else {
      if (triage.permission != "pull") {
        monitor.warn(`${repo.fullname} : triage team has ${triage.permission} ?`);
      }
    }
    return triage;
  }
}

module.exports = HorizontalLabels;