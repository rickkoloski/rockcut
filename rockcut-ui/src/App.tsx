import { useEffect, useState, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import {
  AppBar,
  Badge,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import HomeIcon from '@mui/icons-material/Home'
import ScienceIcon from '@mui/icons-material/Science'
import InventoryIcon from '@mui/icons-material/Inventory'
import AssignmentIcon from '@mui/icons-material/Assignment'
import SettingsIcon from '@mui/icons-material/Settings'
import PeopleIcon from '@mui/icons-material/People'
import NotificationsIcon from '@mui/icons-material/Notifications'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import LogoutIcon from '@mui/icons-material/Logout'
import { useNavigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import ForcePasswordReset from './pages/auth/ForcePasswordReset'
import useAuth from './hooks/useAuth'

// Pages
import Home from './pages/Home'
import BrandsList from './pages/brands/BrandsList'
import BrandDetail from './pages/brands/BrandDetail'
import RecipeDetail from './pages/recipes/RecipeDetail'
import IngredientsList from './pages/ingredients/IngredientsList'
import IngredientDetail from './pages/ingredients/IngredientDetail'
import BatchesList from './pages/batches/BatchesList'
import BatchDetail from './pages/batches/BatchDetail'
import SettingsPage from './pages/settings/SettingsPage'
import CategoryDetail from './pages/settings/CategoryDetail'
import UserManagement from './pages/users/UserManagement'
import OwnerActivity from './pages/activity/OwnerActivity'
import Schedule from './pages/schedule/Schedule'

const DRAWER_WIDTH = 240
const DRAWER_COLLAPSED_WIDTH = 64

interface NavItem {
  label: string
  path: string
  icon: ReactNode
}

function LoadingScreen() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
    </Box>
  )
}

function NoModules() {
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h5" gutterBottom>
        Welcome to Rockcut
      </Typography>
      <Typography color="text.secondary">
        Your account doesn't have access to any modules yet. Ask an owner or your department manager
        to assign you a role.
      </Typography>
    </Box>
  )
}

function App() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, bootstrapped, user, capabilities, loadMe, logout } = useAuth()

  useEffect(() => {
    if (isAuthenticated && !bootstrapped) loadMe()
  }, [isAuthenticated, bootstrapped, loadMe])

  if (!isAuthenticated) return <Login />
  if (!bootstrapped || !user || !capabilities) return <LoadingScreen />
  if (user.must_reset_password) return <ForcePasswordReset />

  const modules = capabilities.modules
  const hasBrewery = modules.includes('brewery')
  const hasSchedule = modules.includes('schedule')
  const canManageUsers = capabilities.can_manage_users
  const isOwner = user.is_owner
  const pending = capabilities.pending_owner_reviews ?? 0

  const breweryItems: NavItem[] = [
    { label: 'Home', path: '/', icon: <HomeIcon /> },
    { label: 'Brands & Recipes', path: '/brands', icon: <ScienceIcon /> },
    { label: 'Ingredient Library', path: '/ingredients', icon: <InventoryIcon /> },
    { label: 'Batches', path: '/batches', icon: <AssignmentIcon /> },
    { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
  ]

  const navItems: NavItem[] = [
    ...(hasBrewery ? breweryItems : []),
    ...(hasSchedule ? [{ label: 'Schedule', path: '/schedule', icon: <CalendarMonthIcon /> }] : []),
    ...(canManageUsers ? [{ label: 'Users & Roles', path: '/users', icon: <PeopleIcon /> }] : []),
    ...(isOwner
      ? [
          {
            label: 'Activity',
            path: '/activity',
            icon: (
              <Badge badgeContent={pending} color="error">
                <NotificationsIcon />
              </Badge>
            ),
          },
        ]
      : []),
  ]

  const landing = hasBrewery ? null : hasSchedule ? '/schedule' : canManageUsers ? '/users' : isOwner ? '/activity' : null

  const currentWidth = collapsed ? DRAWER_COLLAPSED_WIDTH : DRAWER_WIDTH

  const isSelected = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const drawerContent = (isMobile: boolean) => (
    <Box sx={{ pt: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
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

      <List sx={{ flexGrow: 1 }}>
        {navItems.map((item) => {
          const button = (
            <ListItemButton
              key={item.path}
              selected={isSelected(item.path)}
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
            <IconButton
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { md: 'none' }, mr: 1 }}
            >
              <MenuIcon />
            </IconButton>

            {collapsed && (
              <IconButton
                edge="start"
                onClick={() => setCollapsed(false)}
                sx={{ display: { xs: 'none', md: 'flex' }, mr: 1 }}
              >
                <MenuIcon />
              </IconButton>
            )}

            <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
              <img src="/rockcut-logo.png" alt="Rockcut Brewing Co" style={{ height: 32 }} />
            </Box>

            <Box sx={{ flexGrow: 1 }} />

            <Typography variant="body2" color="text.secondary" sx={{ mr: 1, display: { xs: 'none', sm: 'block' } }}>
              {user.email}
              {isOwner ? ' · Owner' : ''}
            </Typography>
            <Button
              data-testid="logout-button"
              size="small"
              color="inherit"
              onClick={logout}
              startIcon={<LogoutIcon />}
              sx={{ color: 'text.secondary' }}
            >
              Logout
            </Button>
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
          <Routes>
            <Route
              path="/"
              element={hasBrewery ? <Home /> : landing ? <Navigate to={landing} replace /> : <NoModules />}
            />
            <Route path="/brands" element={<BrandsList />} />
            <Route path="/brands/:id" element={<BrandDetail />} />
            <Route path="/brands/:brandId/recipes/:id" element={<RecipeDetail />} />
            <Route path="/ingredients" element={<IngredientsList />} />
            <Route path="/ingredients/:id" element={<IngredientDetail />} />
            <Route path="/batches" element={<BatchesList />} />
            <Route path="/batches/:id" element={<BatchDetail />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/categories/:id" element={<CategoryDetail />} />
            {hasSchedule && <Route path="/schedule" element={<Schedule />} />}
            {canManageUsers && <Route path="/users" element={<UserManagement />} />}
            {isOwner && <Route path="/activity" element={<OwnerActivity />} />}
          </Routes>
        </Box>
      </Box>
    </Box>
  )
}

export default App
