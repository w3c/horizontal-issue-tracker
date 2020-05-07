# horizontal-issue-tracker

Tools and pages to track horizontal issues

The official definition for [horizontal labels](https://w3c.github.io/hr-labels.json) is available as JSON.

# node set-labels.js [repository full names]*

This will check and set horizontal labels and teams appropriately for GitHub repositories (or a new one if passed as arguments).

If no arguments, it will fetch the list of repositories to check/set from [validate-repos](https://w3c.github.io/validate-repos/hr-repos.json).

Note that, if you set a new one, [validate-repos](https://w3c.github.io/validate-repos/hr-repos.json) can take up to 24 hours to be updated.

