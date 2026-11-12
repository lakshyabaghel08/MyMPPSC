# Study Timer design reference

`witherwood.html` is the unchanged `index.html` supplied with the Study Timer request (93,729 bytes).
It is an archival design reference, not an application entry point: the app does not load or import it,
and the service worker does not precache it. Open it separately only when comparing the original design.

The application ports the reference's split-flap geometry and 300 ms + 300 ms animation, Woodland
and Night palettes, drifting leaves, starfield and meteors. The rainfall treatment in this original
file is deliberately **not** shipped in MyMPPSC. The app has only Woodland (light) and Night (dark),
selected by the app theme; its card borders are stronger and its fullscreen layout is centred.

See [the Study Timer UI contract](../UI.md#6d-bis-the-study-timer-workspace) for the implementation rules.

Original SHA-256: `ec2e24de007d5d25a49b1a53914aaa2c6acba3ab93fb4369d39bf13a424429fc`.
