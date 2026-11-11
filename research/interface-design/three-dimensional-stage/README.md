# Three-dimensional stage reference

Preserved on 11 November 2026 before restoring the original illustrated landing page.

- [Implementation snapshot](implementation.zip): the last 3D landing page, its renderer, selection controller, layout, styles, optimized GLBs, model credits, authoring tools and tests. Paths inside the archive are relative to the repository root. Extract into a separate directory for inspection; restoring it over the current checkout would replace the restored original design.
- [Editable Blender project](car-and-driver.blend): the unbranded car and complete seated driver, with hands fitted to the 28 cm steering wheel.
- [Driver selection preview](driver-rankings.png) and [car selection preview](car-rankings.png).
- [Optimized models and credits](../../../site/assets/models/NOTICE.txt) remain at their existing paths. Source car and driver assets also remain in the checkout.

The last experiment used a narrow vertical stack at the far right, matched projected model footprints, 22% opacity for the inactive model, two-axis rotation and 550 ms selection alignment. It is inactive in the current site. Its renderer modules remain in `site/js/stage-model-*.js` for reference; use the matching geometry and page files in the snapshot when revisiting it.

To rebuild the assets from the repository root, run `node tools/build-stage-models.mjs /absolute/path/to/blender`. The builder uses the supplied source files, a C compiler and a 7z-capable archive reader; on first use it downloads the checksum-verified ufbx converter. Source fingerprints and hand-to-wheel geometry are checked by `node tests/test-stage-models.mjs`; independent display motion and sizing are checked by `node tests/test-stage-model-motion.mjs`.

Model licences and creator attribution are retained in the implementation snapshot and original NOTICE file. Authoring and rendering code retains the repository MIT licence.

SHA-256 checksums of the retained GLBs:

```text
b060222c7c0063536dbdd23ce98bdf74d530f57f429be2f6835f2f7e96ae0b7a  site/assets/models/racing-car.glb
ae4eab785ead3527e56dd32640f03d79341df92ed043d18a7cdc8388fa8034ab  site/assets/models/racing-driver.glb
cc9c5c2c8fcbc89632feb972e6b3236450e90d4913529cea23db54d2bb29434c  site/assets/models/car-and-driver.glb
```
