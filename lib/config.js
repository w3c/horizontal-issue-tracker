/* eslint-env node */

"use strict";

const path = require('path');
const config = require("../config.json");


// environment variables

config.env = process.env["NODE_ENV"] || config.env || "development";
config.port = process.env["PORT"] || config.port || 8080;
config.host = process.env["HOST"] || config.host || "localhost";
config.basedir = process.env["NODE_BASEDIR"] || config.basedir || path.resolve(__dirname, "..");

// DEBUG mode

config.debug = (config.env === "development") || config.debug || false;

// auth tokens and keys

config.ghToken = config.ghToken || "missing-GitHub-token";
config.w3capikey = config.w3capikey || "missing-W3C-API-key";


// app specifics

config.cache = config.cache || "https://labs.w3.org/github-cache";

// dump the configuration into the server log (but not in the server monitor!)
console.log("".padStart(80, '-'));
console.log("Configuration:");
for (const [key, value] of Object.entries(config)) {
  console.log(`${key.padStart(20, ' ')} = ${value}`);
}
console.log("".padStart(80, '-'));

// options is an array of String
config.checkOptions = function (...options) {
  let correct = true;
  options.forEach(option => {
    if (!config[option]) {
      console.error(`config.${option} is missing.`);
      correct = false;
    }
  });
  return correct;
}

module.exports = config;
