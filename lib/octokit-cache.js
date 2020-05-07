/* eslint-env node */

"use strict";

const monitor = require('./monitor.js');
const config = require("../config.json");
const fetch  = require("node-fetch");
const { throttling } = require("@octokit/plugin-throttling");
const Octokit = require("@octokit/core").Octokit
  .plugin(throttling);

const MAX_RETRIES = 3;

const CACHE = config.cache || "https://labs.w3.org/github-cache";

const octokit = new Octokit({
  auth: config.ghToken,
  throttle: {
    onRateLimit: (retryAfter, options) => {
      if (options.request.retryCount < MAX_RETRIES) {
        monitor.warn(`Rate limit exceeded, retrying after ${retryAfter} seconds`)
        return true;
      } else {
        monitor.error(`Rate limit exceeded, giving up after ${MAX_RETRIES} retries`);
        return false;
      }
    },
    onAbuseLimit: (retryAfter, options) => {
      if (options.request.retryCount < MAX_RETRIES) {
        monitor.warn(`Abuse detection triggered, retrying after ${retryAfter} seconds`)
        return true;
      } else {
        monitor.error(`Abuse detection triggered, giving up after ${MAX_RETRIES} retries`);
        return false;
      }
    }
  }
});

octokit.get = async function(query_url, options) {
  if (options && options.ttl !== undefined) {
    if (query_url.indexOf("?") !== -1) {
      query_url += "&";
    } else {
      query_url += "?";
    }
    query_url += "ttl=" + options.ttl;
  }
  if (options && options.fields) {
    if (query_url.indexOf("?") !== -1) {
      query_url += "&";
    } else {
      query_url += "?";
    }
    query_url += "fields=" + options.fields;
  }

  function attempt(number) {
    return fetch(CACHE + query_url).then(res => {
      if (res.ok) return res.json();
      if (res.status === 504 && number < 3) {
        // The server was acting as a gateway or proxy and
        // did not receive a timely response from the upstream server.
        // so try again
        return attempt(number++);
      }
      throw new Error("github-cache complained " + res.status + ` ${query_url}`);
    });
  }
  return attempt(0);
}

module.exports = octokit;
