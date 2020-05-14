How to create and track horizontal issues
=========================================

# What is a horizontal issue?

Horizontal issues are issues on specifications raised by an [horizontal group](https://www.w3.org/wiki/DocumentReview#How_to_get_horizontal_review).

Those issues are tracked more closely due to their potential wide impact on users, organizations or the Web architecture.

# Horizontal issues and W3C Process

Horizontal issues should be raised and tracked as early possible. Some get raised before a specification is adopted by a W3C Working Group to be on the Standard track.

From a W3C Process perspective, the Director pays additional attention to horizontal issues before approving a new maturity level for a specification.

Note: In the implementation of the Process 2020, the importance of an issue will more directly impact whether a Group is allowed to get an automatic approval from the Director.

# How do W3C track horizontal issues?

W3C tracks horizontal issues using a set of GitHub labels, allowing both specification contributors and horizontal reviewers to flag an issue as an horizontal issue. The level of importance of such issue may vary depending on the opinion of an horizontal group.

# What's the difference between -tracker and -needs-resolution?

Each horizontal group can a designation to allow grouping of horizontal issues and easy tracking by horizontal group. In each group, there is currently 2 GitHub labels to reflect the degree of importance of such issue.

* *-tracker indicates that this issue should be brought to the attention of the horizontal group.
* *-needs-resolution is used by an horizontal group to indicate their expectation before a specification is allowed to more to a new maturity level.

Note: while the distinction between the two labels is not relevant from a W3C Process perspective, it is intended to help horizontal groups make their intent clear when sorting issues.

# I'm a group participant, how to add my issues to a horizontal group tracker?

If you believe that an issue or a pull request may need the attention of an horizontal group, you just need to add the proper *-tracker horizontal label to the issue in the specification repository. *-needs-resolution is reserved to horizontal group participants. Our tracker tool will then add your issue into the proper horizontal tracker repository within a day or so. Note that setting a label requires write access to the specification repository.

All specification repositories get those horizontal labels by default. A description of the [list of horizontal labels](https://w3c.github.io/issue-metadata.html#horizontal-reviews) is available.

# I'm a horizontal group participant and believe an issue needs to be satisfied

A horizontal group may have raised, or is following an issue, and expects it to be resolved to their satisfaction before a transition. The *-needs-resolution label is added/applied only an the horizontal group, and should only be removed by the horizontal group. It may replace a *-tracker label.

# The Director allowed a new Maturity level despite open horizontal issue with *-needs-resolution?

As lead technical architect, the Director is tasked (among many things) to assess consensus within W3C for architectural issues and to decide on the outcome of [Formal Objections](https://www.w3.org/2019/Process-20190301/#FormalObjection). When a horizontal issue gets flagged as *-needs-resolution and a Group chooses to request a new Maturity level despite the lack of consensus with the horizontal group, it is the task of the Director to assess the issue and the outcome of the request. A horizontal group MAY choose to elevate an horizontal issue as a Formal Objection to elevate further the importance of an issue per the W3C Process.

In the case where an horizontal issue hasn't been addressed and the document was allowed to move forward, it is recommended that the issue remains open in the horizontal group repository (it MAY get closed in the specification repository unless the Director requests otherwise). Some issues may take years to get resolved, but that doesn't mean those should be forgotten.
