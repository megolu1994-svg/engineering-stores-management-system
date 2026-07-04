import { useEffect, useState } from "react";

import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";

import MenuIcon from "@mui/icons-material/Menu";
import HomeIcon from "@mui/icons-material/Home";
import CategoryIcon from "@mui/icons-material/Category";
import PlaceIcon from "@mui/icons-material/Place";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import OutputIcon from "@mui/icons-material/Output";
import BarChartIcon from "@mui/icons-material/BarChart";
import SettingsIcon from "@mui/icons-material/Settings";

import { useTheme } from "@mui/material/styles";

import {
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { BRAND_PURPLE, BRAND_PURPLE_SOFT } from "../theme";
import { SWIPE_OPEN_DRAWER_EVENT } from "../hooks/useSwipeTabs";

const drawerWidth = 280;

const APP_VERSION = "1.0.0";

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

const TOOLBAR_HEIGHT = { xs: 48, sm: 52 };

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

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>

      <Box
        sx={{
          minHeight: 120,
          bgcolor: BRAND_PURPLE,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 3,
        }}
      >
        <BrandLogo size={40} />
        <Typography sx={{ color: "#FFFFFF", fontWeight: 800, letterSpacing: 0.5 }}>
          DUMAD STORE
        </Typography>
      </Box>

      <List sx={{ flexGrow: 1, py: 1 }}>

        {menuItems.map((item) => {
          const selected = location.pathname === item.path;

          return (
            <ListItemButton
              key={item.text}
              selected={selected}
              onClick={() => handleNavigate(item.path)}
              sx={{
                minHeight: 60,
                pl: 3,
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
                  minWidth: 40,
                  color: selected ? BRAND_PURPLE : "#111827",
                  "& svg": { fontSize: 24 },
                }}
              >
                {item.icon}
              </ListItemIcon>

              <ListItemText
                primary={item.text}
                slotProps={{ primary: { sx: { fontWeight: 600, fontSize: 16 } } }}
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

    </Box>
  );

  return (

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
            width: { md: `calc(100% - ${drawerWidth}px)` },
            ml: { md: `${drawerWidth}px` },
          }}
        >

          <Toolbar variant="dense" sx={{ minHeight: TOOLBAR_HEIGHT, position: "relative" }}>

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

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                position: mobile ? "absolute" : "static",
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

          </Toolbar>

        </AppBar>

      )}

      {mobile ? (

        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
        >

          <Box
            sx={{ width: drawerWidth, maxWidth: "85vw", height: "100%" }}
          >

            {drawer}

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
            },
          }}
        >

          {drawer}

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
            md: 3,
          },
        }}
      >

        <Toolbar variant="dense" sx={{ minHeight: TOOLBAR_HEIGHT }} />

        <Outlet />

      </Box>

    </Box>

  );

}
