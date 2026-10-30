// Display options read from the page address, for side-by-side comparisons during development:
//   ?corner=procedural   use the original browser-built front-right wheel corner instead of the Blender one
//   ?fx=off              turn off ambient occlusion and the other post-processing effects

const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);

export const settings = {
  blenderCorner: params.get("corner") !== "procedural",
  effects: params.get("fx") !== "off",
};
