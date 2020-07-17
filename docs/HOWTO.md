For Working Groups
==================

* Apply the *-tracker label in your own repository to draw a horiztontal review group's attention to an issue in one of your own repositories.  Horizontal review groups may also apply the label if they are interested in tracking a particular issue.

* Horizontal review groups may apply the *-needs-resolution to issues they expect to be resolved before the specification moves to a new maturity level.  Working Groups must not remove or add the *-needs-resolution label.

* If *-needs-resolution is applied to an issue, automatic tooling will remove the *-tracker label.

## Do these labels replace the need to ask for horizontal review?

No.  The is *-tracker label asks for input on a specific issue.  For comprehensive review, follow [the published process for requesting horitzontal review](https://www.w3.org/wiki/DocumentReview#How_to_get_horizontal_review)


For horizontal review groups
============================

* WGs may apply the *-tracker label to issues in their own repositories to draw your attention to specific issues. 

* You may also apply the *-tracker label to issues you want to follow.

* Apply the *-needs-resolution label to issues you expect to be resolved before a specification moves to a new maturity level.

* When either label is applied in a WG repository, a tracking issue will be created in your own repository within about a day.  Such new issues are also marked as 'pending'.  You may remove the 'pending' label after triaging the issue.

* Alternatively, you may apply the needs-resolution label to an existing tracking issue to upgrade it.  

* Whenever *-needs-resolution or needs-resolution is applied to an existing tracked issue, an automatic tool will remove the -tracking and tracked labels (in a few hours).

## What happens to unresolved issues marked *-needs-resolution?

As lead technical architect, the W3C Director is tasked (among many things) to assess consensus within W3C for architectural issues and to decide on the outcome of [Formal Objections](https://www.w3.org/2019/Process-20190301/#FormalObjection). When a horizontal issue gets flagged as *-needs-resolution and a Group chooses to request a new Maturity level despite the lack of consensus with the horizontal group, it is the task of the Director to assess the issue and the outcome of the request. A horizontal group MAY choose to elevate an horizontal issue as a Formal Objection to elevate further the importance of an issue per the W3C Process.

In the case where an horizontal issue hasn't been addressed and the document was allowed to move forward, it is recommended that the issue remains open in the horizontal group repository (it MAY get closed in the specification repository unless the Director requests otherwise). Some issues may take years to get resolved, but that doesn't mean those should be forgotten.
