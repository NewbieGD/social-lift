# Character rendering rework

The player character renderer was refined without replacing the existing Canvas architecture.

## Changes

- Smoother tapered limb geometry with rounded ends and restrained highlights.
- More coherent torso/shoulder silhouette.
- More readable three-quarter face with two eyes, brows, nose and mouth.
- Improved hair silhouette and head/neck connection.
- More detailed hands and cleaner shoes.
- Added horizontal-velocity-driven walk cycle for arms and legs.
- Reduced low-tier random arm flailing so movement reads more intentionally.
- Kept the existing IK arm system, two-segment legs, outfit system, pickup flow and flashlight system.
- Improved glasses pickup artwork.
- Adjusted helmet and glasses pickup anchors to match the redesigned head.
- Renderer now passes horizontal velocity into the character pose.

## Validation

`hero.ts` passes a standalone TypeScript type check with the DOM library. The full frontend build could not be run in this environment because the repository dependencies were not installed and package installation timed out.

## Attachment pass

- Added live hero attachment points for wearable and held items.
- Pickup/suit-up destinations now follow the animated hand/head/feet instead of relying only on fixed world offsets.
- Watch is attached to the animated wrist rather than the flashlight.
- Glasses are rendered on the face/head layer and the suit helmet uses a proper helmet silhouette.
- Held phone/torch destinations share the same animated hand attachment logic.
- Shoe pickup targets follow the current animated feet.
