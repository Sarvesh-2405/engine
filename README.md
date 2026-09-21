# Slow Roads Formula Engine

A procedural endless driving game engine built with vanilla Three.js, featuring dynamic procedural terrain, spline-based highway generation, atmospheric lighting, and rich stylized vegetation shaders.

## 🌿 Stylized Vegetation & Shaders Attribution

The stylized grass blades, procedural dirt mask, wildflower cross-billboards, tree canopy shaders, and soft ring shadow averaging in this project are adapted from the open-source **stylized-components** repository by **Christian Ortiz (cortiz2894)**:

- **Original Repository**: [cortiz2894/stylized-components](https://github.com/cortiz2894/stylized-components)
- **Live Demo**: [stylized-components.vercel.app/grass](https://stylized-components.vercel.app/grass)
- **License**: [MIT License](https://github.com/cortiz2894/stylized-components/blob/main/LICENSE)

### Key Ported Techniques:
- **Procedural Ground Dirt Mask** (`groundMask.ts`): Continuous world-space FBM noise with domain warping, evaluated by the terrain mesh, grass blades, and wildflowers so all three agree seamlessly on dirt patches.
- **Tapered Blade Strip Geometry & Shader** (`grassBlade.ts`, `bladeMaterial.ts`): Unit 7-vertex strip with concave taper, quadratic height wind sway, local-space rotation transpose, base-to-tip vertical gradients, and backlight translucency glow.
- **Multi-Tap Ring Shadow PCF** (`GRASS_SHADOW_VERTEX`): Smooth per-blade shadow sampling replacing standard single-tap PCF to eliminate shadow-edge blade popping.
- **Synchronized Foliage Wind Sway** (`pineLeaf.ts`): Height-masked sway, high-frequency micro flutter, and pendulum branch dip synchronized to the shared wind simulation across grass and trees.
- **Cross-Billboard Wildflowers** (`flower.ts`, `flowerMaterial.ts`): Alpha-cutout quads with dominant RGB palette tinting and matched custom depth materials so casting shadows match the flower petal shape and sway dynamically in the wind.
- **Rock Trampling**: Grass blades in proximity to boulders automatically flatten and splay outward.
- **Live Season Presets**: Instant uniform transitions between curated looks (*Spring Meadow*, *Golden Hour*, *Autumn Countryside*, *Alien Red Planet*).

---

## 🚀 Running the Engine Locally

```bash
# Install dependencies
npm install

# Start Vite development server
npm run dev

# Build production bundle
npm run build
```

Press **\`** (Backquote) or **P** in-game to toggle the real-time Tweakpane debug controls.
