// Layers other components hand to the liquid background so it can render them under the water
// surface (refracted by the ripples and tinted by depth). Read by LiquidBackground every frame.
// - creatures: mid-depth, between the seabed and the tentacles (the swimming squids)
// - underwater: just below the surface (the submerged part of the tentacles, their shadows)
export const liquidLayers: { creatures: HTMLCanvasElement | null; underwater: HTMLCanvasElement | null } = {
  creatures: null,
  underwater: null,
};
