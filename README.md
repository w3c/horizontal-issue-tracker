# horizontal-issue-tracker

Tools and pages to track horizontal issues

The official definition for [horizontal labels](https://w3c.github.io/hr-labels.json) is available as JSON.

# node set-labels.js [repository full names]*

This will check and set horizontal labels and teams appropriately for GitHub repositories (or a new one if passed as arguments).

If no arguments, it will fetch the list of repositories to check/set from [validate-repos](https://w3c.github.io/validate-repos/hr-repos.json), as well as a few selected Community Groups.

Note that, if you set a new one, [validate-repos](https://w3c.github.io/validate-repos/hr-repos.json) can take up to 24 hours to be updated.

# node horizontal-task.js

This will create and fix horizontal issues and specification issues as needed

# Dependencies

This tool uses a [GitHub cache](https://github.com/plehegar/github-cache/) to fetch GH resources (due to quota limitations on the GitHub API).
