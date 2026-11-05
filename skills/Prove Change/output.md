# Output checks

- Is a timing an outlier? Yes: reproduce it on the same input and the same step before explaining it away. No: record the measurement.
- Will a person see a page? Yes: the build session renders and looks at it before shipping, and its review reads the render. No: go on.
- Is the claim a regression comparison of rendered pages, slides or frames? Yes: compare images, not only extracted text, with a page-by-page Python script for raster output; show a planted difference firing before reading the comparison's result. No: go on.
- Is the claim frame-exact? Yes: compare decoded samples across the source cases, including untagged sources, rather than frame markers or a figure from one well-tagged source; decode raw `yuv420p` with `-noautoscale`, since a grey conversion follows the range tag and can hide the change. No: use the specification's output measure.
