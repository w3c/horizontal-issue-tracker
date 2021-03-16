const fetch   = require("node-fetch"),
      config  = require("./config.js"),
      monitor = require("./monitor.js"),
      whatwg_lib  = require("./whatwg.js")
      ;

function w3c() {
  return fetch("https://w3c.github.io/validate-repos/hr-repos.json").then(data => data.json())
    .then(data => data.map(r => r.toLowerCase()));
}

function extra() {
  return fetch("https://w3c.github.io/horizontal-issue-tracker/extra_repositories.json").then(data => data.json())
    .then(data => data.map(r => r.toLowerCase()));
}

function whatwg(cached) {
  return whatwg_lib.workstreams(cached)
    .then(streams => streams.map(s => "whatwg/" + s.href.match(new RegExp("^https://([^.]+).spec.whatwg.org/"))[1]))
    .then(data => data.map(r => r.toLowerCase()));
}

let all_cache;
function all(cached) {
  if (cached && all_cache) {
    return all_cache;
  }
  return Promise.all([ w3c(), whatwg() ])
   .then(data => {
     return extra().then(extra => {
      return data.concat(extra);
     }).catch(err => {
       // continue even if someone made a syntax error in extra repositories
       monitor.error(`error while loading extra repositories ${err}`);
       return data;
     })
    })
   .then(data => new Set(data.flat())) //make sure entries are uniq
   .then(data => {
    if (cached) all_cache = data;
    return [...data];
   });
}

// @@ move this code
if (config.debug) {
  Promise.all([ w3c(), whatwg() ])
   .then(data => new Set(data.flat()))
   .then(data => {
      extra().then(extras => {
        extras.forEach(extra => {
          if (data.has(extra)) monitor.warn(`Remove ${extra} from extra`);
        })
      });
  }).catch(monitor.error);
}

module.exports = {
  w3c: w3c,
  extra: extra,
  whatwg: whatwg,
  all: all
}
