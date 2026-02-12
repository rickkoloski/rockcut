import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import HomeIcon from '@mui/icons-material/Home'
import WidgetsIcon from '@mui/icons-material/Widgets'
import ScienceIcon from '@mui/icons-material/Science'
import { useNavigate, useLocation } from 'react-router-dom'
import Splash from './pages/Splash'
import ComponentShowcase from './pages/ComponentShowcase'
import Recipes from './pages/Recipes'

const DRAWER_WIDTH = 240
const DRAWER_COLLAPSED_WIDTH = 64

const navItems = [
  { label: 'Home', path: '/', icon: <HomeIcon /> },
  { label: 'Recipes', path: '/recipes', icon: <ScienceIcon /> },
  { label: 'UI Components', path: '/components', icon: <WidgetsIcon /> },
]

function App() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const currentWidth = collapsed ? DRAWER_COLLAPSED_WIDTH : DRAWER_WIDTH

  const drawerContent = (isMobile: boolean) => (
    <Box sx={{ pt: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo + collapse toggle */}
      {/* Logo area with absolutely positioned collapse toggle */}
      <Box
        sx={{
          position: 'relative',
          px: collapsed && !isMobile ? 0.5 : 2,
          py: 1.5,
          mb: 1,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {!isMobile && !collapsed && (
          <IconButton
            size="small"
            onClick={() => setCollapsed(true)}
            sx={{ position: 'absolute', top: '10px', right: 8 }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        )}
        <Box
          sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: collapsed && !isMobile ? 0 : '-10px' }}
          onClick={() => { navigate('/'); if (isMobile) setMobileOpen(false) }}
        >
          <img
            src="/rockcut-logo.png"
            alt="Rockcut Brewing Co"
            style={{
              width: collapsed && !isMobile ? 40 : 120,
              transition: 'width 0.2s ease',
            }}
          />
        </Box>
      </Box>

      {/* Nav items */}
      <List sx={{ flexGrow: 1 }}>
        {navItems.map((item) => {
          const button = (
            <ListItemButton
              key={item.path}
              selected={location.pathname === item.path}
              onClick={() => {
                navigate(item.path)
                if (isMobile) setMobileOpen(false)
              }}
              sx={{
                mx: collapsed && !isMobile ? 0.5 : 1,
                borderRadius: 1,
                justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                px: collapsed && !isMobile ? 1.5 : 2,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: collapsed && !isMobile ? 0 : 36,
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {(!collapsed || isMobile) && <ListItemText primary={item.label} />}
            </ListItemButton>
          )

          return collapsed && !isMobile ? (
            <Tooltip key={item.path} title={item.label} placement="right" arrow>
              {button}
            </Tooltip>
          ) : (
            <Box key={item.path}>{button}</Box>
          )
        })}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Persistent drawer for larger screens */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: currentWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: currentWidth,
            boxSizing: 'border-box',
            transition: 'width 0.2s ease',
            overflowX: 'hidden',
          },
        }}
      >
        {drawerContent(false)}
      </Drawer>

      {/* Temporary drawer for mobile */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
        }}
      >
        {drawerContent(true)}
      </Drawer>

      {/* Main content */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar
          position="static"
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Toolbar variant="dense">
            {/* Mobile: hamburger menu */}
            <IconButton
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { md: 'none' }, mr: 1 }}
            >
              <MenuIcon />
            </IconButton>

            {/* Desktop collapsed: expand button */}
            {collapsed && (
              <IconButton
                edge="start"
                onClick={() => setCollapsed(false)}
                sx={{ display: { xs: 'none', md: 'flex' }, mr: 1 }}
              >
                <MenuIcon />
              </IconButton>
            )}

            {/* Mobile: show logo in app bar */}
            <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
              <img src="/rockcut-logo.png" alt="Rockcut Brewing Co" style={{ height: 32 }} />
            </Box>
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
          <Routes>
            <Route path="/" element={<Splash />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/components" element={<ComponentShowcase />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  )
}

export default App
