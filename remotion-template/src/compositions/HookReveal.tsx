import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

interface HookRevealProps {
  hookText: string;
  revealText: string;
  hookColor?: string;
  revealColor?: string;
  backgroundColor?: string;
  imageUrl?: string;
}

/**
 * HookReveal Template
 * 
 * A viral-style short-form video template:
 * 1. Hook text appears (0-2s) - grabs attention
 * 2. Pause for impact (2-3s)
 * 3. Reveal with animation (3-5s)
 */
export const HookReveal: React.FC<HookRevealProps> = ({
  hookText,
  revealText,
  hookColor = "#FFFFFF",
  revealColor = "#FF6B35",
  backgroundColor = "#1A1A2E",
  imageUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Hook animation (0-60 frames = 0-2s)
  const hookOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  const hookScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 200 },
  });
  const hookY = interpolate(frame, [0, 20], [50, 0], {
    extrapolateRight: "clamp",
  });

  // Hook exit (60-90 frames = 2-3s)
  const hookExitOpacity = interpolate(frame, [60, 75], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Reveal animation (90-150 frames = 3-5s)
  const revealStart = 90;
  const revealOpacity = interpolate(frame, [revealStart, revealStart + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const revealScale = spring({
    frame: frame - revealStart,
    fps,
    config: { damping: 10, stiffness: 100 },
  });
  const revealY = interpolate(frame, [revealStart, revealStart + 30], [100, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Background pulse effect
  const bgPulse = Math.sin(frame * 0.05) * 0.05 + 1;

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "'Inter', sans-serif",
        padding: 60,
      }}
    >
      {/* Optional background image */}
      {imageUrl && (
        <AbsoluteFill>
          <img
            src={imageUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.3,
            }}
          />
        </AbsoluteFill>
      )}

      {/* Hook text */}
      <div
        style={{
          opacity: hookOpacity * hookExitOpacity,
          transform: `scale(${hookScale}) translateY(${hookY}px)`,
          position: "absolute",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 80,
            fontWeight: 800,
            color: hookColor,
            textTransform: "uppercase",
            letterSpacing: -2,
            margin: 0,
            textShadow: "0 4px 30px rgba(0,0,0,0.5)",
          }}
        >
          {hookText}
        </h1>
      </div>

      {/* Reveal text */}
      <div
        style={{
          opacity: revealOpacity,
          transform: `scale(${revealScale}) translateY(${revealY}px)`,
          position: "absolute",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: revealColor,
            lineHeight: 1.2,
            margin: 0,
            textShadow: "0 4px 30px rgba(255,107,53,0.5)",
          }}
        >
          {revealText}
        </h1>
      </div>

      {/* Bottom branding bar */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 80,
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: "rgba(255,255,255,0.6)",
            letterSpacing: 2,
          }}
        >
          @saravan
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
