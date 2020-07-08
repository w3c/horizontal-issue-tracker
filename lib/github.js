/* eslint-env node */

"use strict";

const octokit = require("./octokit-cache.js");

class Issue {
  constructor(gh_issue) {
    Object.assign(this, gh_issue);
  }
  get getComments() {
    return octokit.get(`/v3/repos/${this.full_name}/issues/${this.number}/comments`);
  }
}

class Repository {
  constructor(name, ttl) {
    this.full_name = name;
    const parts = name.split('/');
    this.owner = parts[0];
    this.name = parts[1];
    this.ttl = ttl;
  }

  // retrieve and normalize w3c.json
  get w3c() {
    return octokit.get(`/extra/repos/${this.full_name}/w3c.json`).then(data => {
      if (data.group && !Array.isArray(data.group)) {
        data.group = [data.group];
      }
      return data;
    });
  }

  get config() {
    return octokit.get(`/v3/repos/${this.full_name}`)
      .then(data => {
        return this.w3c.then(w3c => {
          data.w3c = w3c;
          return data;
        });
      }).catch(() => {});
  }

  get teams() {
    return octokit.get(`/v3/repos/${this.full_name}/teams`);
  }

  get hooks() {
    return octokit.get(`/v3/repos/${this.full_name}/hooks`);
  }

  async getIssues(ttl) {
    const param = {};
    if (this._issues) return this._issues;
    if (ttl) param.ttl = ttl;
    return this._issues = octokit.get(`/v3/repos/${this.full_name}/issues?state=all`, param);
  }

  async getOpenIssues(ttl) {
    return (await this.getIssues(ttl)).filter(issue => issue.state === "open");
  }

  async getClosedIssues(ttl) {
    return (await this.getIssues(ttl)).filter(issue => issue.state === "closed");
  }

  async getIssue(number, ttl) {
    return (await this.getIssues(ttl)).filter(issue => issue.number === number)[0];
  }

  // @@TODO needs to invalidate the cache for getIssues

  async createIssue(title, body, labels) {
    return octokit.request("POST /repos/:repo/issues", {
      repo: this.full_name,
      title: title,
      body: body,
      labels: labels
    });
  }

  /*
   * Labels
   */
  async getLabels(ttl) {
    const param = {};
    if (ttl === undefined && this._labels) return this._labels;
    if (ttl) param.ttl = ttl;
    return this._labels = octokit.get(`/v3/repos/${this.full_name}/labels`, param);
  }

  async getLabel(label, ttl) {
    return (await this.getLabels(ttl)).filter(l => l.name === label.name);
  }

  // @@TODO needs to invalidate the cache for getLabels

  async setLabel(label) {
    return octokit.request("POST /repos/:repo/labels", {
      repo: this.full_name,
      name: label.name,
      color: label.color,
      description: label.description
    });
  }

  async updateLabel(label) {
    return octokit.request("PATCH /repos/:repo/labels/:name", {
      repo: this.full_name,
      name: label.name,
      color: label.color,
      description: label.description
    });
  }

  async renameLabel(label) {
    return octokit.request("PATCH /repos/:repo/labels/:oldname", {
      repo: this.full_name,
      oldname: label.oldname,
      new_name: label.name,
      color: label.color,
      description: label.description
    });
  }


  // @@TODO needs to invalidate the cache for getLabels

  async setIssueLabel(issue, labels) {
    return octokit.request("POST /repos/:repo/issues/:issue_number/labels", {
      repo: this.full_name,
      issue_number: issue.number,
      labels: labels
    });
  }

  async removeIssueLabel(issue, label) {
    return octokit.request("DELETE /repos/:repo/issues/:issue_number/labels/:name", {
      repo: this.full_name,
      issue_number: issue.number,
      name: label.name
    });
  }

}

class GitHub {

  get ratelimit() {
    return octokit.request(`GET /rate_limit`).then(r => r.data);
  }

}

function setHRTeam(repo) {
  return octokit.request(`PUT /orgs/${repo.owner}/teams/horizontal-admin/repos/${repo.full_name}`, {
    permission: "pull"
  });
}

module.exports = { Repository: Repository, Issue: Issue, GitHub: GitHub, setHRTeam };
