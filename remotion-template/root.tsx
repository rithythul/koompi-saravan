import type { ComponentType, FC } from "react";
import { Composition, registerRoot } from "remotion";
import { HookReveal } from "./src/compositions/HookReveal";

/**
 * Remotion Root - Register all video compositions here
 */
export const RemotionRoot: FC = () => {
  return (
    <>
      <Composition
        id="HookReveal"
        component={HookReveal as unknown as ComponentType<Record<string, unknown>>}
        durationInFrames={150}  // 5 seconds at 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          hookText: "Did you know this fact?",
          revealText: "Here's the answer!",
          hookColor: "#FFFFFF",
          revealColor: "#FF6B35",
          backgroundColor: "#1A1A2E",
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
