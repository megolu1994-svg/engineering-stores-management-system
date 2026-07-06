import { createContext, useContext, useEffect, useState, type MouseEvent } from "react";

import {
  AppBar,
  Avatar,
  Badge,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { keyframes } from "@emotion/react";

import MenuIcon from "@mui/icons-material/Menu";
import HomeIcon from "@mui/icons-material/Home";
import CategoryIcon from "@mui/icons-material/Category";
import PlaceIcon from "@mui/icons-material/Place";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import OutputIcon from "@mui/icons-material/Output";
import BarChartIcon from "@mui/icons-material/BarChart";
import SettingsIcon from "@mui/icons-material/Settings";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import PersonIcon from "@mui/icons-material/Person";

import { useTheme } from "@mui/material/styles";

import {
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { BRAND_PURPLE, BRAND_PURPLE_SOFT } from "../theme";
import { SWIPE_OPEN_DRAWER_EVENT } from "../hooks/useSwipeTabs";
import { useInventoryNotifications } from "../hooks/useInventoryNotifications";

// Desktop permanent sidebar width only - the mobile temporary drawer is
// untouched and keeps its own (wider) width below, since the mobile UI
// must stay pixel-identical.
const drawerWidth = 220;
const MOBILE_DRAWER_WIDTH = 280;

// Exported so pages with their own fixed bottom bars (e.g. a "Save" action
// bar) can offset themselves past the permanent desktop drawer and align
// with the centered/max-width main content column instead of spanning the
// full viewport width underneath it.
export const DRAWER_WIDTH = drawerWidth;
export const CONTENT_MAX_WIDTH = 1536;

const APP_VERSION = "1.0.0";

const bellRing = keyframes`
  0% { transform: rotate(0deg); }
  15% { transform: rotate(16deg); }
  30% { transform: rotate(-14deg); }
  45% { transform: rotate(10deg); }
  60% { transform: rotate(-8deg); }
  75% { transform: rotate(4deg); }
  100% { transform: rotate(0deg); }
`;

function formatNotificationTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round(diffMs / 1000));

  if (diffSec < 60) return "just now";

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d ago`;
}

const menuItems = [
  { text: "Dashboard", path: "/", icon: <HomeIcon /> },
  { text: "Material Master", path: "/materials", icon: <CategoryIcon /> },
  { text: "Location Master", path: "/locations", icon: <PlaceIcon /> },
  { text: "Inventory", path: "/allocation", icon: <FactCheckIcon /> },
  { text: "Material Receipt", path: "/material-receipt", icon: <LocalShippingIcon /> },
  { text: "Material Issue", path: "/material-issue", icon: <OutputIcon /> },
  { text: "Reports", path: "/reports", icon: <BarChartIcon /> },
  { text: "Settings", path: "/settings", icon: <SettingsIcon /> },
];

const bottomNavItems = [
  { label: "Inventory", path: "/allocation", icon: <FactCheckIcon /> },
  { label: "Material Receipt", path: "/material-receipt", icon: <LocalShippingIcon /> },
  { label: "Dashboard", path: "/", icon: <HomeIcon /> },
  { label: "Material Issue", path: "/material-issue", icon: <OutputIcon /> },
  { label: "Reports", path: "/reports", icon: <BarChartIcon /> },
];

const TOOLBAR_HEIGHT = { xs: 48, sm: 52, md: 76 };

// Desktop header is a single fixed strip spanning the full page width; the
// sidebar and main content both start exactly at its bottom edge so there's
// one straight seam instead of two independently-sized purple regions.
const DESKTOP_HEADER_HEIGHT = TOOLBAR_HEIGHT.md;

// Lets a page (currently just Dashboard) render its search field into the
// desktop header's toolbar, next to the brand logo, instead of in its own
// page content - purely a portal target, so the page keeps full ownership
// of the field's state/logic. Only meaningful at "md"+: on mobile the
// header slot node is never mounted, so this is always null there and
// pages must fall back to their normal (unchanged) mobile layout.
const HeaderSlotContext = createContext<HTMLDivElement | null>(null);
export function useHeaderSlot() {
  return useContext(HeaderSlotContext);
}

// Height of the fixed bottom navigation bar shown on mobile (below the "md"
// breakpoint) - exported so pages with their own fixed/sticky bottom bars
// (e.g. a "Save" action bar) can lift themselves above it instead of being
// hidden underneath.
export const BOTTOM_NAV_HEIGHT = 56;
export const BOTTOM_NAV_OFFSET = `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;

function BrandLogo({ size = 32 }: { size?: number }) {
  return (
    <Avatar
      sx={{
        width: size,
        height: size,
        bgcolor: "#FFFFFF",
        color: BRAND_PURPLE,
        fontWeight: 900,
        fontSize: size * 0.55,
      }}
    >
      D
    </Avatar>
  );
}

export default function AppLayout() {

  const navigate = useNavigate();
  const location = useLocation();

  const theme = useTheme();

  const mobile = useMediaQuery(theme.breakpoints.down("md"));

  const [mobileOpen, setMobileOpen] = useState(false);

  const [headerSlotEl, setHeaderSlotEl] = useState<HTMLDivElement | null>(null);

  // Desktop-only: gated by `!mobile` so the realtime subscription itself
  // (not just the bell UI) has no footprint on mobile.
  const { notifications, unreadCount, ringKey, markAllRead } =
    useInventoryNotifications(!mobile);

  const [notificationsAnchorEl, setNotificationsAnchorEl] =
    useState<HTMLElement | null>(null);

  function handleOpenNotifications(event: MouseEvent<HTMLElement>) {
    setNotificationsAnchorEl(event.currentTarget);
    markAllRead();
  }

  function handleCloseNotifications() {
    setNotificationsAnchorEl(null);
  }

  useEffect(() => {
    function handleSwipeOpenDrawer() {
      if (mobile) {
        setMobileOpen(true);
      }
    }

    window.addEventListener(SWIPE_OPEN_DRAWER_EVENT, handleSwipeOpenDrawer);

    return () => {
      window.removeEventListener(SWIPE_OPEN_DRAWER_EVENT, handleSwipeOpenDrawer);
    };
  }, [mobile]);

  function handleNavigate(path: string) {
    navigate(path);

    if (mobile) {
      setMobileOpen(false);
    }
  }

  const menuList = (
    <>

      <List sx={{ flexGrow: 1, py: 1 }}>

        {menuItems.map((item) => {
          const selected = location.pathname === item.path;

          return (
            <ListItemButton
              key={item.text}
              selected={selected}
              onClick={() => handleNavigate(item.path)}
              sx={{
                minHeight: { xs: 60, md: 58 },
                pl: { xs: 3, md: 1.75 },
                pr: { md: 1.25 },
                color: selected ? BRAND_PURPLE : "#111827",
                "&.Mui-selected": {
                  bgcolor: BRAND_PURPLE_SOFT,
                },
                "&.Mui-selected:hover": {
                  bgcolor: BRAND_PURPLE_SOFT,
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: { xs: 40, md: 36 },
                  color: selected ? BRAND_PURPLE : "#111827",
                  "& svg": { fontSize: { xs: 24, md: 27 } },
                }}
              >
                {item.icon}
              </ListItemIcon>

              <ListItemText
                primary={item.text}
                slotProps={{ primary: { sx: { fontWeight: 600, fontSize: { xs: 16, md: 17 }, whiteSpace: "nowrap" } } }}
              />

            </ListItemButton>
          );
        })}

      </List>

      <Divider sx={{ borderColor: "#E5E7EB" }} />

      <Box sx={{ pb: 3, pt: 1.5, textAlign: "center" }}>
        <Typography sx={{ fontWeight: 700, color: "#111827", fontSize: 14 }}>
          Version {APP_VERSION}
        </Typography>
      </Box>

    </>
  );

  // Mobile temporary drawer - unchanged, keeps its own purple brand box since
  // the mobile UI must stay pixel-identical.
  const mobileDrawerContent = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>

      <Box
        sx={{
          minHeight: 120,
          bgcolor: BRAND_PURPLE,
          display: "flex",
          alignItems: "center",
          gap: { xs: 1.25, md: 1 },
          px: { xs: 3, md: 2 },
        }}
      >
        <BrandLogo size={40} />
        <Typography
          noWrap
          sx={{ color: "#FFFFFF", fontWeight: 800, letterSpacing: 0.5, fontSize: { xs: "1rem", md: "0.9rem" } }}
        >
          DUMAD STORE
        </Typography>
      </Box>

      {menuList}

    </Box>
  );

  // Desktop permanent sidebar - no brand box of its own; the brand now lives
  // in the single full-width header strip above it, so there's exactly one
  // purple region instead of two mismatched ones.
  const desktopDrawerContent = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {menuList}
    </Box>
  );

  return (

    <HeaderSlotContext.Provider value={headerSlotEl}>

    <Box sx={{ display: "flex" }}>

      {/* Hidden while the mobile drawer is open so only one header (the
          drawer's own purple header) is ever visible at a time - otherwise
          this fixed bar sits on top of and clips the drawer's logo. */}
      {!(mobile && mobileOpen) && (

        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            zIndex: theme.zIndex.drawer + 1,
            bgcolor: BRAND_PURPLE,
            width: "100%",
          }}
        >

          <Toolbar variant="dense" sx={{ minHeight: TOOLBAR_HEIGHT, position: "relative", px: { md: 3 } }}>

            {mobile && (

              <IconButton
                color="inherit"
                edge="start"
                onClick={() => setMobileOpen(true)}
                sx={{ mr: 2 }}
              >

                <MenuIcon />

              </IconButton>

            )}

            {/* Mobile only: centered brand, unchanged - desktop shows its
                own left-aligned brand block instead (see below). */}
            {mobile && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  position: "absolute",
                  left: 0,
                  right: 0,
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <BrandLogo size={26} />
                <Typography
                  sx={{ color: "#FFFFFF", fontWeight: 800, letterSpacing: 0.5 }}
                  noWrap
                >
                  DUMAD STORE
                </Typography>
              </Box>
            )}

            {/* Desktop-only: brand block sized to the sidebar width so its
                right edge lines up with the sidebar/content seam below,
                keeping the header on the same grid as the rest of the page. */}
            {!mobile && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  width: drawerWidth,
                  flexShrink: 0,
                }}
              >
                <BrandLogo size={32} />
                <Typography
                  noWrap
                  sx={{ color: "#FFFFFF", fontWeight: 800, letterSpacing: 0.5, fontSize: "0.9rem" }}
                >
                  DUMAD STORE
                </Typography>
              </Box>
            )}

            {/* Desktop-only: portal target for the active page's search
                field (see useHeaderSlot), centered and width-capped rather
                than stretched edge-to-edge. Empty/unused on pages that
                don't portal anything into it. */}
            {!mobile && (
              <Box sx={{ flexGrow: 1, display: "flex", justifyContent: "center" }}>
                <Box ref={setHeaderSlotEl} sx={{ width: "100%", maxWidth: 640 }} />
              </Box>
            )}

            {/* Desktop-only: notifications + account. Notifications are
                wired to realtime inventory/DRC activity (see
                useInventoryNotifications) - deliberately not shown on
                mobile at all. */}
            {!mobile && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, ml: 2, flexShrink: 0 }}>
                <IconButton
                  key={ringKey}
                  size="small"
                  aria-label="Notifications"
                  onClick={handleOpenNotifications}
                  sx={{
                    color: "#FFFFFF",
                    animation: ringKey > 0 ? `${bellRing} 0.6s ease-in-out` : "none",
                  }}
                >
                  <Badge
                    badgeContent={unreadCount}
                    color="error"
                    max={9}
                    overlap="circular"
                  >
                    <NotificationsNoneIcon fontSize="small" />
                  </Badge>
                </IconButton>

                <Popover
                  open={Boolean(notificationsAnchorEl)}
                  anchorEl={notificationsAnchorEl}
                  onClose={handleCloseNotifications}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <Box sx={{ width: 340, maxHeight: 420, overflowY: "auto" }}>

                    <Typography sx={{ px: 2, py: 1.5, fontWeight: 700, color: "#111827" }}>
                      Notifications
                    </Typography>

                    <Divider />

                    {notifications.length === 0 ? (
                      <Typography sx={{ px: 2, py: 3, color: "#6B7280", textAlign: "center" }}>
                        No new notifications
                      </Typography>
                    ) : (
                      <List disablePadding>
                        {notifications.map((notification) => (
                          <ListItemButton
                            key={notification.id}
                            divider
                            sx={{ alignItems: "flex-start", py: 1.25 }}
                          >
                            <ListItemText
                              primary={notification.message}
                              secondary={formatNotificationTime(notification.createdAt)}
                              slotProps={{
                                primary: { sx: { fontSize: 14, fontWeight: 600, color: "#111827" } },
                                secondary: { sx: { fontSize: 12, color: "#6B7280" } },
                              }}
                            />
                          </ListItemButton>
                        ))}
                      </List>
                    )}

                  </Box>
                </Popover>

                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{ borderColor: "rgba(255,255,255,0.3)", my: 1 }}
                />

                <IconButton
                  size="small"
                  aria-label="Account settings"
                  onClick={() => navigate("/settings")}
                  sx={{ p: 0.25 }}
                >
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      bgcolor: "rgba(255,255,255,0.15)",
                      color: "#FFFFFF",
                    }}
                  >
                    <PersonIcon fontSize="small" />
                  </Avatar>
                </IconButton>
              </Box>
            )}

          </Toolbar>

        </AppBar>

      )}

      {mobile ? (

        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
        >

          <Box
            sx={{ width: MOBILE_DRAWER_WIDTH, maxWidth: "85vw", height: "100%" }}
          >

            {mobileDrawerContent}

          </Box>

        </Drawer>

      ) : (

        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              boxSizing: "border-box",
              border: "none",
              top: DESKTOP_HEADER_HEIGHT,
              height: `calc(100% - ${DESKTOP_HEADER_HEIGHT}px)`,
            },
          }}
        >

          {desktopDrawerContent}

        </Drawer>

      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          // A flex item defaults to min-width: auto, so without this it
          // refuses to shrink below the intrinsic width of whatever it
          // contains - one long, unwrapped string anywhere on the page
          // (e.g. a location's full description) would otherwise widen
          // the entire app and force horizontal scrolling everywhere.
          minWidth: 0,
          overflowX: "hidden",
          bgcolor: "#FFFFFF",
          minHeight: "100vh",

          p: {
            xs: 2,
            md: 4,
          },

          pt: {
            xs: 2,
            md: 4.5,
          },

          pb: mobile
            ? `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 16px)`
            : { xs: 2, md: 4 },

          // Below "md" this is a no-op (maxWidth: "none" leaves the mobile
          // layout exactly as it was). At "md" and up it caps the content
          // to a comfortable reading/working width and centers it (the
          // "auto" margins absorb the flex container's leftover space) -
          // without this, every page's cards/forms/lists stretch edge to
          // edge on wide desktop monitors, which is what read as
          // "unoptimized" desktop UI.
          maxWidth: { xs: "none", md: CONTENT_MAX_WIDTH },
          mx: "auto",
          width: "100%",
        }}
      >

        <Toolbar variant="dense" sx={{ minHeight: TOOLBAR_HEIGHT }} />

        <Outlet />

      </Box>

      {mobile && !mobileOpen && (

        <BottomNavigation
          showLabels={false}
          value={location.pathname}
          onChange={(_event, newValue: string) => handleNavigate(newValue)}
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: BOTTOM_NAV_HEIGHT,
            paddingBottom: "env(safe-area-inset-bottom)",
            zIndex: theme.zIndex.drawer + 1,
            borderTop: "1px solid #E5E7EB",
          }}
        >

          {bottomNavItems.map((item) => (

            <BottomNavigationAction
              key={item.path}
              value={item.path}
              icon={item.icon}
              aria-label={item.label}
              sx={{
                minWidth: 0,
                color: "#6B7280",
                "&.Mui-selected": {
                  color: BRAND_PURPLE,
                },
              }}
            />

          ))}

        </BottomNavigation>

      )}

    </Box>

    </HeaderSlotContext.Provider>

  );

}
