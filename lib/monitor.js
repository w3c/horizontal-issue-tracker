/* eslint no-console: "off", quotes: ["error", "double"] */
"use strict";

// const monitor  = require('./monitor.js');
// let app = express();
// monitor.setName("MyService");
// monitor.install(app, [options]);
//
// options.path - HTTP root path for the monitor, default is /monitor
// options.entries - max number of entries to return in the log
//
// This will expose the following resources
// /monitor/logs
// /monitor/ping
// /monitor/usage

// if you want server timing, add the following after all router/middleware
// monitor.stats(app);
// and don't forget to use next() im between for each router/middleware
// you'll then see those time info added to the log

const gh = require("./octokit-cache.js");

let request_current = 0;
let request_total = 0;
let request_error = 0;
let request_warning = 0;
let name = "Generic Express Monitor";

let logs = [];
let MAX_ENTRIES = 200;

function add(msg) {
  if (logs.length === (MAX_ENTRIES * 2)) {
    // reset the logs to only contain the max number of entries
    logs = logs.slice(MAX_ENTRIES);
  }
  logs.push(msg);
}

let gh_logs = [];

function gh_add(msg) {
  if (gh_logs.length === (MAX_ENTRIES * 2)) {
    // reset the logs to only contain the max number of entries
    gh_logs = gh_logs.slice(MAX_ENTRIES);
  }
  gh_logs.push(msg);
}

let error_logs = [];

function error_add(msg) {
  if (error_logs.length === (MAX_ENTRIES * 2)) {
    // reset the logs to only contain the max number of entries
    error_logs = error_logs.slice(MAX_ENTRIES);
  }
  error_logs.push(msg);
}

function getDate(msg) {
  return  "[" + (new Date()).toISOString() + "] " + msg;
}

let logStat = function(msg) {
  let args = "[stat] " + msg;
  add(args);
  process.nextTick(() => console.log(args));
};

exports.setName = function(newName) {
  name = newName;
}

exports.log = function(msg) {
  let args = "[log] " + getDate(msg);
  add(args);
  process.nextTick(() => console.log(args));
};

exports.gh_log = function(msg) {
  gh_add(getDate(msg));
};

exports.warn = function(msg) {
  let args = "[warn] " + getDate(msg);
  request_warning++;
  add(args);
  process.nextTick(() => console.warn(args));
};

exports.error = function(msg) {
  request_error++;
  let args = "[err] " + getDate(msg);
  add(args);
  error_add(args);
  process.nextTick(() => console.error(args));
};

exports.install = function(app, options) {
  let path = "/monitor";
  if (options !== undefined) {
    if (options.path !== undefined) {
      path = options.path;
    }
    if (options.entries !== undefined) {
      MAX_ENTRIES = options.entries;
    }
  }

  // monitor all methods
  app.use(function (req, res, next) {
    request_total++;
    request_current++;
    req.startTime = Date.now();
    next();
  });

  // grabs the logs easily
  app.get(path + "/logs", function (req, res, next) {
    process.nextTick(function() {
      console.warn("[monitor] " + getDate("/logs " + req.ip));
    });
    let output = "";
    let begin = logs.length - MAX_ENTRIES;
    let end = logs.length;
    if (begin < 0) {
      begin = 0;
    }
    output = logs[begin++];
    for (let index = begin; index < end; index++) {
      output += "\n" + logs[index];
    }
    res.set("Content-Type", "text/plain");
    res.set("Access-Control-Allow-Origin", "*");
    res.send(output);
    next();
  });

  // grabs the github logs easily
  app.get(path + "/gh_logs", function (req, res, next) {
    process.nextTick(function() {
      console.warn("[monitor] " + getDate("/gh_logs " + req.ip));
    });
    let output = "";
    let begin = gh_logs.length - MAX_ENTRIES;
    let end = gh_logs.length;
    if (begin < 0) {
      begin = 0;
    }
    output = gh_logs[begin++];
    for (let index = begin; index < end; index++) {
      output += "\n" + gh_logs[index];
    }
    res.set("Content-Type", "text/plain");
    res.set("Access-Control-Allow-Origin", "*");
    res.send(output);
    next();
  });

  // grabs the error logs easily
  app.get(path + "/error_logs", function (req, res, next) {
    process.nextTick(function() {
      console.warn("[monitor] " + getDate("/error_logs " + req.ip));
    });
    let output = "";
    let begin = error_logs.length - MAX_ENTRIES;
    let end = error_logs.length;
    if (begin < 0) {
      begin = 0;
    }
    output = error_logs[begin++];
    for (let index = begin; index < end; index++) {
      output += "\n" + error_logs[index];
    }
    res.set("Content-Type", "text/plain");
    res.set("Access-Control-Allow-Origin", "*");
    res.send(output);
    next();
  });

  // simple way to check if the server is alive
  app.get(path + "/ping", function (req, res, next) {
    res.set("Content-Type", "text/plain");
    res.set("Access-Control-Allow-Origin", "*");
    res.send("pong");
    next();
  });

  // simple way to check if the server is alive
  app.get(path + "/usage", function (req, res, next) {
    res.set("Content-Type", "application/json");
    res.set("Access-Control-Allow-Origin", "*");
    let obj = process.memoryUsage();
    obj.status = "ok";
    obj.name = name;
    obj.uptime = process.uptime();
    obj.cpuUsage = process.cpuUsage();
    obj.requests = { total: request_total, current: request_current, errors: request_error, warnings: request_warning };
    gh.request("GET /rate_limit")
      .then(data => data.data)
      .catch(() => { return { error: "unreachable"} } )
      .then(data => {
        obj.GitHub = data;
        res.send(JSON.stringify(obj));
        next();
      });
  });
};

exports.stats = function(app) {
  app.use(function (req, res, next) {
    let log = req.method + " " + req.originalUrl;
    if (req.get("traceparent") !== undefined) {
      log = "[" + req.get("traceparent") + "] " + log;
    }
    logStat("[" + (Date.now() - req.startTime) + "ms] " + log);
    request_current--;
    next();
  });
};
