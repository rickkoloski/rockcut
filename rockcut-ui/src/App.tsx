import { useEffect, useState, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import {
  AppBar,
  Badge,
  Box,
  Button,
  CircularProgress,
  Collapse,
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
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import HomeIcon from '@mui/icons-material/Home'
import ScienceIcon from '@mui/icons-material/Science'
import InventoryIcon from '@mui/icons-material/Inventory'
import AssignmentIcon from '@mui/icons-material/Assignment'
import SettingsIcon from '@mui/icons-material/Settings'
import PeopleIcon from '@mui/icons-material/People'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import EventBusyIcon from '@mui/icons-material/EventBusy'
import ViewAgendaIcon from '@mui/icons-material/ViewAgenda'
import GridViewIcon from '@mui/icons-material/GridView'
import SportsBarIcon from '@mui/icons-material/SportsBar'
import LocalBarIcon from '@mui/icons-material/LocalBar'
import BusinessIcon from '@mui/icons-material/Business'
import PointOfSaleIcon from '@mui/icons-material/PointOfSale'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import ForumIcon from '@mui/icons-material/Forum'
import TagIcon from '@mui/icons-material/Tag'
import CampaignIcon from '@mui/icons-material/Campaign'
import LogoutIcon from '@mui/icons-material/Logout'
import { useQuery } from '@tanstack/react-query'
import api from './lib/api'
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
import TimeOff from './pages/timeoff/TimeOff'
import Messages from './pages/messages/Messages'
import NotificationBell from './components/NotificationBell'
import InstallPrompt from './components/InstallPrompt'

const DRAWER_WIDTH = 240
const DRAWER_COLLAPSED_WIDTH = 64

interface NavLeaf {
  label: string
  path: string
  icon: ReactNode
}

interface NavSection {
  key: string
  label: string
  icon: ReactNode
  children: NavLeaf[]
  // Shown (disabled) when the section has no children yet.
  emptyLabel?: string
}

// Brewery is the only department with app pages today; the others (Bar, Office,
// Sales) show as headings with a "coming soon" placeholder until they get pages.
const BREWERY_PAGES: NavLeaf[] = [
  { label: 'Home', path: '/', icon: <HomeIcon /> },
  { label: 'Brands & Recipes', path: '/brands', icon: <ScienceIcon /> },
  { label: 'Ingredient Library', path: '/ingredients', icon: <InventoryIcon /> },
  { label: 'Batches', path: '/batches', icon: <AssignmentIcon /> },
  { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
]

// Per-department heading metadata, keyed by the department key from capabilities.modules.
const DEPT_META: Record<string, { label: string; icon: ReactNode; children: NavLeaf[] }> = {
  bar: { label: 'Bar', icon: <LocalBarIcon />, children: [] },
  brewery: { label: 'Brewery', icon: <SportsBarIcon />, children: BREWERY_PAGES },
  office: { label: 'Office', icon: <BusinessIcon />, children: [] },
  sales: { label: 'Sales', icon: <PointOfSaleIcon />, children: [] },
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
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({})
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, bootstrapped, user, capabilities, loadMe, logout } = useAuth()

  useEffect(() => {
    if (isAuthenticated && !bootstrapped) loadMe()
  }, [isAuthenticated, bootstrapped, loadMe])

  // Total unread messages, for the Messages nav badge.
  const { data: messagesUnread = 0 } = useQuery({
    queryKey: ['messages_unread'],
    queryFn: async () => (await api.get<{ count: number }>('/api/messages/unread_count')).data.count,
    enabled: isAuthenticated,
    refetchInterval: 20000,
  })

  if (!isAuthenticated) return <Login />
  if (!bootstrapped || !user || !capabilities) return <LoadingScreen />
  if (user.must_reset_password) return <ForcePasswordReset />

  const modules = capabilities.modules
  const hasBrewery = modules.includes('brewery')
  const canManageUsers = capabilities.can_manage_users
  const canManageSchedule = user.is_owner || (capabilities.manages_departments?.length ?? 0) > 0
  const isOwner = user.is_owner
  const pending = capabilities.pending_owner_reviews ?? 0

  // Department headings the user may see: their department keys (owners get all),
  // sorted alphabetically by label. Bar/Office/Sales appear even with no pages yet.
  const deptSections: NavSection[] = modules
    .filter((key) => key !== 'schedule' && DEPT_META[key])
    .map((key) => ({ key, meta: DEPT_META[key] }))
    .sort((a, b) => a.meta.label.localeCompare(b.meta.label))
    .map(({ key, meta }) => ({
      key: `dept:${key}`,
      label: meta.label,
      icon: meta.icon,
      children: meta.children,
      emptyLabel: 'Coming soon',
    }))

  const sections: NavSection[] = [
    {
      key: 'schedule',
      label: 'Schedule',
      icon: <CalendarMonthIcon />,
      children: [
        { label: 'View Schedule', path: '/schedule', icon: <ViewAgendaIcon /> },
        ...(canManageSchedule
          ? [{ label: 'Scheduler', path: '/scheduler', icon: <GridViewIcon /> }]
          : []),
        { label: 'Time off', path: '/time_off', icon: <EventBusyIcon /> },
      ],
    },
    ...deptSections,
    ...(canManageUsers
      ? [
          {
            key: 'admin',
            label: 'Admin',
            icon: <AdminPanelSettingsIcon />,
            children: [{ label: 'Users & Roles', path: '/users', icon: <PeopleIcon /> }],
          },
        ]
      : []),
    {
      key: 'messages',
      label: 'Messages',
      icon: <ForumIcon />,
      children: [
        {
          label: 'Channels',
          path: '/messages',
          icon: (
            <Badge badgeContent={messagesUnread} color="error">
              <TagIcon />
            </Badge>
          ),
        },
        ...(isOwner
          ? [
              {
                label: 'Alerts',
                path: '/activity',
                icon: (
                  <Badge badgeContent={pending} color="error">
                    <CampaignIcon />
                  </Badge>
                ),
              },
            ]
          : []),
      ],
    },
  ]

  // Non-brewery users land on the schedule (available to everyone signed in).
  const landing = hasBrewery ? null : '/schedule'

  const currentWidth = collapsed ? DRAWER_COLLAPSED_WIDTH : DRAWER_WIDTH

  const isSelected = (path: string) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname === path || location.pathname.startsWith(path + '/')

  // A section is open if the user toggled it, else auto-open when it holds the
  // active route (and the Schedule section defaults open).
  const sectionOpen = (s: NavSection) =>
    openOverride[s.key] ?? (s.key === 'schedule' || s.children.some((c) => isSelected(c.path)))

  const toggleSection = (s: NavSection) =>
    setOpenOverride((o) => ({ ...o, [s.key]: !sectionOpen(s) }))

  const go = (path: string, isMobile: boolean) => {
    navigate(path)
    if (isMobile) setMobileOpen(false)
  }

  const drawerContent = (isMobile: boolean) => {
    const rail = collapsed && !isMobile
    return (
      <Box sx={{ pt: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            position: 'relative',
            px: rail ? 0.5 : 2,
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
            sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: rail ? 0 : '-10px' }}
            onClick={() => go('/', isMobile)}
          >
            <img
              src="/rockcut-logo.png"
              alt="Rockcut Brewing Co"
              style={{
                width: rail ? 40 : 120,
                transition: 'width 0.2s ease',
              }}
            />
          </Box>
        </Box>

        {rail ? (
          // Collapsed rail: section icons only; a click reopens the drawer + section.
          <List sx={{ flexGrow: 1 }}>
            {sections.map((s) => (
              <Tooltip key={s.key} title={s.label} placement="right" arrow>
                <ListItemButton
                  onClick={() => {
                    setCollapsed(false)
                    setOpenOverride((o) => ({ ...o, [s.key]: true }))
                  }}
                  sx={{ mx: 0.5, borderRadius: 1, justifyContent: 'center', px: 1.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center' }}>{s.icon}</ListItemIcon>
                </ListItemButton>
              </Tooltip>
            ))}
          </List>
        ) : (
          <List sx={{ flexGrow: 1 }}>
            {sections.map((s) => {
              const open = sectionOpen(s)
              return (
                <Box key={s.key}>
                  <ListItemButton onClick={() => toggleSection(s)} sx={{ mx: 1, borderRadius: 1 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>{s.icon}</ListItemIcon>
                    <ListItemText primary={s.label} primaryTypographyProps={{ fontWeight: 600 }} />
                    {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                  </ListItemButton>
                  <Collapse in={open} timeout="auto" unmountOnExit>
                    <List disablePadding>
                      {s.children.length === 0 ? (
                        <ListItemButton disabled sx={{ pl: 4, mx: 1, borderRadius: 1 }}>
                          <ListItemText
                            primary={s.emptyLabel ?? '—'}
                            primaryTypographyProps={{ variant: 'body2', fontStyle: 'italic' }}
                          />
                        </ListItemButton>
                      ) : (
                        s.children.map((c) => (
                          <ListItemButton
                            key={c.path}
                            selected={isSelected(c.path)}
                            onClick={() => go(c.path, isMobile)}
                            sx={{ pl: 3, mx: 1, borderRadius: 1 }}
                          >
                            <ListItemIcon sx={{ minWidth: 32 }}>{c.icon}</ListItemIcon>
                            <ListItemText primary={c.label} />
                          </ListItemButton>
                        ))
                      )}
                    </List>
                  </Collapse>
                </Box>
              )
            })}
          </List>
        )}
      </Box>
    )
  }

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

            <NotificationBell />

            <Typography variant="body2" color="text.secondary" sx={{ mr: 1, ml: 1, display: { xs: 'none', sm: 'block' } }}>
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
            <Route path="/schedule" element={<Schedule forceView="agenda" />} />
            {canManageSchedule && <Route path="/scheduler" element={<Schedule forceView="week" />} />}
            <Route path="/time_off" element={<TimeOff />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:key" element={<Messages />} />
            {canManageUsers && <Route path="/users" element={<UserManagement />} />}
            {isOwner && <Route path="/activity" element={<OwnerActivity />} />}
          </Routes>
        </Box>
      </Box>

      <InstallPrompt />
    </Box>
  )
}

export default App
