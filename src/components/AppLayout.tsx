import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";

import { Outlet, useLocation, useNavigate } from "react-router-dom";

const drawerWidth = 240;

const menuItems = [
  {
    text: "Dashboard",
    path: "/",
  },
  {
    text: "Material Master",
    path: "/materials",
  },
  {
    text: "Location Master",
    path: "/locations",
  },
  {
    text: "Material Allocation",
    path: "/allocation",
  },
  {
    text: "Reports",
    path: "/reports",
  },
  {
    text: "Import / Export",
    path: "/import-export",
  },
  {
    text: "Settings",
    path: "/settings",
  },
];

export default function AppLayout() {

  const navigate = useNavigate();

  const location = useLocation();

  return (

    <Box sx={{ display: "flex" }}>

      <CssBaseline />

      <AppBar
        position="fixed"
        sx={{
          zIndex: 1300,
        }}
      >
        <Toolbar>

          <Typography
            variant="h6"
            component="div"
          >
            Engineering Stores Management System
          </Typography>

        </Toolbar>
      </AppBar>

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

        <Toolbar />

        <List>

          {menuItems.map((item) => (

            <ListItemButton
              key={item.text}
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
            >

              <ListItemText
                primary={item.text}
              />

            </ListItemButton>

          ))}

        </List>

      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: "#f4f6f8",
          minHeight: "100vh",
          p: 3,
        }}
      >

        <Toolbar />

        <Outlet />

      </Box>

    </Box>

  );

}