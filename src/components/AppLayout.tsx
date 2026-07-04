import { useState } from "react";

import {
  AppBar,
  Box,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";

import MenuIcon from "@mui/icons-material/Menu";

import { useTheme } from "@mui/material/styles";

import {
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

const drawerWidth = 240;

const APP_TITLE = "Engineering Stores Management System";

const menuItems = [
  { text: "Dashboard", path: "/" },
  { text: "Material Master", path: "/materials" },
  { text: "Location Master", path: "/locations" },
  { text: "Inventory", path: "/allocation" },
  { text: "Material Receipt", path: "/material-receipt" },
  { text: "Material Issue", path: "/material-issue" },
  { text: "Reports", path: "/reports" },
  { text: "Import / Export", path: "/import-export" },
  { text: "Settings", path: "/settings" },
];

const TOOLBAR_HEIGHT = { xs: 48, sm: 52 };

export default function AppLayout() {

  const navigate = useNavigate();
  const location = useLocation();

  const theme = useTheme();

  const mobile = useMediaQuery(theme.breakpoints.down("md"));

  const [mobileOpen, setMobileOpen] = useState(false);

  function handleNavigate(path: string) {
    navigate(path);

    if (mobile) {
      setMobileOpen(false);
    }
  }

  const isDashboard = location.pathname === "/";

  const currentPageTitle =
    menuItems.find((item) => item.path === location.pathname)?.text ?? "";

  const appBarTitle = isDashboard ? APP_TITLE : currentPageTitle;

  const drawer = (
    <>
      <Toolbar variant="dense" sx={{ minHeight: TOOLBAR_HEIGHT }} />

      <Divider />

      <List>

        {menuItems.map((item) => (

          <ListItemButton
            key={item.text}
            selected={location.pathname === item.path}
            onClick={() => handleNavigate(item.path)}
          >

            <ListItemText primary={item.text} />

          </ListItemButton>

        ))}

      </List>
    </>
  );

  return (

    <Box sx={{ display: "flex" }}>

      <CssBaseline />

      <AppBar
        position="fixed"
        color={isDashboard ? "primary" : "default"}
        elevation={isDashboard ? 4 : 1}
        sx={{
          zIndex: theme.zIndex.drawer + 1,
        }}
      >

        <Toolbar variant="dense" sx={{ minHeight: TOOLBAR_HEIGHT }}>

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

          <Typography
            variant="subtitle1"
            sx={{ fontWeight: "bold" }}
            noWrap
            component="div"
          >

            {appBarTitle}

          </Typography>

        </Toolbar>

      </AppBar>

      {mobile ? (

        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
        >

          <Box
            sx={{ width: drawerWidth }}
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
          bgcolor: "#f4f6f8",
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
