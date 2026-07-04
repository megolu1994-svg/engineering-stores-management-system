import type { ReactNode } from "react";
import { Box } from "@mui/material";
import { keyframes } from "@emotion/react";
import type { SwipeDirection } from "../hooks/useSwipeTabs";

const SLIDE_DISTANCE = 24;
const SLIDE_DURATION_MS = 220;

const slideInFromRight = keyframes`
  from { opacity: 0; transform: translateX(${SLIDE_DISTANCE}px); }
  to { opacity: 1; transform: translateX(0); }
`;

const slideInFromLeft = keyframes`
  from { opacity: 0; transform: translateX(-${SLIDE_DISTANCE}px); }
  to { opacity: 1; transform: translateX(0); }
`;

interface Props {
  activeTab: number;
  direction: SwipeDirection;
  children: ReactNode;
}

/**
 * Wraps a tab's content so switching tabs (by swipe or by tapping the
 * tab strip) animates in smoothly from the correct side, instead of the
 * new content just snapping into place.
 */
export default function SwipeableTabPanel({ activeTab, direction, children }: Props) {
  return (
    <Box
      key={activeTab}
      sx={{
        animation: `${direction === "left" ? slideInFromRight : slideInFromLeft} ${SLIDE_DURATION_MS}ms ease-out`,
      }}
    >
      {children}
    </Box>
  );
}
