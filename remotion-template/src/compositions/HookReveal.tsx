import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

import "./HookReveal.css";

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

  const rootStyle = {
    "--background-color": backgroundColor,
    "--hook-color": hookColor,
    "--reveal-color": revealColor,
    "--hook-opacity": String(hookOpacity * hookExitOpacity),
    "--hook-transform": `scale(${hookScale}) translateY(${hookY}px)`,
    "--reveal-opacity": String(revealOpacity),
    "--reveal-transform": `scale(${revealScale}) translateY(${revealY}px)`,
  } as React.CSSProperties;

  return (
    <AbsoluteFill className="hook-reveal-root" style={rootStyle}>
      {/* Optional background image */}
      {imageUrl && (
        <AbsoluteFill className="hook-reveal-background-fill">
          <img
            className="hook-reveal-background-image"
            src={imageUrl}
            alt="Hook reveal background"
            title="Hook reveal background"
          />
        </AbsoluteFill>
      )}

      {/* Hook text */}
      <div className="hook-reveal-hook-container">
        <h1 className="hook-reveal-hook-text">
          {hookText}
        </h1>
      </div>

      {/* Reveal text */}
      <div className="hook-reveal-reveal-container">
        <h1 className="hook-reveal-reveal-text">
          {revealText}
        </h1>
      </div>

      {/* Bottom branding bar */}
      <AbsoluteFill className="hook-reveal-branding-fill">
        <div className="hook-reveal-branding-text">
          @saravan
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
