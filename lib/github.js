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
    if (ttl !== undefined) param.ttl = ttl;
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

  // @@TODO needs to invalidate the cache upstream for getIssues ?

  async createIssue(title, body, labels) {
    console.error(`POST /repos/${this.full_name}/issues`);
    return octokit.request(`POST /repos/${this.full_name}/issues`, {
      title: title,
      body: body,
      labels: labels
    }).then(res => {
      if (res.status === 201) {
        return res.data;
      } else {
        throw new Error(`Unexpected HTTP ${res.status} return code`);
      }
    });
  }

  /*
   * Labels
   */
  async getLabels(ttl) {
    const param = {};
    if (ttl === undefined && this._labels) return this._labels;
    if (ttl !== undefined) param.ttl = ttl;
    return this._labels = octokit.get(`/v3/repos/${this.full_name}/labels`, param);
  }

  async getLabel(label, ttl) {
    return (await this.getLabels(ttl)).filter(l => l.name === label.name);
  }

  // @@TODO needs to invalidate the cache upstream for getLabels ?

  async setLabel(label) {
    return octokit.request(`POST /repos/${this.full_name}/labels`, {
      name: label.name,
      color: label.color,
      description: label.description
    });
  }

  async updateLabel(label) {
    return octokit.request(`PATCH /repos/${this.full_name}/labels/:name`, {
      name: label.name,
      color: label.color,
      description: label.description
    });
  }

  async renameLabel(label) {
    return octokit.request(`PATCH /repos/${this.full_name}/labels/:oldname`, {
      oldname: label.oldname,
      new_name: label.name,
      color: label.color,
      description: label.description
    });
  }


  // @@TODO needs to invalidate the cache for getLabels

  async setIssueLabel(issue, labels) {
    return octokit.request(`POST /repos/${this.full_name}/issues/${issue.number}/labels`, {
      labels: labels
    });
  }

  async removeIssueLabel(issue, label) {
    return octokit.request(`DELETE /repos/${this.full_name}/issues/${issue.number}/labels/${label.name}`);
  }

  async createContent(path, message, content, branch) {
    let file = await octokit.request(`GET /repos/${this.full_name}/contents/${path}`).catch(err => {
      return err;
    });

    let sha;
    if (file.status === 200) {
      if (file.data.type !== "file") {
        throw new Error(`${path} isn't a file to be updated. it's ${file.data.type}.`);
      }
      // we're about to update the file
      sha = file.data.sha;
    } else if (file.status === 404) {
      // we're about to create the file
    } else {
      throw file;
    }
    content = Buffer.from(content, "utf-8").toString('base64');
    return octokit.request(`PUT /repos/${this.full_name}/contents/${path}`, {
      message: message,
      content: content,
      sha: sha,
      branch: branch
    });
  }

  async getContent(path) {
    return octokit.request(`GET /repos/${this.full_name}/contents/${path}`);
  }
}


class GitHub {

  get ratelimit() {
    return octokit.request(`GET /rate_limit`).then(r => r.data);
  }

}

function setHRTeam(repo) {
  return octokit.request(`PUT /orgs/${repo.owner}/teams/horizontal-admin/repos/${repo.full_name}`, {
    permission: "triage"
  });
}

module.exports = { Repository: Repository, Issue: Issue, GitHub: GitHub, setHRTeam };
