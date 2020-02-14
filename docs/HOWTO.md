How to create and track horizontal issues
=========================================

# I'm a group participant, how to add my issues to a horizontal group tracker?

If you believe that an issue or a pull request may need the attention of an horizontal group, you just need to add the proper *-tracker horizontal label to the issue in the specification repository. *-needs-resolution is reserved to horizontal group participants. Our tracker tool will then add your issue into the proper horizontal tracker repository within a day or so. Note that setting a label requires write access to the specification repository.

All specification repositories get those horizontal labels by default. A description of the [list of horizontal labels](https://w3c.github.io/issue-metadata.html#horizontal-reviews) is available.

# What's the difference between -tracker and -needs-resolution ?

* *-tracker indicates that this issue should be brought to the attention of the horizontal group.
* *-needs-resolution is used by horizontal group to indicate their expectation before a transition.

# I'm a horizontal group participant and believe an issue needs to be satisfied

A horizontal group may have raised, or is following an issue, and expects it to be resolved to their satisfaction
before a transition. The *-needs-resolution label is added/applied only an the horizontal group, and should only be
removed by the horizontal group. It may replace a *-tracker label.
