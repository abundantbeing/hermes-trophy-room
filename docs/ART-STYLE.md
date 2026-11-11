# Trophy Room art style

Master style for all 120 trophy pictures. Every brief in `art/briefs.jsonl` is rendered by taking the master preamble below, appending the entry's `subject` sentence, then appending the negative list. Nothing else is added per image.

## Brand look

The look comes from the Hermes Agent website.

- Ground: deep midnight navy, a soft vertical gradient from #19192F (top) to #0D0D24 (bottom).
- Field: cobalt blue (#0000F2) halftone and dithered grain, concentrated in the lower third and fading to nothing near the subject's highlights. The grain is coarse and printed, not smooth noise.
- Highlights: periwinkle (#8585F9), used for rim light, specular glints and the finest hairlines.
- Material: polished silver-chrome, engraved neoclassical sculpture with etched line-work. Fine radiating hairlines fan out behind or through the subject, echoing the many-armed chrome classical figure on the website hero.
- Mood: ceremonial, cool, hushed. A museum object lit in a dark room.

## Composition rules

- Square 1:1.
- One bold centered subject. The subject fills about 70 percent of the frame, leaving an even margin on every side.
- Strong silhouette that still reads at 96 px. If the idea needs more than one element, the elements must fuse into one clear shape.
- No text, no letters, no numbers, no logos, no borders, no frames. The app draws the tier frame around the picture.
- Lighting: cool rim light from the upper left, deep shadows falling to the lower right, identical on every image.

## Master prompt preamble (about 80 words)

Square 1:1 museum-grade render of a single centered polished silver-chrome engraved neoclassical sculpture, etched line-work, fine radiating hairlines behind it. Deep midnight navy gradient background from #19192F to #0D0D24, with coarse cobalt blue #0000F2 halftone dithered grain rising from the bottom. Cool periwinkle #8585F9 rim light from the upper left, deep soft shadows to the lower right. Mirror-bright chrome with crisp specular edges. Subject fills about 70 percent of the frame, front three-quarter view at medium camera distance, strong readable silhouette. Subject:

## Negative list

text, letters, numbers, numerals, words, captions, watermark, signature, logo, brand marks, border, frame, vignette frame, drop shadow box, UI elements, photograph of a real person, face of a real person, realistic skin, bright daylight, warm colors, orange, red, green, yellow, pastel, cartoon, anime, flat vector, 3D plastic toy look, clutter, multiple separate subjects, cropped subject, off-center subject, busy background, lens flare, bokeh, smoke clouds filling the frame.

## Six notes on keeping 120 images consistent

1. Same camera. Medium distance, eye level, slight three-quarter angle, a fixed 50 mm feel with no wide-angle distortion. Never a close-up and never a distant scene.
2. Same fill. The subject occupies about 70 percent of the frame, centered. Tall subjects and wide subjects are both scaled to this, so the set reads as one row of equal-weight objects.
3. Same chrome. One material for every subject: polished silver chrome with engraved line-work. No gold, bronze, stone or glass bodies. Where a brief says stone or cloth, render it as chrome carved to look like stone or cloth, with periwinkle glints.
4. Same grain. The cobalt halftone field uses the same dot size and density on every image, gathered at the bottom and dissolving upward. Never recolor it.
5. Same background family. Navy gradient, grain at the bottom, radiating hairlines behind the subject. No scenery, no horizon line, no floor plane beyond a faint contact shadow.
6. Same light. Cool periwinkle rim light from the upper left and deep shadows lower right. Veiled and shrouded subjects (secret trophies) keep the same light and chrome, with the cloth carved in chrome folds, so a secret trophy looks like a sibling of its unveiled neighbours.
